import { env } from '@/platform/env';

import { createFakeLlm } from './fake';
import { createRealLlm } from './real';
import type { Llm } from './types';

export type {
  AgentOutcome,
  AgentRequest,
  AgentStreamEvent,
  AgentTool,
  AgentToolResult,
  ChatDocument,
  ChatRequest,
  ChatStreamEvent,
  ChatTurn,
  Llm,
  LlmCitation,
  LlmUsage,
} from './types';
export { MODELS } from './models';

let instance: Llm | undefined;

/** The one way to reach Claude; `LLM_MODE=fake` swaps in the scripted fake. */
export function llm(): Llm {
  if (!instance) {
    const { LLM_MODE, ANTHROPIC_API_KEY } = env();
    instance =
      LLM_MODE === 'real' && ANTHROPIC_API_KEY ? createRealLlm(ANTHROPIC_API_KEY) : createFakeLlm();
  }
  return instance;
}
