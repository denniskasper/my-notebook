import { z } from 'zod';

export const NOTE_TITLE_MAX_LENGTH = 200;
export const NOTE_BODY_MAX_LENGTH = 100_000;

const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

/** A Note title: trimmed, inner whitespace collapsed, 1–200 characters. */
export const noteTitleSchema = z
  .string()
  .transform(collapseWhitespace)
  .pipe(z.string().min(1).max(NOTE_TITLE_MAX_LENGTH));

/** A Note body: Markdown with `[n]` Citation markers, line endings normalised to LF. */
export const noteBodySchema = z
  .string()
  .max(NOTE_BODY_MAX_LENGTH)
  .transform((value) => value.replace(/\r\n?/g, '\n'));

/** A title cut from longer text (e.g. the question an answer was saved from), never empty. */
export function noteTitleFrom(text: string): string {
  const flat = collapseWhitespace(text);
  if (flat === '') return '…';
  if (flat.length <= NOTE_TITLE_MAX_LENGTH) return flat;
  return `${flat.slice(0, NOTE_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}
