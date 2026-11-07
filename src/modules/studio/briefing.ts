import { and, eq, gt, sql } from 'drizzle-orm';

import { toCitation, type PromptDocument, type TextPart } from '@/modules/chat';
import { getNotebook } from '@/modules/notebooks';
import { listPromptSources } from '@/modules/sources';
import { checkUsage, estimateOutputTokens, recordUsage, type UsageBlock } from '@/modules/usage';
import { db } from '@/platform/db';
import { llm, type ChatRequest, type LlmUsage } from '@/platform/llm';
import { logger } from '@/platform/logging';

import { buildBriefingRequest } from './prompt';
import { studioOutputs } from './schema';
import { PROCESSING_STALE_AFTER_MS, toStudioOutput, type StudioOutput } from './store';

// Gives up well before the sweep would call the Briefing interrupted.
const BRIEFING_TIMEOUT_MS = 3 * 60_000;

export type StudioErrorCode =
  'not_found' | 'no_active_sources' | 'studio_busy' | UsageBlock['reason'];

export type StartBriefingResult =
  | { ok: true; output: StudioOutput }
  /** `retryAt`: when a Budget guard refusal ends, if it ends on its own. */
  | { ok: false; error: StudioErrorCode; retryAt?: Date };

/**
 * Starts a Briefing from the Notebook's enabled Sources: checks the Budget
 * guard (Briefing rate limit included) and inserts a `processing` row. The
 * caller then runs it with `runBriefing`, after the response. One Briefing at
 * a time per Notebook; a refusal stores nothing.
 */
export async function startBriefing(
  visitorId: string,
  notebookId: string,
): Promise<StartBriefingResult> {
  if (!(await getNotebook(visitorId, notebookId))) return { ok: false, error: 'not_found' };
  const sources = await listPromptSources(visitorId, notebookId);
  if (sources.length === 0) return { ok: false, error: 'no_active_sources' };

  const block = await checkUsage({ visitorId, feature: 'studio' });
  if (block) {
    logger().info({ event: 'studio.refused', reason: block.reason });
    return { ok: false, error: block.reason, ...(block.retryAt && { retryAt: block.retryAt }) };
  }

  const output = await db().transaction(async (tx) => {
    // Across concurrent requests too: a double click must not pay for two Briefings.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`studio:${notebookId}`}))`);
    const [processing] = await tx
      .select({ id: studioOutputs.id })
      .from(studioOutputs)
      .where(
        and(
          eq(studioOutputs.notebookId, notebookId),
          eq(studioOutputs.status, 'processing'),
          gt(studioOutputs.createdAt, new Date(Date.now() - PROCESSING_STALE_AFTER_MS)),
        ),
      )
      .limit(1);
    if (processing) return null;
    const [row] = await tx
      .insert(studioOutputs)
      .values({ notebookId, kind: 'briefing', status: 'processing' })
      .returning();
    if (!row) throw new Error('Studio output insert returned no row');
    return toStudioOutput(row);
  });
  if (!output) return { ok: false, error: 'studio_busy' };
  logger().info({ event: 'studio.started', outputId: output.id });
  return { ok: true, output };
}

/**
 * Generates a started Briefing and stores it as `complete` or `failed`; the
 * call is recorded in the usage ledger either way. Skips an output that is
 * gone or no longer `processing`. Never throws: it runs after the response.
 */
export async function runBriefing(visitorId: string, outputId: string): Promise<void> {
  try {
    const [row] = await db()
      .select({ notebookId: studioOutputs.notebookId, status: studioOutputs.status })
      .from(studioOutputs)
      .where(eq(studioOutputs.id, outputId));
    if (row?.status !== 'processing' || !(await getNotebook(visitorId, row.notebookId))) return;
    const { notebookId } = row;

    const sources = await listPromptSources(visitorId, notebookId);
    if (sources.length === 0) return await finish(outputId, failed('no_active_sources'));

    const { request, documents } = buildBriefingRequest(sources);
    const result = await streamBriefing(request, documents);
    // Usage first: the call is billed even if storing the Briefing fails.
    await recordBriefingUsage({ visitorId, notebookId }, result);
    await finish(outputId, result);
  } catch (error) {
    logger().error({ event: 'studio.run_failed', outputId, err: error });
    await finish(outputId, failed('llm_failed')).catch(() => undefined);
  }
}

type Result = {
  status: 'complete' | 'failed';
  errorCode: string | null;
  parts: TextPart[];
  streamedChars: number;
  startUsage: LlmUsage | null;
  finalUsage: LlmUsage | null;
};

const failed = (errorCode: string): Result => ({
  status: 'failed',
  errorCode,
  parts: [],
  streamedChars: 0,
  startUsage: null,
  finalUsage: null,
});

const emptyTextPart = (): TextPart => ({ type: 'text', text: '', citations: [] });

async function streamBriefing(request: ChatRequest, documents: PromptDocument[]): Promise<Result> {
  const result: Result = { ...failed('llm_failed'), status: 'complete', errorCode: null };
  // Text or a Citation before any block opened still needs a part to land in.
  const current = (): TextPart => {
    let part = result.parts.at(-1);
    if (!part) {
      part = emptyTextPart();
      result.parts.push(part);
    }
    return part;
  };

  try {
    const signal = AbortSignal.timeout(BRIEFING_TIMEOUT_MS);
    for await (const event of llm().streamBriefing(request, { signal })) {
      switch (event.type) {
        case 'started':
          result.startUsage = event.usage;
          break;
        case 'text_block':
          result.parts.push(emptyTextPart());
          break;
        case 'text':
          current().text += event.text;
          result.streamedChars += event.text.length;
          break;
        case 'citation': {
          const citation = toCitation(event.citation, documents);
          if (citation) current().citations.push(citation);
          else logger().warn({ event: 'studio.citation_unmapped', citation: event.citation });
          break;
        }
        case 'finished':
          result.finalUsage = event.usage;
          if (event.stopReason === 'refusal' || event.stopReason === 'max_tokens') {
            result.status = 'failed';
            result.errorCode = 'llm_failed';
          }
          break;
      }
    }
  } catch (error) {
    logger().error({ event: 'studio.llm_failed', err: error });
    result.status = 'failed';
    result.errorCode = 'llm_failed';
  }
  return result;
}

/** Stores the outcome, unless the output left `processing` (the sweep's `interrupted` stands) or is gone. */
async function finish(outputId: string, result: Result): Promise<void> {
  const content = result.parts.filter((part) => part.text !== '' || part.citations.length > 0);
  const [row] = await db()
    .update(studioOutputs)
    .set({
      content: result.status === 'complete' ? content : [],
      status: result.status,
      errorCode: result.errorCode,
    })
    .where(and(eq(studioOutputs.id, outputId), eq(studioOutputs.status, 'processing')))
    .returning({ id: studioOutputs.id });
  logger().info({ event: row ? `studio.${result.status}` : 'studio.finish_skipped', outputId });
}

async function recordBriefingUsage(
  scope: { visitorId: string; notebookId: string },
  result: Result,
): Promise<void> {
  // A stream that never started was not billed; one cut short reports no output, so estimate it.
  const usage =
    result.finalUsage ??
    (result.startUsage && {
      ...result.startUsage,
      outputTokens: estimateOutputTokens(result.streamedChars),
    });
  if (!usage) return;
  try {
    await recordUsage({ ...scope, feature: 'studio', ...usage });
  } catch (error) {
    logger().error({ event: 'usage.record_failed', err: error });
  }
}
