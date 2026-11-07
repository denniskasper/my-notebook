import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { answerQuestion } from '@/modules/chat';
import { createNotebook } from '@/modules/notebooks';
import { createNote } from '@/modules/notes';
import { addTextSource, processSource } from '@/modules/sources';
import { recordUsage, spendSince } from '@/modules/usage';
import { closeDb, db } from '@/platform/db';
import { MODELS } from '@/platform/llm';
import { resetDatabase } from '@/test/database';

import { createVisitor, purgeInactiveVisitors, VISITOR_INACTIVE_AFTER_MS } from '.';
import { visitors } from './schema';

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(resetDatabase);
afterAll(closeDb);

/** A Visitor with a Notebook holding a Source, a Chat answer, a Note and spend. */
async function visitorWithContent(): Promise<string> {
  const visitorId = await createVisitor({ ipHash: null });
  const notebookId = (await createNotebook(visitorId, 'Wärmewende')).id;
  const source = await addTextSource(visitorId, notebookId, {
    title: 'Heizungsgesetz',
    text: 'Erster Absatz.\n\nZweiter Absatz.',
  });
  if (!source) throw new Error('Source was not added');
  await processSource(source.id);
  await answerQuestion(
    { visitorId, notebookId, question: 'Was gilt?' },
    { signal: new AbortController().signal, onEvent: () => {} },
  );
  await createNote(visitorId, notebookId, { title: 'Fristen', body: 'Merken.', citations: {} });
  await recordUsage({
    visitorId,
    notebookId,
    feature: 'chat',
    model: MODELS.chat,
    inputTokens: 1_000,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
  return visitorId;
}

async function lastSeen(visitorId: string, at: Date): Promise<void> {
  await db().update(visitors).set({ lastSeenAt: at }).where(eq(visitors.id, visitorId));
}

const COUNTED = [
  'visitors',
  'notebooks',
  'sources',
  'passages',
  'messages',
  'notes',
  'usage_events',
] as const;

/** Rows per table: the cascades are the database's job, so the test looks there. */
async function rowCounts(): Promise<Record<(typeof COUNTED)[number] | 'orphanedUsage', number>> {
  const count = async (query: ReturnType<typeof sql>) =>
    Number((await db().execute<{ n: string }>(query)).rows[0]?.n);
  const entries = await Promise.all(
    COUNTED.map(async (table) => [
      table,
      await count(sql`select count(*) as n from ${sql.identifier(table)}`),
    ]),
  );
  return {
    ...Object.fromEntries(entries),
    orphanedUsage: await count(
      sql`select count(*) as n from usage_events where visitor_id is null and notebook_id is null`,
    ),
  };
}

describe('purgeInactiveVisitors', () => {
  it('deletes Visitors inactive for 30 days with everything they own, keeping their spend', async () => {
    const now = new Date();
    const inactive = await visitorWithContent();
    const active = await visitorWithContent();
    await lastSeen(inactive, new Date(now.getTime() - 31 * DAY_MS));
    await lastSeen(active, new Date(now.getTime() - 29 * DAY_MS));
    const spendBefore = await spendSince({ since: new Date(0) });
    const before = await rowCounts();

    expect(await purgeInactiveVisitors(now)).toBe(1);

    const after = await rowCounts();
    expect(after).toEqual({
      visitors: 1,
      notebooks: before.notebooks / 2,
      sources: before.sources / 2,
      passages: before.passages / 2,
      messages: before.messages / 2,
      notes: before.notes / 2,
      usage_events: before.usage_events,
      orphanedUsage: before.usage_events / 2,
    });
    expect(await spendSince({ since: new Date(0) })).toBe(spendBefore);
    expect(spendBefore).toBeGreaterThan(0);
  });

  it('spares a Visitor seen exactly at the cut-off', async () => {
    const now = new Date();
    const visitorId = await createVisitor({ ipHash: null });
    await lastSeen(visitorId, new Date(now.getTime() - VISITOR_INACTIVE_AFTER_MS));

    expect(await purgeInactiveVisitors(now)).toBe(0);
  });
});
