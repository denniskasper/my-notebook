import { z } from 'zod';

import { normalizeSourceText } from './passages';

export const SOURCE_TITLE_MAX_LENGTH = 200;
// Well above what fits the token cap (~4 characters per token), below the Server Action body limit.
export const SOURCE_TEXT_MAX_LENGTH = 500_000;

/** A Source title: trimmed, inner whitespace collapsed, 1–200 characters. */
export const sourceTitleSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1).max(SOURCE_TITLE_MAX_LENGTH));

/** Pasted Source text: something other than whitespace, within the length limit. */
export const sourceTextSchema = z
  .string()
  .max(SOURCE_TEXT_MAX_LENGTH)
  .transform(normalizeSourceText)
  .refine((value) => value.trim().length > 0);

/** Why a Source failed, as written to `sources.error_code`. */
export type SourceErrorCode = 'interrupted' | 'token_cap_exceeded' | 'token_count_failed';
