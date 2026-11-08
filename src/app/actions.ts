'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { z } from 'zod';

import { clearChat } from '@/modules/chat';
import {
  createNotebook,
  deleteNotebook,
  notebookTitleSchema,
  renameNotebook,
} from '@/modules/notebooks';
import {
  createNote,
  deleteNote,
  noteBodySchema,
  noteTitleSchema,
  saveAnswerAsNote,
  updateNote,
} from '@/modules/notes';
import {
  addTextSource,
  addUrlSource,
  deleteSource,
  processSource,
  retrySource,
  setSourceEnabled,
  sourceTextSchema,
  sourceTitleSchema,
} from '@/modules/sources';
import { runBriefing, startBriefing } from '@/modules/studio';
import { ensureVisitor, VisitorLimitError } from '@/modules/visitors';
import { requestLogger } from '@/platform/logging';
import type { ActionResult } from '@/ui/shell';
import type { StudioActionResult } from '@/ui/studio';
import { strings } from '@/ui/strings';

const notebookIdSchema = z.object({ notebookId: z.uuid() });
const renameSchema = notebookIdSchema.extend({ title: notebookTitleSchema });

export async function createNotebookAction(): Promise<void> {
  let visitorId: string;
  try {
    visitorId = await ensureVisitor();
  } catch (error) {
    if (!(error instanceof VisitorLimitError)) throw error;
    (await requestLogger()).warn({ event: 'visitor.limit_reached' });
    redirect('/?error=visitor_limit');
  }
  const notebook = await createNotebook(visitorId, strings.notebook.untitled);
  (await requestLogger()).info({ event: 'notebook.created', notebookId: notebook.id });
  revalidatePath('/', 'layout');
  redirect(`/notebooks/${notebook.id}`);
}

export async function renameNotebookAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = renameSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) {
    const titleInvalid = input.error.issues.some((issue) => issue.path[0] === 'title');
    return { ok: false, error: titleInvalid ? 'invalid_title' : 'not_found' };
  }
  const visitorId = await ensureVisitor();
  const notebook = await renameNotebook(visitorId, input.data.notebookId, input.data.title);
  if (!notebook) return { ok: false, error: 'not_found' };
  (await requestLogger()).info({ event: 'notebook.renamed', notebookId: notebook.id });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteNotebookAction(formData: FormData): Promise<void> {
  const input = notebookIdSchema.safeParse(Object.fromEntries(formData));
  if (input.success) {
    const visitorId = await ensureVisitor();
    if (await deleteNotebook(visitorId, input.data.notebookId)) {
      (await requestLogger()).info({
        event: 'notebook.deleted',
        notebookId: input.data.notebookId,
      });
    }
  }
  revalidatePath('/', 'layout');
  redirect('/');
}

const sourceIdSchema = notebookIdSchema.extend({ sourceId: z.uuid() });
const addTextSourceSchema = notebookIdSchema.extend({
  title: sourceTitleSchema,
  text: sourceTextSchema,
});
const setEnabledSchema = sourceIdSchema.extend({ enabled: z.enum(['true', 'false']) });

/** Works the Source after the response is sent; the sidebar polls until it is no longer processing. */
function processAfterResponse(sourceId: string): void {
  after(async () => {
    await processSource(sourceId);
  });
}

export async function addTextSourceAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = addTextSourceSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) {
    const field = input.error.issues[0]?.path[0];
    if (field === 'title') return { ok: false, error: 'invalid_source_title' };
    if (field === 'text') return { ok: false, error: 'invalid_source_text' };
    return { ok: false, error: 'not_found' };
  }
  const { notebookId, title, text } = input.data;
  const visitorId = await ensureVisitor();
  const source = await addTextSource(visitorId, notebookId, { title, text });
  if (!source) return { ok: false, error: 'not_found' };
  (await requestLogger()).info({ event: 'source.added', sourceId: source.id, kind: 'text' });
  processAfterResponse(source.id);
  revalidatePath(`/notebooks/${notebookId}`);
  return { ok: true };
}

const addUrlSourceSchema = notebookIdSchema.extend({ url: z.string() });

export async function addUrlSourceAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = addUrlSourceSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, error: 'not_found' };
  const { notebookId, url } = input.data;
  const visitorId = await ensureVisitor();
  const result = await addUrlSource(visitorId, notebookId, { url });
  if (!result.ok) return { ok: false, error: result.error };
  (await requestLogger()).info({ event: 'source.added', sourceId: result.source.id, kind: 'url' });
  processAfterResponse(result.source.id);
  revalidatePath(`/notebooks/${notebookId}`);
  return { ok: true };
}

export async function setSourceEnabledAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = setEnabledSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, error: 'source_not_found' };
  const { notebookId, sourceId, enabled } = input.data;
  const visitorId = await ensureVisitor();
  const result = await setSourceEnabled(visitorId, notebookId, sourceId, enabled === 'true');
  revalidatePath(`/notebooks/${notebookId}`);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function retrySourceAction(formData: FormData): Promise<void> {
  const input = sourceIdSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const { notebookId, sourceId } = input.data;
  const visitorId = await ensureVisitor();
  if (await retrySource(visitorId, notebookId, sourceId)) {
    (await requestLogger()).info({ event: 'source.retried', sourceId });
    processAfterResponse(sourceId);
  }
  revalidatePath(`/notebooks/${notebookId}`);
}

export async function deleteSourceAction(formData: FormData): Promise<void> {
  const input = sourceIdSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const { notebookId, sourceId } = input.data;
  const visitorId = await ensureVisitor();
  if (await deleteSource(visitorId, notebookId, sourceId)) {
    (await requestLogger()).info({ event: 'source.deleted', sourceId });
  }
  revalidatePath(`/notebooks/${notebookId}`);
}

export async function clearChatAction(formData: FormData): Promise<void> {
  const input = notebookIdSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const visitorId = await ensureVisitor();
  if (await clearChat(visitorId, input.data.notebookId)) {
    (await requestLogger()).info({ event: 'chat.cleared', notebookId: input.data.notebookId });
  }
  revalidatePath(`/notebooks/${input.data.notebookId}`);
}

const noteInputSchema = notebookIdSchema.extend({ title: noteTitleSchema, body: noteBodySchema });
const noteIdSchema = notebookIdSchema.extend({ noteId: z.uuid() });

/** Maps an invalid Note form onto the field it failed on. */
function noteInputError(error: z.ZodError): ActionResult {
  const field = error.issues[0]?.path[0];
  if (field === 'title') return { ok: false, error: 'invalid_note_title' };
  if (field === 'body') return { ok: false, error: 'invalid_note_body' };
  if (field === 'noteId') return { ok: false, error: 'note_not_found' };
  return { ok: false, error: 'not_found' };
}

/** Creates a hand-written Note and opens it in the Notes tab. */
export async function createNoteAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = noteInputSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return noteInputError(input.error);
  const { notebookId, title, body } = input.data;
  const visitorId = await ensureVisitor();
  const note = await createNote(visitorId, notebookId, { title, body });
  if (!note) return { ok: false, error: 'not_found' };
  (await requestLogger()).info({ event: 'note.created', noteId: note.id });
  revalidatePath(`/notebooks/${notebookId}`);
  redirect(`/notebooks/${notebookId}?note=${note.id}`);
}

export async function updateNoteAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = noteInputSchema.extend(noteIdSchema.shape).safeParse(Object.fromEntries(formData));
  if (!input.success) return noteInputError(input.error);
  const { notebookId, noteId, title, body } = input.data;
  const visitorId = await ensureVisitor();
  const note = await updateNote(visitorId, notebookId, noteId, { title, body });
  if (!note) return { ok: false, error: 'note_not_found' };
  (await requestLogger()).info({ event: 'note.updated', noteId });
  revalidatePath(`/notebooks/${notebookId}`);
  return { ok: true };
}

export async function deleteNoteAction(formData: FormData): Promise<void> {
  const input = noteIdSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const { notebookId, noteId } = input.data;
  const visitorId = await ensureVisitor();
  if (await deleteNote(visitorId, notebookId, noteId)) {
    (await requestLogger()).info({ event: 'note.deleted', noteId });
  }
  revalidatePath(`/notebooks/${notebookId}`);
}

const saveAnswerSchema = notebookIdSchema.extend({ messageId: z.uuid() });

/** Copies an answer into a new Note (Citations included) and opens it in the Notes tab. */
export async function saveAnswerAsNoteAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const input = saveAnswerSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, error: 'answer_not_found' };
  const { notebookId, messageId } = input.data;
  const visitorId = await ensureVisitor();
  const note = await saveAnswerAsNote(visitorId, notebookId, messageId);
  if (!note) return { ok: false, error: 'answer_not_found' };
  (await requestLogger()).info({ event: 'note.saved_from_answer', noteId: note.id, messageId });
  revalidatePath(`/notebooks/${notebookId}`);
  redirect(`/notebooks/${notebookId}?note=${note.id}`);
}

/** Starts a Briefing and generates it after the response; the Studio tab polls until it is done. */
export async function generateBriefingAction(
  _previous: StudioActionResult,
  formData: FormData,
): Promise<StudioActionResult> {
  const input = notebookIdSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { ok: false, error: 'not_found' };
  const { notebookId } = input.data;
  const visitorId = await ensureVisitor();
  const started = await startBriefing(visitorId, notebookId);
  if (!started.ok) {
    return {
      ok: false,
      error: started.error,
      ...(started.retryAt && { retryAt: started.retryAt.toISOString() }),
    };
  }
  (await requestLogger()).info({ event: 'studio.briefing_started', outputId: started.output.id });
  after(async () => {
    await runBriefing(visitorId, started.output.id, started.reservationId);
  });
  revalidatePath(`/notebooks/${notebookId}`);
  return { ok: true };
}
