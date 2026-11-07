import { z } from 'zod';

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The reader's state in the URL: `?source=<id>&p=<ordinal>,<ordinal>` opens a
 * Source and highlights those Passages (how Citations link into the reader).
 */
export function parseReaderParams(params: SearchParams): {
  sourceId: string | null;
  ordinals: number[];
} {
  const sourceId = z.uuid().safeParse(first(params.source));
  if (!sourceId.success) return { sourceId: null, ordinals: [] };
  const ordinals = (first(params.p) ?? '')
    .split(',')
    .filter((part) => /^\d+$/.test(part))
    .map(Number);
  return { sourceId: sourceId.data, ordinals: [...new Set(ordinals)].sort((a, b) => a - b) };
}

/** `?note=<id>` opens a Note in the Notes tab (e.g. right after saving an answer). */
export function parseNoteParam(params: SearchParams): string | null {
  const noteId = z.uuid().safeParse(first(params.note));
  return noteId.success ? noteId.data : null;
}
