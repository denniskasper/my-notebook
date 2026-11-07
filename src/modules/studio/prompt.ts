import type { PromptDocument } from '@/modules/chat';
import type { PromptSource } from '@/modules/sources';
import type { ChatRequest } from '@/platform/llm';

export const BRIEFING_SYSTEM_PROMPT = `You write briefings about the user's sources in a notebook app.

- The sources are the documents in the conversation. Use only them, never general knowledge, and cite the passages every statement relies on.
- Write in German (informal "du").
- Use exactly this structure and no other Markdown:
  ## Überblick
  Two to four sentences on what the sources are about as a whole.

  ## Kernpunkte
  - Four to seven key points, one line each, the most important first.

  ## Offene Fragen
  - Up to three points the sources leave open or disagree on. Leave this section out if there are none.
- Start every key point on its own line with "- ". No bold, no tables, no further headings.`;

const BRIEFING_INSTRUCTION = 'Erstelle ein Briefing zu meinen Quellen.';

/** The Briefing request for the enabled Sources, and which Source and Passage each document block stands for. */
export function buildBriefingRequest(sources: readonly PromptSource[]): {
  request: ChatRequest;
  documents: PromptDocument[];
} {
  return {
    request: {
      system: BRIEFING_SYSTEM_PROMPT,
      documents: sources.map((source) => ({
        title: source.title,
        blocks: source.passages.map((passage) => passage.text),
      })),
      turns: [{ role: 'user', text: BRIEFING_INSTRUCTION }],
    },
    documents: sources.map((source) => ({
      sourceId: source.id,
      title: source.title,
      ordinals: source.passages.map((passage) => passage.ordinal),
    })),
  };
}
