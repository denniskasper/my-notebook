import { and, desc, eq, lt } from 'drizzle-orm';

import { messagePartsSchema, type MessagePart } from '@/modules/chat';
import { getNotebook } from '@/modules/notebooks';
import { db } from '@/platform/db';
import { logger } from '@/platform/logging';

import { studioOutputs } from './schema';

// A Briefing takes up to a minute or two; one older than this lost its process.
export const PROCESSING_STALE_AFTER_MS = 5 * 60_000;

type StudioOutputRow = typeof studioOutputs.$inferSelect;

export type StudioOutput = Omit<StudioOutputRow, 'content' | 'notebookId'> & {
  content: MessagePart[];
};

/** Content is jsonb: a row that doesn't parse shows as empty instead of breaking the page. */
export function toStudioOutput(row: StudioOutputRow): StudioOutput {
  const parsed = messagePartsSchema.safeParse(row.content);
  if (!parsed.success) {
    logger().error({ event: 'studio.invalid_content', outputId: row.id, err: parsed.error });
  }
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    content: parsed.success ? parsed.data : [],
    errorCode: row.errorCode,
    createdAt: row.createdAt,
  };
}

/** The Notebook's Studio outputs, newest first; empty for another Visitor's Notebook. */
export async function listStudioOutputs(
  visitorId: string,
  notebookId: string,
): Promise<StudioOutput[]> {
  if (!(await getNotebook(visitorId, notebookId))) return [];
  const rows = await db()
    .select()
    .from(studioOutputs)
    .where(eq(studioOutputs.notebookId, notebookId))
    .orderBy(desc(studioOutputs.id));
  return rows.map(toStudioOutput);
}

/**
 * Fails Studio outputs `processing` since before `olderThan` as `interrupted`:
 * the process generating them is gone (e.g. replaced by a deploy).
 */
export async function failStaleStudioOutputs(input: { olderThan: Date }): Promise<number> {
  const rows = await db()
    .update(studioOutputs)
    .set({ status: 'failed', errorCode: 'interrupted' })
    .where(
      and(eq(studioOutputs.status, 'processing'), lt(studioOutputs.createdAt, input.olderThan)),
    )
    .returning({ id: studioOutputs.id });
  return rows.length;
}
