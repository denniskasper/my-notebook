/**
 * Whether a Source of `addingTokens` may join the Notebook's enabled Sources
 * without their total exceeding `cap` (ADR 0002: long context, capped).
 */
export function fitsTokenCap(input: {
  enabledTokens: readonly number[];
  addingTokens: number;
  cap: number;
}): boolean {
  const total = input.enabledTokens.reduce((sum, tokens) => sum + tokens, input.addingTokens);
  return total <= input.cap;
}
