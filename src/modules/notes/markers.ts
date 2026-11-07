import { z } from 'zod';

import { citationSchema, type Citation, type MessagePart } from '@/modules/chat';

/** A Note's Citations: marker number (as in `[1]`) → Citation snapshot. */
export const noteCitationsSchema = z.record(z.string().regex(/^[1-9]\d*$/), citationSchema);

export type NoteCitations = z.infer<typeof noteCitationsSchema>;

const MARKER = /\[([1-9]\d*)\]/g;

/** The marker numbers the body references, as strings. */
function referencedMarkers(body: string): Set<string> {
  return new Set(Array.from(body.matchAll(MARKER), (match) => match[1] ?? ''));
}

/** Keeps only the Citations whose `[n]` marker still appears in the body. */
export function pruneCitations(body: string, citations: NoteCitations): NoteCitations {
  const referenced = referencedMarkers(body);
  return Object.fromEntries(
    Object.entries(citations).filter(([marker]) => referenced.has(marker)),
  ) satisfies Record<string, Citation>;
}

/**
 * Copies an answer into a Note body: each part's text followed by a `[n]`
 * marker per Citation, numbered through the whole answer as its chips are.
 */
export function noteFromAnswer(parts: readonly MessagePart[]): {
  body: string;
  citations: NoteCitations;
} {
  let body = '';
  const citations: NoteCitations = {};
  let n = 0;
  for (const part of parts) {
    body += part.text;
    for (const citation of part.citations) {
      n += 1;
      body += `[${n}]`;
      citations[String(n)] = citation;
    }
  }
  return { body, citations };
}
