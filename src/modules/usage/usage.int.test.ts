import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createNotebook, deleteNotebook } from '@/modules/notebooks';
import { createVisitor } from '@/modules/visitors';
import { closeDb } from '@/platform/db';
import { MODELS } from '@/platform/llm';
import { resetDatabase } from '@/test/database';

import { recordUsage, spendSince } from '.';

let visitor: string;
let notebook: string;
const start = new Date(Date.now() - 1_000);

beforeEach(async () => {
  await resetDatabase();
  visitor = await createVisitor({ ipHash: null });
  notebook = (await createNotebook(visitor, 'Wärmewende')).id;
});
afterAll(closeDb);

const haikuCall = {
  feature: 'chat' as const,
  model: MODELS.chat,
  inputTokens: 10_000,
  outputTokens: 1_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

describe('recordUsage', () => {
  it('appends one event per LLM call with its cost', async () => {
    const event = await recordUsage({ visitorId: visitor, notebookId: notebook, ...haikuCall });
    expect(event).toMatchObject({
      visitorId: visitor,
      notebookId: notebook,
      feature: 'chat',
      model: MODELS.chat,
      costMicroUsd: 1_500,
    });
  });
});

describe('spendSince', () => {
  it('adds up the cost of every event since a moment, overall or for one Visitor', async () => {
    const other = await createVisitor({ ipHash: null });
    await recordUsage({ visitorId: visitor, notebookId: notebook, ...haikuCall });
    await recordUsage({ visitorId: other, notebookId: null, ...haikuCall });

    expect(await spendSince({ since: start })).toBe(3_000);
    expect(await spendSince({ since: start, visitorId: visitor })).toBe(1_500);
    expect(await spendSince({ since: new Date(Date.now() + 60_000) })).toBe(0);
  });

  it('keeps the spend when the Notebook is deleted', async () => {
    await recordUsage({ visitorId: visitor, notebookId: notebook, ...haikuCall });
    await deleteNotebook(visitor, notebook);
    expect(await spendSince({ since: start, visitorId: visitor })).toBe(1_500);
  });
});
