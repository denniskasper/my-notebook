import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/platform/db';

import { notebooks } from './schema';
import { notebookTitleSchema } from './title';

export type Notebook = typeof notebooks.$inferSelect;

// Every query below is scoped by Visitor: another Visitor's Notebook behaves as missing.
const owned = (visitorId: string, notebookId: string) =>
  and(eq(notebooks.visitorId, visitorId), eq(notebooks.id, notebookId));

/** The Visitor's Notebooks, most recently changed first. */
export async function listNotebooks(visitorId: string): Promise<Notebook[]> {
  return db()
    .select()
    .from(notebooks)
    .where(eq(notebooks.visitorId, visitorId))
    .orderBy(desc(notebooks.updatedAt), desc(notebooks.id));
}

export async function getNotebook(visitorId: string, notebookId: string): Promise<Notebook | null> {
  const [row] = await db().select().from(notebooks).where(owned(visitorId, notebookId));
  return row ?? null;
}

export async function createNotebook(visitorId: string, title: string): Promise<Notebook> {
  const [row] = await db()
    .insert(notebooks)
    .values({ visitorId, title: notebookTitleSchema.parse(title) })
    .returning();
  if (!row) throw new Error('Notebook insert returned no row');
  return row;
}

/** Renames the Notebook; null if the Visitor has no such Notebook. */
export async function renameNotebook(
  visitorId: string,
  notebookId: string,
  title: string,
): Promise<Notebook | null> {
  const [row] = await db()
    .update(notebooks)
    .set({ title: notebookTitleSchema.parse(title), updatedAt: new Date() })
    .where(owned(visitorId, notebookId))
    .returning();
  return row ?? null;
}

/** Hard-deletes the Notebook (its content cascades); false if there was none. */
export async function deleteNotebook(visitorId: string, notebookId: string): Promise<boolean> {
  const rows = await db()
    .delete(notebooks)
    .where(owned(visitorId, notebookId))
    .returning({ id: notebooks.id });
  return rows.length > 0;
}
