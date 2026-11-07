import { and, asc, eq, lt } from 'drizzle-orm';

import { getNotebook } from '@/modules/notebooks';
import { db } from '@/platform/db';
import { logger } from '@/platform/logging';

import { messagePartsSchema, type MessagePart } from './parts';
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
