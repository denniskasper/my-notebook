import { and, asc, eq, lt, ne, sql } from 'drizzle-orm';

import { getNotebook } from '@/modules/notebooks';
import { db, type Database } from '@/platform/db';
import { env } from '@/platform/env';
import { llm } from '@/platform/llm';
import { logger } from '@/platform/logging';

import { sourceTextSchema, sourceTitleSchema, type SourceErrorCode } from './input';
import { splitIntoPassages, type PassageDraft } from './passages';
import { extractPdfPassages, titleFromFileName, type PdfError } from './pdf';
import type { PdfPassageDraft } from './pdf-passages';
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

  return insertSource({ notebookId, kind: 'text', title }, drafts);
}

export type AddPdfResult =
  { ok: true; source: Source } | { ok: false; error: PdfError | 'not_found' };

/**
 * Adds an uploaded PDF as a `processing` Source: its text layer is extracted
 * into page-aware Passages right away and the file itself is discarded.
 * A PDF without text (a scan), an unreadable or oversized file is rejected.
 */
export async function addPdfSource(
  visitorId: string,
  notebookId: string,
  input: { fileName: string; data: Uint8Array },
): Promise<AddPdfResult> {
  if (!(await ownsNotebook(visitorId, notebookId))) return { ok: false, error: 'not_found' };
  const extracted = await extractPdfPassages(input.data);
  if (!extracted.ok) return extracted;
  const title = sourceTitleSchema.parse(titleFromFileName(input.fileName));
  const source = await insertSource({ notebookId, kind: 'pdf', title }, extracted.passages);
  return { ok: true, source };
}

/** Inserts the Source and its Passages together, so a retry always has its Passages. */
async function insertSource(
  values: typeof sources.$inferInsert,
  drafts: PassageDraft[] | PdfPassageDraft[],
): Promise<Source> {
  return db().transaction(async (tx) => {
    const [source] = await tx.insert(sources).values(values).returning();
    if (!source) throw new Error('Source insert returned no row');
    await tx.insert(passages).values(drafts.map((draft) => ({ sourceId: source.id, ...draft })));
    return source;
  });
}

/**
 * Works a `processing` Source to `ready` (token count set, within the cap) or
 * `failed` with an error code. Runs in-process after the request that added it.
 * Null if the Source is no longer `processing`: deleted meanwhile, or already
 * failed as `interrupted` by the sweep, whose outcome stands.
 */
export async function processSource(sourceId: string): Promise<Source | null> {
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
    return finish(db(), sourceId, { status: 'failed', errorCode: 'token_count_failed' });
  }

  return db().transaction(async (tx) => {
    const [source] = await tx.select().from(sources).where(eq(sources.id, sourceId));
    if (!source) return skipped(sourceId);
    await lockNotebook(tx, source.notebookId);
    // A disabled Source adds nothing to the enabled total, so only an enabled one can exceed the cap.
    const fits = !source.enabled || (await fitsCap(tx, source.notebookId, sourceId, tokenCount));
    return finish(
      tx,
      sourceId,
      fits
        ? { status: 'ready', errorCode: null, tokenCount }
        : { status: 'failed', errorCode: 'token_cap_exceeded', tokenCount },
    );
  });
}

type Outcome =
  | { status: 'ready'; errorCode: null; tokenCount: number }
  | { status: 'failed'; errorCode: SourceErrorCode; tokenCount?: number };

/** Records the outcome, unless the Source has left `processing` (or is gone) in the meantime. */
async function finish(
  tx: Transaction | Database,
  sourceId: string,
  outcome: Outcome,
): Promise<Source | null> {
  const [row] = await tx
    .update(sources)
    .set({ ...outcome, statusChangedAt: new Date() })
    .where(and(eq(sources.id, sourceId), eq(sources.status, 'processing')))
    .returning();
  if (!row) return skipped(sourceId);
  logger().info({ event: `source.${outcome.status}`, sourceId, errorCode: outcome.errorCode });
  return row;
}

function skipped(sourceId: string): null {
  logger().info({ event: 'source.processing_skipped', sourceId });
  return null;
}

/** Serialises cap checks per Notebook, so two Sources can't both squeeze under the cap. */
async function lockNotebook(tx: Transaction, notebookId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${notebookId}))`);
}

/** Whether `tokens` more fit beside the Notebook's other enabled, ready Sources. */
async function fitsCap(
  tx: Transaction,
  notebookId: string,
  sourceId: string,
  tokens: number,
): Promise<boolean> {
  const rows = await tx
    .select({ tokenCount: sources.tokenCount })
    .from(sources)
    .where(
      and(
        eq(sources.notebookId, notebookId),
        eq(sources.enabled, true),
        eq(sources.status, 'ready'),
        ne(sources.id, sourceId),
      ),
    );
  return fitsTokenCap({
    enabledTokens: rows.map((row) => row.tokenCount ?? 0),
    addingTokens: tokens,
    cap: env().SOURCE_TOKEN_CAP,
  });
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
      const fits = await fitsCap(tx, notebookId, sourceId, source.tokenCount ?? 0);
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

/** An enabled, ready Source with its Passages: what Chat answers are grounded in. */
export type PromptSource = {
  id: string;
  title: string;
  tokenCount: number;
  passages: { ordinal: number; text: string }[];
};

/** The Notebook's enabled, ready Sources in the order they were added, with their Passages in order. */
export async function listPromptSources(
  visitorId: string,
  notebookId: string,
): Promise<PromptSource[]> {
  if (!(await ownsNotebook(visitorId, notebookId))) return [];
  const rows = await db()
    .select({
      id: sources.id,
      title: sources.title,
      tokenCount: sources.tokenCount,
      ordinal: passages.ordinal,
      text: passages.text,
    })
    .from(sources)
    .innerJoin(passages, eq(passages.sourceId, sources.id))
    .where(
      and(
        eq(sources.notebookId, notebookId),
        eq(sources.enabled, true),
        eq(sources.status, 'ready'),
      ),
    )
    .orderBy(asc(sources.createdAt), asc(sources.id), asc(passages.ordinal));

  const byId = new Map<string, PromptSource>();
  for (const row of rows) {
    let source = byId.get(row.id);
    if (!source) {
      source = { id: row.id, title: row.title, tokenCount: row.tokenCount ?? 0, passages: [] };
      byId.set(row.id, source);
    }
    source.passages.push({ ordinal: row.ordinal, text: row.text });
  }
  return [...byId.values()];
}
