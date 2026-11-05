'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import {
  createNotebook,
  deleteNotebook,
  notebookTitleSchema,
  renameNotebook,
} from '@/modules/notebooks';
import { ensureVisitor } from '@/modules/visitors';
import { requestLogger } from '@/platform/logging';
import type { ErrorCode } from '@/ui/strings';
import { strings } from '@/ui/strings';

export type ActionResult = { ok: true } | { ok: false; error: ErrorCode } | null;

const notebookIdSchema = z.object({ notebookId: z.uuid() });
const renameSchema = notebookIdSchema.extend({ title: notebookTitleSchema });

export async function createNotebookAction(): Promise<void> {
  const visitorId = await ensureVisitor();
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
