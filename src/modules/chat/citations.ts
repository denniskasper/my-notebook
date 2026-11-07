import { z } from 'zod';

import type { LlmCitation } from '@/platform/llm';

/**
 * A Citation as stored in an answer: a snapshot that outlives its Source, so
 * an old answer still shows the quote after the Source is deleted.
 */
export const citationSchema = z.object({
  sourceId: z.uuid(),
  /** 0-based Passage ordinals, ascending. */
  ordinals: z.array(z.number().int().nonnegative()).min(1),
  quote: z.string(),
  sourceTitle: z.string(),
});

export type Citation = z.infer<typeof citationSchema>;

/** A Source as it went into the prompt: document `i` is the i-th of these, block `j` its j-th Passage. */
export type PromptDocument = { sourceId: string; title: string; ordinals: number[] };

/** Maps a Citations API block range onto the Source and Passages it was built from; null if it points nowhere. */
export function toCitation(
  citation: LlmCitation,
  documents: readonly PromptDocument[],
): Citation | null {
  const document = documents[citation.documentIndex];
  if (!document) return null;
  const { startBlockIndex: start, endBlockIndex: end } = citation;
  if (start < 0 || end <= start || end > document.ordinals.length) return null;
  return {
    sourceId: document.sourceId,
    ordinals: document.ordinals.slice(start, end),
    quote: citation.citedText,
    sourceTitle: document.title,
  };
}
