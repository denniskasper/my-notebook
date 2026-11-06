import { and, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getNotebook } from '@/modules/notebooks';
import { listPromptSources } from '@/modules/sources';
import { estimateOutputTokens, recordUsage } from '@/modules/usage';
import { db } from '@/platform/db';
import { llm, type ChatRequest, type LlmUsage } from '@/platform/llm';
import { logger } from '@/platform/logging';

import { toCitation, type Citation, type PromptDocument } from './citations';
import type { TextPart } from './parts';
import { buildChatRequest, historyBudget, trimHistory, type HistoryTurn } from './prompt';
import { messages } from './schema';
import { listMessages, STREAMING_STALE_AFTER_MS, type ChatMessage } from './store';

export const QUESTION_MAX_LENGTH = 4_000;

/** A Chat question: trimmed, 1–4000 characters. */
export const questionSchema = z.string().trim().min(1).max(QUESTION_MAX_LENGTH);

export type ChatErrorCode =
  'not_found' | 'invalid_question' | 'no_active_sources' | 'chat_busy' | 'llm_failed';

/** What a streamed answer reports, in order (the Route Handler sends them as SSE). */
export type ChatEvent =
  | { type: 'started'; userMessageId: string; assistantMessageId: string }
  | { type: 'text'; part: number; text: string }
  | { type: 'citation'; part: number; citation: Citation }
  | { type: 'done'; status: 'complete' | 'stopped' }
  | { type: 'error'; error: ChatErrorCode };

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

  const history = toHistory(await listMessages(visitorId, notebookId));
  const sourceTokens = sources.reduce((sum, source) => sum + source.tokenCount, 0);
  const { request, documents } = buildChatRequest({
    sources,
    history: trimHistory(history, { budgetTokens: historyBudget(sourceTokens) }),
    question: question.data,
  });

  const started = await startAnswer(notebookId, question.data);
  if (!started) return emit({ type: 'error', error: 'chat_busy' });
  await emit({ type: 'started', ...started });

  const answer = await streamAnswer(request, documents, { signal, emit });
  // Usage first: the call is billed even if storing the answer fails.
  await recordAnswerUsage({ visitorId, notebookId }, answer);
  await finishAnswer(started.assistantMessageId, answer);

  if (answer.status === 'failed') await emit({ type: 'error', error: 'llm_failed' });
  else await emit({ type: 'done', status: answer.status });
}

/** Earlier questions with the text of their answers; failed or empty answers are left out. */
function toHistory(conversation: readonly ChatMessage[]): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  conversation.forEach((message, index) => {
    const reply = conversation[index + 1];
    if (message.role !== 'user' || reply?.role !== 'assistant') return;
    if (reply.status !== 'complete' && reply.status !== 'stopped') return;
    const answer = reply.parts.map((part) => part.text).join('');
    if (answer.trim() === '') return;
    turns.push({ question: message.parts.map((part) => part.text).join(''), answer });
  });
  return turns;
}

/** Stores the question and a `streaming` answer; null while another answer is still streaming. */
async function startAnswer(
  notebookId: string,
  question: string,
): Promise<{ userMessageId: string; assistantMessageId: string } | null> {
  return db().transaction(async (tx) => {
    // One answer at a time per Notebook, also across concurrent requests.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`chat:${notebookId}`}))`);
    const [streaming] = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.notebookId, notebookId),
          eq(messages.status, 'streaming'),
          gt(messages.createdAt, new Date(Date.now() - STREAMING_STALE_AFTER_MS)),
        ),
      )
      .limit(1);
    if (streaming) return null;

    const userPart: TextPart = { ...emptyTextPart(), text: question };
    const [user] = await tx
      .insert(messages)
      .values({ notebookId, role: 'user', parts: [userPart], status: 'complete' })
      .returning({ id: messages.id });
    const [assistant] = await tx
      .insert(messages)
      .values({ notebookId, role: 'assistant', parts: [], status: 'streaming' })
      .returning({ id: messages.id });
    if (!user || !assistant) throw new Error('Message insert returned no row');
    return { userMessageId: user.id, assistantMessageId: assistant.id };
  });
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

/** Stores the outcome, unless the answer left `streaming` (the sweep's `interrupted` stands) or is gone. */
async function finishAnswer(messageId: string, answer: Answer): Promise<void> {
  const parts = answer.parts.filter((part) => part.text !== '' || part.citations.length > 0);
  const [row] = await db()
    .update(messages)
    .set({
      parts,
      status: answer.status,
      errorCode: answer.status === 'failed' ? 'llm_failed' : null,
    })
    .where(and(eq(messages.id, messageId), eq(messages.status, 'streaming')))
    .returning({ id: messages.id });
  logger().info({
    event: row ? `chat.${answer.status}` : 'chat.finish_skipped',
    messageId,
  });
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
