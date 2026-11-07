import { and, asc, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';

import { getNotebook } from '@/modules/notebooks';
import { db } from '@/platform/db';
import { logger } from '@/platform/logging';

import { messagePartsSchema, messageText, type MessagePart, type TextPart } from './parts';
import type { HistoryTurn } from './prompt';
import { messages } from './schema';

// An answer streams for seconds; one older than this lost its process.
export const STREAMING_STALE_AFTER_MS = 5 * 60_000;

type MessageRow = typeof messages.$inferSelect;

export type ChatMessage = Omit<MessageRow, 'parts' | 'notebookId'> & { parts: MessagePart[] };

/** Parts are jsonb: a row that doesn't parse shows as empty instead of breaking the page. */
function toChatMessage(row: MessageRow): ChatMessage {
  const parsed = messagePartsSchema.safeParse(row.parts);
  if (!parsed.success) {
    logger().error({ event: 'chat.invalid_parts', messageId: row.id, err: parsed.error });
  }
  return {
    id: row.id,
    role: row.role,
    mode: row.mode,
    parts: parsed.success ? parsed.data : [],
    status: row.status,
    errorCode: row.errorCode,
    costMicroUsd: row.costMicroUsd,
    createdAt: row.createdAt,
  };
}

/** The Notebook's conversation, oldest first; empty for another Visitor's Notebook. */
export async function listMessages(visitorId: string, notebookId: string): Promise<ChatMessage[]> {
  if (!(await getNotebook(visitorId, notebookId))) return [];
  const rows = await db()
    .select()
    .from(messages)
    .where(eq(messages.notebookId, notebookId))
    .orderBy(asc(messages.id));
  return rows.map(toChatMessage);
}

/** A finished answer and the question it answers (null if that is gone). */
export type Answer = { question: string | null; parts: MessagePart[] };

/**
 * The answer `messageId` with its question; null for a question, an answer
 * still streaming or failed, or a message outside the Visitor's Notebook.
 */
export async function getAnswer(
  visitorId: string,
  notebookId: string,
  messageId: string,
): Promise<Answer | null> {
  if (!(await getNotebook(visitorId, notebookId))) return null;
  const [row] = await db()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.notebookId, notebookId),
        eq(messages.id, messageId),
        eq(messages.role, 'assistant'),
        inArray(messages.status, ['complete', 'stopped']),
      ),
    );
  if (!row) return null;
  // The question is the user message just before the answer (ids are uuidv7, so ordered).
  const [question] = await db()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.notebookId, notebookId),
        eq(messages.role, 'user'),
        lt(messages.id, messageId),
      ),
    )
    .orderBy(desc(messages.id))
    .limit(1);
  return {
    question: question ? messageText(toChatMessage(question).parts) : null,
    parts: toChatMessage(row).parts,
  };
}

/** Deletes the Notebook's conversation; false if the Visitor has no such Notebook. */
export async function clearChat(visitorId: string, notebookId: string): Promise<boolean> {
  if (!(await getNotebook(visitorId, notebookId))) return false;
  await db().delete(messages).where(eq(messages.notebookId, notebookId));
  return true;
}

/**
 * Fails answers `streaming` since before `olderThan` as `interrupted`: the
 * process streaming them is gone (e.g. replaced by a deploy).
 */
export async function failStaleMessages(input: { olderThan: Date }): Promise<number> {
  const rows = await db()
    .update(messages)
    .set({ status: 'failed', errorCode: 'interrupted' })
    .where(and(eq(messages.status, 'streaming'), lt(messages.createdAt, input.olderThan)))
    .returning({ id: messages.id });
  return rows.length;
}

/** Earlier questions (Chat or Agent) with the text of their answers; failed or empty answers are left out. */
export async function listHistory(visitorId: string, notebookId: string): Promise<HistoryTurn[]> {
  const conversation = await listMessages(visitorId, notebookId);
  const turns: HistoryTurn[] = [];
  conversation.forEach((message, index) => {
    const reply = conversation[index + 1];
    if (message.role !== 'user' || reply?.role !== 'assistant') return;
    if (reply.status !== 'complete' && reply.status !== 'stopped') return;
    const answer = messageText(reply.parts);
    if (answer.trim() === '') return;
    turns.push({ question: messageText(message.parts), answer });
  });
  return turns;
}

/** The ids of a question and its answer, as `startExchange` stored them. */
export type Exchange = { userMessageId: string; assistantMessageId: string };

/**
 * Stores a question (Chat or Agent task) and a `streaming` answer; null while
 * another answer in the Notebook is still streaming. The caller has checked
 * that the Visitor owns the Notebook.
 */
export async function startExchange(input: {
  notebookId: string;
  question: string;
  mode: ChatMessage['mode'];
}): Promise<Exchange | null> {
  const { notebookId, question, mode } = input;
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

    const userPart: TextPart = { type: 'text', text: question, citations: [] };
    const [user] = await tx
      .insert(messages)
      .values({ notebookId, role: 'user', mode, parts: [userPart], status: 'complete' })
      .returning({ id: messages.id });
    const [assistant] = await tx
      .insert(messages)
      .values({ notebookId, role: 'assistant', mode, parts: [], status: 'streaming' })
      .returning({ id: messages.id });
    if (!user || !assistant) throw new Error('Message insert returned no row');
    return { userMessageId: user.id, assistantMessageId: assistant.id };
  });
}

/** Saves an answer's parts so far, while it is still streaming (an Agent run's Steps survive a reload). */
export async function saveStreamingParts(messageId: string, parts: MessagePart[]): Promise<void> {
  await db()
    .update(messages)
    .set({ parts })
    .where(and(eq(messages.id, messageId), eq(messages.status, 'streaming')));
}

/**
 * Stores an answer's outcome; false if it already left `streaming` (the
 * sweep's `interrupted` stands) or is gone. Empty text parts are dropped.
 */
export async function finishAnswer(
  messageId: string,
  outcome: {
    status: 'complete' | 'stopped' | 'failed';
    parts: MessagePart[];
    errorCode: string | null;
    /** What the run was charged (Agent runs). */
    costMicroUsd?: number | null;
  },
): Promise<boolean> {
  const parts = outcome.parts.filter(
    (part) => part.type !== 'text' || part.text !== '' || part.citations.length > 0,
  );
  const [row] = await db()
    .update(messages)
    .set({
      parts,
      status: outcome.status,
      errorCode: outcome.errorCode,
      costMicroUsd: outcome.costMicroUsd ?? null,
    })
    .where(and(eq(messages.id, messageId), eq(messages.status, 'streaming')))
    .returning({ id: messages.id });
  return row !== undefined;
}
