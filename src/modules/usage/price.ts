import { MODELS } from '@/platform/llm';

/** Tokens one LLM call used, as the Client SDK reports them. */
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** US dollars per million tokens; 1 $/MTok is 1 micro-dollar per token. */
type Price = { input: number; output: number };

type PriceTable = {
  base: Price;
  /** A higher price for the whole call once its prompt passes `afterTokens`. */
  step?: { afterTokens: number; price: Price };
};

// Cache reads cost a tenth of the input price, 5-minute cache writes 1.25 times.
const CACHE_READ_FACTOR = 0.1;
const CACHE_WRITE_FACTOR = 1.25;

const HAIKU_5_5: PriceTable = {
  base: { input: 0.1, output: 0.5 },
  step: { afterTokens: 100_000, price: { input: 0.5, output: 2.5 } },
};
const SONNET_5_5: PriceTable = { base: { input: 2, output: 10 } };

// Keyed by the model ids the app uses (Agent and Studio share Sonnet).
const PRICES = new Map<string, PriceTable>([
  [MODELS.chat, HAIKU_5_5],
  [MODELS.agent, SONNET_5_5],
  [MODELS.studio, SONNET_5_5],
]);

/** What Anthropic charges per web search, in micro-dollars ($0.01). */
export const WEB_SEARCH_MICRO_USD = 10_000;

/** What a call cost in micro-dollars (rounded up), from its model and token usage. */
export function costMicroUsd(model: string, usage: TokenUsage): number {
  const table = PRICES.get(model);
  if (!table) throw new Error(`No price for model ${model}`);
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const price = table.step && promptTokens > table.step.afterTokens ? table.step.price : table.base;
  const cost =
    usage.inputTokens * price.input +
    usage.cacheReadTokens * price.input * CACHE_READ_FACTOR +
    usage.cacheWriteTokens * price.input * CACHE_WRITE_FACTOR +
    usage.outputTokens * price.output;
  // Rounded first so float noise (0.1 * 3) doesn't push an exact cost up by one.
  return Math.ceil(Math.round(cost * 1_000) / 1_000);
}

// Roughly what Claude's tokenizer gives for prose.
const CHARS_PER_TOKEN = 4;

/** Output tokens of an aborted stream, which never reports its final usage. */
export function estimateOutputTokens(streamedChars: number): number {
  return Math.ceil(streamedChars / CHARS_PER_TOKEN);
}
