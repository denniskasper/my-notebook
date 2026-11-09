import { z } from 'zod';

import { getNotebook } from '@/modules/notebooks';
import { listPromptSources } from '@/modules/sources';
import {
  estimateOutputTokens,
  recordUsage,
  releaseUsage,
  reserveUsage,
  type UsageBlock,
} from '@/modules/usage';
import { llm, type ChatRequest, type LlmUsage } from '@/platform/llm';
import { logger } from '@/platform/logging';

import { toCitation, type Citation, type PromptDocument } from './citations';
import type { TextPart } from './parts';
import { buildChatRequest, historyBudget, trimHistory } from './prompt';
import { finishAnswer, listHistory, startExchange } from './store';

export const QUESTION_MAX_LENGTH = 4_000;

/** A Chat question: trimmed, 1–4000 characters. */
export const questionSchema = z.string().trim().min(1).max(QUESTION_MAX_LENGTH);

export type ChatErrorCode =
  | 'not_found'
  | 'invalid_question'
  | 'no_active_sources'
  | 'chat_busy'
  | 'llm_failed'
  | UsageBlock['reason'];

/** What a streamed answer reports, in order (the Route Handler sends them as SSE). */
export type ChatEvent =
  | { type: 'started'; userMessageId: string; assistantMessageId: string }
  | { type: 'text'; part: number; text: string }
  | { type: 'citation'; part: number; citation: Citation }
  | { type: 'done'; status: 'complete' | 'stopped' }
  /** `retryAt` (ISO): when a Budget guard refusal ends, if it ends on its own. */
  | { type: 'error'; error: ChatErrorCode; retryAt?: string };

type Options = {
  /** Aborted when the Visitor stops the answer (or goes away). */
  signal: AbortSignal;
  /** Awaited before the next event is read, for consumers that need ordering or backpressure. */
  onEvent: (event: ChatEvent) => void | Promise<void>;
};

/**
 * Answers a question from the Notebook's enabled Sources: stores the question
 * and a `streaming` answer, streams the answer with its Citations, and stores
 * it as `complete`, `stopped` (signal aborted) or `failed`. Every LLM call is
 * recorded in the usage ledger, an aborted one with its output estimated.
 * The Budget guard is checked first; a refused question stores nothing.
 */
export async function answerQuestion(
  input: { visitorId: string; notebookId: string; question: string },
  { signal, onEvent }: Options,
): Promise<void> {
  const emit = async (event: ChatEvent) => {
    try {
      await onEvent(event);
    } catch (error) {
      // The consumer is gone; the answer is still finished and stored.
      logger().debug({ event: 'chat.emit_failed', err: error });
    }
  };

  const question = questionSchema.safeParse(input.question);
  if (!question.success) return emit({ type: 'error', error: 'invalid_question' });
  const { visitorId, notebookId } = input;
  if (!(await getNotebook(visitorId, notebookId)))
    return emit({ type: 'error', error: 'not_found' });

  const sources = await listPromptSources(visitorId, notebookId);
  if (sources.length === 0) return emit({ type: 'error', error: 'no_active_sources' });

  const reservation = await reserveUsage({ visitorId, feature: 'chat' });
  if (!reservation.ok) {
    const { block } = reservation;
    logger().info({ event: 'chat.refused', reason: block.reason });
    return emit({
      type: 'error',
      error: block.reason,
      ...(block.retryAt && { retryAt: block.retryAt.toISOString() }),
    });
  }

  try {
    const history = await listHistory(visitorId, notebookId);
    const sourceTokens = sources.reduce((sum, source) => sum + source.tokenCount, 0);
    const { request, documents } = buildChatRequest({
      sources,
      history: trimHistory(history, { budgetTokens: historyBudget(sourceTokens) }),
      question: question.data,
    });

    const started = await startExchange({ notebookId, question: question.data, mode: 'chat' });
    if (!started) return emit({ type: 'error', error: 'chat_busy' });
    await emit({ type: 'started', ...started });

    const answer = await streamAnswer(request, documents, { signal, emit });
    // Usage first: the call is billed even if storing the answer fails.
    await recordAnswerUsage({ visitorId, notebookId }, answer);
    const stored = await finishAnswer(started.assistantMessageId, {
      status: answer.status,
      parts: answer.parts,
      errorCode: answer.status === 'failed' ? 'llm_failed' : null,
    });
    logger().info({
      event: stored ? `chat.${answer.status}` : 'chat.finish_skipped',
      messageId: started.assistantMessageId,
    });

    if (answer.status === 'failed') await emit({ type: 'error', error: 'llm_failed' });
    else await emit({ type: 'done', status: answer.status });
  } finally {
    await releaseUsage(reservation.reservationId).catch((error: unknown) =>
      logger().error({ event: 'usage.release_failed', err: error }),
    );
  }
}

const emptyTextPart = (): TextPart => ({ type: 'text', text: '', citations: [] });

type Answer = {
  status: 'complete' | 'stopped' | 'failed';
  parts: TextPart[];
  streamedChars: number;
  /** As of the stream's start (input only) and, if it finished, its end. */
  startUsage: LlmUsage | null;
  finalUsage: LlmUsage | null;
};

async function streamAnswer(
  request: ChatRequest,
  documents: PromptDocument[],
  { signal, emit }: { signal: AbortSignal; emit: (event: ChatEvent) => Promise<void> },
): Promise<Answer> {
  const answer: Answer = {
    status: 'complete',
    parts: [],
    streamedChars: 0,
    startUsage: null,
    finalUsage: null,
  };
  // Text or a Citation before any block opened still needs a part to land in.
  const current = (): { index: number; part: TextPart } => {
    let part = answer.parts.at(-1);
    if (!part) {
      part = emptyTextPart();
      answer.parts.push(part);
    }
    return { index: answer.parts.length - 1, part };
  };

  try {
    for await (const event of llm().streamChat(request, { signal })) {
      switch (event.type) {
        case 'started':
          answer.startUsage = event.usage;
          break;
        case 'text_block':
          answer.parts.push(emptyTextPart());
          break;
        case 'text': {
          const { index, part } = current();
          part.text += event.text;
          answer.streamedChars += event.text.length;
          await emit({ type: 'text', part: index, text: event.text });
          break;
        }
        case 'citation': {
          const citation = toCitation(event.citation, documents);
          if (!citation) {
            logger().warn({ event: 'chat.citation_unmapped', citation: event.citation });
            break;
          }
          const { index, part } = current();
          part.citations.push(citation);
          await emit({ type: 'citation', part: index, citation });
          break;
        }
        case 'finished':
          answer.finalUsage = event.usage;
          if (event.stopReason === 'refusal') answer.status = 'failed';
          break;
      }
    }
  } catch (error) {
    if (signal.aborted) {
      answer.status = 'stopped';
    } else {
      answer.status = 'failed';
      logger().error({ event: 'chat.llm_failed', err: error });
    }
  }
  return answer;
}

async function recordAnswerUsage(
  scope: { visitorId: string; notebookId: string },
  answer: Answer,
): Promise<void> {
  // A stream that never started was not billed; one cut short reports no output, so estimate it.
  const usage =
    answer.finalUsage ??
    (answer.startUsage && {
      ...answer.startUsage,
      outputTokens: estimateOutputTokens(answer.streamedChars),
    });
  if (!usage) return;
  try {
    await recordUsage({ ...scope, feature: 'chat', ...usage });
  } catch (error) {
    logger().error({ event: 'usage.record_failed', err: error });
  }
}
