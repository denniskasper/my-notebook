import { and, asc, eq, lt, ne, sql } from 'drizzle-orm';

import { getNotebook } from '@/modules/notebooks';
import { db, type Database } from '@/platform/db';
import { env } from '@/platform/env';
import { llm } from '@/platform/llm';
import { logger } from '@/platform/logging';

import { sourceTextSchema, sourceTitleSchema, type SourceErrorCode } from './input';
import { splitIntoPassages } from './passages';
import { passages, sources } from './schema';
import { fitsTokenCap } from './token-cap';

export type Source = typeof sources.$inferSelect;
export type Passage = Omit<typeof passages.$inferSelect, 'sourceId'>;

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

// Sources are owned through their Notebook: another Visitor's Notebook behaves as missing.
async function ownsNotebook(visitorId: string, notebookId: string): Promise<boolean> {
  return (await getNotebook(visitorId, notebookId)) !== null;
}

const inNotebook = (notebookId: string, sourceId: string) =>
  and(eq(sources.notebookId, notebookId), eq(sources.id, sourceId));

/** The Notebook's Sources, oldest first (the order they were added). */
export async function listSources(visitorId: string, notebookId: string): Promise<Source[]> {
  if (!(await ownsNotebook(visitorId, notebookId))) return [];
  return db()
    .select()
    .from(sources)
    .where(eq(sources.notebookId, notebookId))
    .orderBy(asc(sources.createdAt), asc(sources.id));
}

/** A Source with its Passages in order, for the reader; null if the Visitor has no such Source. */
export async function getSourceWithPassages(
  visitorId: string,
  notebookId: string,
  sourceId: string,
): Promise<{ source: Source; passages: Passage[] } | null> {
  if (!(await ownsNotebook(visitorId, notebookId))) return null;
  const [source] = await db().select().from(sources).where(inNotebook(notebookId, sourceId));
  if (!source) return null;
  const rows = await db()
    .select({
      ordinal: passages.ordinal,
      text: passages.text,
      charStart: passages.charStart,
      charEnd: passages.charEnd,
      page: passages.page,
    })
    .from(passages)
    .where(eq(passages.sourceId, sourceId))
    .orderBy(asc(passages.ordinal));
  return { source, passages: rows };
}

/**
 * Adds a pasted text as a `processing` Source, already split into Passages (so
 * a retry can work from them); `processSource` then counts its tokens.
 * Throws on an invalid title or text; null if the Visitor has no such Notebook.
 */
export async function addTextSource(
  visitorId: string,
  notebookId: string,
  input: { title: string; text: string },
): Promise<Source | null> {
  const title = sourceTitleSchema.parse(input.title);
  const drafts = splitIntoPassages(sourceTextSchema.parse(input.text));
  if (!(await ownsNotebook(visitorId, notebookId))) return null;

  return db().transaction(async (tx) => {
    const [source] = await tx
      .insert(sources)
      .values({ notebookId, kind: 'text', title })
      .returning();
    if (!source) throw new Error('Source insert returned no row');
    await tx.insert(passages).values(drafts.map((draft) => ({ sourceId: source.id, ...draft })));
    return source;
  });
}

/**
 * Works a `processing` Source to `ready` (token count set, within the cap) or
 * `failed` with an error code. Runs in-process after the request that added it.
 */
export async function processSource(sourceId: string): Promise<Source> {
  const texts = await db()
    .select({ text: passages.text })
    .from(passages)
    .where(eq(passages.sourceId, sourceId))
    .orderBy(asc(passages.ordinal));

  let tokenCount: number;
  try {
    tokenCount = await llm().countTokens(texts.map((row) => row.text).join('\n\n'));
  } catch (error) {
    logger().warn({ event: 'source.token_count_failed', sourceId, err: error });
    return finish(sourceId, { status: 'failed', errorCode: 'token_count_failed' });
  }

  return db().transaction(async (tx) => {
    const [source] = await tx.select().from(sources).where(eq(sources.id, sourceId));
    if (!source) throw new Error(`Source ${sourceId} not found`);
    await lockNotebook(tx, source.notebookId);
    const fits = fitsTokenCap({
      enabledTokens: await enabledTokenCounts(tx, source.notebookId, sourceId),
      addingTokens: tokenCount,
      cap: env().SOURCE_TOKEN_CAP,
    });
    return finish(
      sourceId,
      fits
        ? { status: 'ready', errorCode: null, tokenCount }
        : { status: 'failed', errorCode: 'token_cap_exceeded', tokenCount },
      tx,
    );
  });
}

type Outcome =
  | { status: 'ready'; errorCode: null; tokenCount: number }
  | { status: 'failed'; errorCode: SourceErrorCode; tokenCount?: number };

async function finish(
  sourceId: string,
  outcome: Outcome,
  tx: Transaction | Database = db(),
): Promise<Source> {
  const [row] = await tx
    .update(sources)
    .set({ ...outcome, statusChangedAt: new Date() })
    .where(eq(sources.id, sourceId))
    .returning();
  if (!row) throw new Error(`Source ${sourceId} not found`);
  logger().info({ event: `source.${outcome.status}`, sourceId, errorCode: outcome.errorCode });
  return row;
}

/** Serialises cap checks per Notebook, so two Sources can't both squeeze under the cap. */
async function lockNotebook(tx: Transaction, notebookId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${notebookId}))`);
}

/** Token counts of the Notebook's enabled, ready Sources other than `exceptSourceId`. */
async function enabledTokenCounts(
  tx: Transaction,
  notebookId: string,
  exceptSourceId: string,
): Promise<number[]> {
  const rows = await tx
    .select({ tokenCount: sources.tokenCount })
    .from(sources)
    .where(
      and(
        eq(sources.notebookId, notebookId),
        eq(sources.enabled, true),
        eq(sources.status, 'ready'),
        ne(sources.id, exceptSourceId),
      ),
    );
  return rows.map((row) => row.tokenCount ?? 0);
}

export type SetEnabledResult =
  { ok: true; source: Source } | { ok: false; error: 'source_not_found' | 'token_cap_exceeded' };

/** Switches a Source on or off; switching on is rejected if it would exceed the token cap. */
export async function setSourceEnabled(
  visitorId: string,
  notebookId: string,
  sourceId: string,
  enabled: boolean,
): Promise<SetEnabledResult> {
  if (!(await ownsNotebook(visitorId, notebookId))) return { ok: false, error: 'source_not_found' };

  return db().transaction(async (tx): Promise<SetEnabledResult> => {
    await lockNotebook(tx, notebookId);
    const [source] = await tx.select().from(sources).where(inNotebook(notebookId, sourceId));
    if (!source) return { ok: false, error: 'source_not_found' };

    // Only a ready Source counts against the cap; others are checked when they finish.
    if (enabled && !source.enabled && source.status === 'ready') {
      const fits = fitsTokenCap({
        enabledTokens: await enabledTokenCounts(tx, notebookId, sourceId),
        addingTokens: source.tokenCount ?? 0,
        cap: env().SOURCE_TOKEN_CAP,
      });
      if (!fits) return { ok: false, error: 'token_cap_exceeded' };
    }

    const [row] = await tx
      .update(sources)
      .set({ enabled })
      .where(inNotebook(notebookId, sourceId))
      .returning();
    if (!row) return { ok: false, error: 'source_not_found' };
    return { ok: true, source: row };
  });
}

/** Hard-deletes the Source (its Passages cascade); false if there was none. */
export async function deleteSource(
  visitorId: string,
  notebookId: string,
  sourceId: string,
): Promise<boolean> {
  if (!(await ownsNotebook(visitorId, notebookId))) return false;
  const rows = await db()
    .delete(sources)
    .where(inNotebook(notebookId, sourceId))
    .returning({ id: sources.id });
  return rows.length > 0;
}

/** Puts a `failed` Source back to `processing`; null unless the Visitor has such a failed Source. */
export async function retrySource(
  visitorId: string,
  notebookId: string,
  sourceId: string,
): Promise<Source | null> {
  if (!(await ownsNotebook(visitorId, notebookId))) return null;
  const [row] = await db()
    .update(sources)
    .set({ status: 'processing', errorCode: null, statusChangedAt: new Date() })
    .where(and(inNotebook(notebookId, sourceId), eq(sources.status, 'failed')))
    .returning();
  return row ?? null;
}

/**
 * Fails Sources that have been `processing` since before `olderThan` as
 * `interrupted`: the process working them is gone (e.g. replaced by a deploy).
 */
export async function failStaleSources(input: { olderThan: Date }): Promise<number> {
  const rows = await db()
    .update(sources)
    .set({ status: 'failed', errorCode: 'interrupted', statusChangedAt: new Date() })
    .where(and(eq(sources.status, 'processing'), lt(sources.statusChangedAt, input.olderThan)))
    .returning({ id: sources.id });
  return rows.length;
}
