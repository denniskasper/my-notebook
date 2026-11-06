import type { Llm } from './types';

// Roughly what Claude's tokenizer gives for prose; exact enough for cap tests.
const CHARS_PER_TOKEN = 4;

/** The scripted stand-in for Claude in development, tests and CI: no key, no cost. */
export function createFakeLlm(): Llm {
  return {
    async countTokens(text) {
      return Math.ceil(text.length / CHARS_PER_TOKEN);
    },
  };
}
