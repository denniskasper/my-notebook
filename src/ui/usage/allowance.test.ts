import { describe, expect, it } from 'vitest';

import { allowanceLeftPercent } from './allowance';

describe('allowanceLeftPercent', () => {
  it('is the share of the Daily allowance left, rounded down, never below zero', () => {
    expect(allowanceLeftPercent({ spentMicroUsd: 0, limitMicroUsd: 500_000 })).toBe(100);
    expect(allowanceLeftPercent({ spentMicroUsd: 1, limitMicroUsd: 500_000 })).toBe(99);
    expect(allowanceLeftPercent({ spentMicroUsd: 125_000, limitMicroUsd: 500_000 })).toBe(75);
    expect(allowanceLeftPercent({ spentMicroUsd: 600_000, limitMicroUsd: 500_000 })).toBe(0);
    expect(allowanceLeftPercent({ spentMicroUsd: 0, limitMicroUsd: 0 })).toBe(0);
  });
});
