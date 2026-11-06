import type { ChatRequest, ChatTurn } from '@/platform/llm';

import type { PromptDocument } from './citations';

/** One earlier question with its answer's text. */
export type HistoryTurn = { question: string; answer: string };

// German prose runs a little under four characters per token; three errs on the safe side.
const CHARS_PER_TOKEN = 3;

const tokensOf = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN);

/** The newest question-and-answer pairs that fit `budgetTokens`, oldest first. */
export function trimHistory(
  history: readonly HistoryTurn[],
  { budgetTokens }: { budgetTokens: number },
): HistoryTurn[] {
  const kept: HistoryTurn[] = [];
  let used = 0;
  for (let index = history.length - 1; index >= 0; index--) {
    const turn = history[index];
    if (!turn) break;
    used += tokensOf(turn.question) + tokensOf(turn.answer);
    if (used > budgetTokens) break;
    kept.unshift(turn);
  }
  return kept;
}

// Haiku 5.5 costs five times as much once a prompt passes 100K tokens.
const PROMPT_TOKEN_LIMIT = 100_000;
// Room for the system prompt, the question and the per-block overhead of the documents.
const PROMPT_RESERVE_TOKENS = 8_000;

/** How many tokens of history fit next to the Sources without passing the price step (never negative). */
export function historyBudget(sourceTokens: number): number {
  return Math.max(0, PROMPT_TOKEN_LIMIT - PROMPT_RESERVE_TOKENS - sourceTokens);
}

export const CHAT_SYSTEM_PROMPT = `You answer questions about the user's sources in a notebook app.

- The sources are the documents in the conversation. Answer only from them, never from general knowledge, and cite the passages you rely on.
- If the sources don't cover the question, or only part of it, say so plainly instead of guessing, and name what is missing. Don't cite anything for that statement.
- Answer in German (informal "du"), unless the user writes in another language.
- Be concise: a few sentences or a short list. Write plain text without Markdown, headings or tables; separate paragraphs with a blank line.`;

export type PromptSource = {
  id: string;
  title: string;
  passages: { ordinal: number; text: string }[];
};

/** The Chat request for a question, and which Source and Passage each document block stands for. */
export function buildChatRequest(input: {
  sources: readonly PromptSource[];
  history: readonly HistoryTurn[];
  question: string;
}): { request: ChatRequest; documents: PromptDocument[] } {
  const turns: ChatTurn[] = input.history.flatMap((turn): ChatTurn[] => [
    { role: 'user', text: turn.question },
    { role: 'assistant', text: turn.answer },
  ]);
  turns.push({ role: 'user', text: input.question });
  return {
    request: {
      system: CHAT_SYSTEM_PROMPT,
      documents: input.sources.map((source) => ({
        title: source.title,
        blocks: source.passages.map((passage) => passage.text),
      })),
      turns,
    },
    documents: input.sources.map((source) => ({
      sourceId: source.id,
      title: source.title,
      ordinals: source.passages.map((passage) => passage.ordinal),
    })),
  };
}
