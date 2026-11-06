import { describe, expect, it } from 'vitest';

import { createFakeLlm } from './fake';

describe('fake llm', () => {
  it('counts tokens deterministically, about four characters per token', async () => {
    const llm = createFakeLlm();
    expect(await llm.countTokens('')).toBe(0);
    expect(await llm.countTokens('abcd')).toBe(1);
    expect(await llm.countTokens('abcde')).toBe(2);
    expect(await llm.countTokens('x'.repeat(4000))).toBe(1000);
  });
});
