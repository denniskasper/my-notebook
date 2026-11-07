import { and, desc, eq } from 'drizzle-orm';

import { getAnswer } from '@/modules/chat';
import { getNotebook } from '@/modules/notebooks';
import { db } from '@/platform/db';
import { logger } from '@/platform/logging';

import { noteBodySchema, noteTitleFrom, noteTitleSchema } from './input';
import { noteCitationsSchema, noteFromAnswer, pruneCitations, type NoteCitations } from './markers';
import { notes } from './schema';

type NoteRow = typeof notes.$inferSelect;

export type Note = Omit<NoteRow, 'notebookId' | 'citations'> & { citations: NoteCitations };

/** Citations are jsonb: a row that doesn't parse shows without chips instead of breaking the page. */
function toNote(row: NoteRow): Note {
  const parsed = noteCitationsSchema.safeParse(row.citations);
  if (!parsed.success) {
    logger().error({ event: 'notes.invalid_citations', noteId: row.id, err: parsed.error });
  }
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    citations: parsed.success ? parsed.data : {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type NoteInput = { title: string; body: string; citations?: NoteCitations };

/** The Notebook's Notes, most recently changed first; empty for another Visitor's Notebook. */
export async function listNotes(visitorId: string, notebookId: string): Promise<Note[]> {
  if (!(await getNotebook(visitorId, notebookId))) return [];
  const rows = await db()
    .select()
    .from(notes)
    .where(eq(notes.notebookId, notebookId))
    .orderBy(desc(notes.updatedAt), desc(notes.id));
  return rows.map(toNote);
}

/**
 * Adds a Note (by hand, from an answer or by the Agent); Citations without a
 * marker in the body are dropped. Null if the Visitor has no such Notebook.
 */
export async function createNote(
  visitorId: string,
  notebookId: string,
  input: NoteInput,
): Promise<Note | null> {
  if (!(await getNotebook(visitorId, notebookId))) return null;
  const body = noteBodySchema.parse(input.body);
  const [row] = await db()
    .insert(notes)
    .values({
      notebookId,
      title: noteTitleSchema.parse(input.title),
      body,
      citations: pruneCitations(body, noteCitationsSchema.parse(input.citations ?? {})),
    })
    .returning();
  if (!row) throw new Error('Note insert returned no row');
  return toNote(row);
}

const inNotebook = (notebookId: string, noteId: string) =>
  and(eq(notes.notebookId, notebookId), eq(notes.id, noteId));

/**
 * Saves an edited title and body. The stored Citations are kept for the
 * markers the body still has and pruned otherwise; null if there is no such Note.
 */
export async function updateNote(
  visitorId: string,
  notebookId: string,
  noteId: string,
  input: { title: string; body: string },
): Promise<Note | null> {
  if (!(await getNotebook(visitorId, notebookId))) return null;
  const title = noteTitleSchema.parse(input.title);
  const body = noteBodySchema.parse(input.body);
  return db().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(notes)
      .where(inNotebook(notebookId, noteId))
      .for('update');
    if (!current) return null;
    const [row] = await tx
      .update(notes)
      .set({
        title,
        body,
        citations: pruneCitations(body, toNote(current).citations),
        updatedAt: new Date(),
      })
      .where(eq(notes.id, noteId))
      .returning();
    return row ? toNote(row) : null;
  });
}

/** Hard-deletes the Note; false if the Visitor has no such Note. */
export async function deleteNote(
  visitorId: string,
  notebookId: string,
  noteId: string,
): Promise<boolean> {
  if (!(await getNotebook(visitorId, notebookId))) return false;
  const rows = await db()
    .delete(notes)
    .where(inNotebook(notebookId, noteId))
    .returning({ id: notes.id });
  return rows.length > 0;
}

/**
 * Saves a Chat answer as a new Note: a copy of its text with `[n]` markers
 * and its Citations, titled by its question. Null if there is no such answer.
 */
export async function saveAnswerAsNote(
  visitorId: string,
  notebookId: string,
  messageId: string,
): Promise<Note | null> {
  const answer = await getAnswer(visitorId, notebookId, messageId);
  if (!answer) return null;
  const { body, citations } = noteFromAnswer(answer.parts);
  return createNote(visitorId, notebookId, {
    title: noteTitleFrom(answer.question ?? body),
    body,
    citations,
  });
}
