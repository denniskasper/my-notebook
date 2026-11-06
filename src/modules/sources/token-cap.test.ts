import { describe, expect, it } from 'vitest';

import { fitsTokenCap } from '.';

describe('fitsTokenCap', () => {
  it('allows a Source that fills the cap exactly', () => {
    expect(
      fitsTokenCap({ enabledTokens: [30_000, 40_000], addingTokens: 10_000, cap: 80_000 }),
    ).toBe(true);
  });

  it('rejects a Source that would push the enabled Sources over the cap', () => {
    expect(
      fitsTokenCap({ enabledTokens: [30_000, 40_000], addingTokens: 10_001, cap: 80_000 }),
    ).toBe(false);
  });

  it('rejects a single Source larger than the cap in an empty Notebook', () => {
    expect(fitsTokenCap({ enabledTokens: [], addingTokens: 80_001, cap: 80_000 })).toBe(false);
  });

  it('allows anything under the cap in an empty Notebook', () => {
    expect(fitsTokenCap({ enabledTokens: [], addingTokens: 1, cap: 80_000 })).toBe(true);
  });
});
