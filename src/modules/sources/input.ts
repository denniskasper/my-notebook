import { z } from 'zod';

import type { FetchPageError } from '@/platform/web';

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

// Long enough for any real address, short enough to stay a title-sized string.
export const SOURCE_URL_MAX_LENGTH = 2048;

/** A web page address as typed: trimmed, within the length limit (the fetcher checks the rest). */
export const sourceUrlSchema = z.string().trim().min(1).max(SOURCE_URL_MAX_LENGTH);

/** Why a Source failed, as written to `sources.error_code`. */
export type SourceErrorCode =
  'interrupted' | 'token_cap_exceeded' | 'token_count_failed' | FetchPageError | 'url_no_content';

/** A Source title for a web page that hasn't been fetched yet: host and path. */
export function titleFromUrl(url: URL): string {
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
  return `${url.host}${path}`.slice(0, SOURCE_TITLE_MAX_LENGTH);
}

/** A page's own title as a Source title, cut to the title limit. */
export function titleFromPage(title: string): string {
  return title.slice(0, SOURCE_TITLE_MAX_LENGTH).trim();
}
