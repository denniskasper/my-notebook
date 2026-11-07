/** How much of the Daily allowance is left, in whole percent (rounded down, 0–100). */
export function allowanceLeftPercent({
  spentMicroUsd,
  limitMicroUsd,
}: {
  spentMicroUsd: number;
  limitMicroUsd: number;
}): number {
  if (limitMicroUsd <= 0) return 0;
  const left = Math.floor(((limitMicroUsd - spentMicroUsd) / limitMicroUsd) * 100);
  return Math.min(100, Math.max(0, left));
}
