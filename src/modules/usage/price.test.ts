import { describe, expect, it } from 'vitest';

import { costMicroUsd, estimateOutputTokens } from '.';

const tokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

describe('costMicroUsd', () => {
  it('prices Haiku 5.5 at $0.10 in / $0.50 out per million tokens', () => {
    expect(
      costMicroUsd('claude-haiku-5-5', { ...tokens, inputTokens: 10_000, outputTokens: 1_000 }),
    ).toBe(1_500);
  });

  it('prices cache reads at a tenth and cache writes at 1.25 times the input price', () => {
    expect(
      costMicroUsd('claude-haiku-5-5', {
        ...tokens,
        cacheReadTokens: 50_000,
        cacheWriteTokens: 8_000,
      }),
    ).toBe(500 + 1_000);
  });

  it('charges the higher Haiku price step once the prompt passes 100K tokens', () => {
    expect(
      costMicroUsd('claude-haiku-5-5', {
        ...tokens,
        inputTokens: 1_000,
        cacheReadTokens: 100_000,
        outputTokens: 1_000,
      }),
    ).toBe(500 + 5_000 + 2_500);
  });

  it('prices Sonnet 5.5 at $2 in / $10 out per million tokens', () => {
    expect(
      costMicroUsd('claude-sonnet-5-5', { ...tokens, inputTokens: 1_000, outputTokens: 1_000 }),
    ).toBe(12_000);
  });

  it('rounds a fraction of a micro-dollar up', () => {
    expect(costMicroUsd('claude-haiku-5-5', { ...tokens, inputTokens: 1 })).toBe(1);
  });
});

describe('estimateOutputTokens', () => {
  it('estimates about four characters per token for an aborted stream', () => {
    expect(estimateOutputTokens(0)).toBe(0);
    expect(estimateOutputTokens(9)).toBe(3);
    expect(estimateOutputTokens(400)).toBe(100);
  });
});
