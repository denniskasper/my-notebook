import Anthropic from '@anthropic-ai/sdk';

import { MODELS } from './models';
import type { Llm } from './types';

/** The Client SDK adapter (ADR 0001). */
export function createRealLlm(apiKey: string): Llm {
  const client = new Anthropic({ apiKey });
  return {
    async countTokens(text) {
      // Counted against the Chat model, which is where Sources are sent.
      const result = await client.messages.countTokens({
        model: MODELS.chat,
        messages: [{ role: 'user', content: text }],
      });
      return result.input_tokens;
    },
  };
}
