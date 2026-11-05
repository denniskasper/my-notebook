import { z } from 'zod';

export const NOTEBOOK_TITLE_MAX_LENGTH = 120;

/** A Notebook title: trimmed, inner whitespace collapsed, 1–120 characters. */
export const notebookTitleSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1).max(NOTEBOOK_TITLE_MAX_LENGTH));
