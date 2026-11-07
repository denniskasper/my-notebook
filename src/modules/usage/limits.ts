export type SpendLimits = {
  demoDailyMicroUsd: number;
  demoTotalMicroUsd: number;
  allowanceMicroUsd: number;
};

/** Micro-dollars spent: by everyone today and in total, and by one Visitor today. */
export type Spend = { demoToday: number; demoTotal: number; visitorToday: number };

export type SpendBlock = 'demo_budget_total' | 'demo_budget_daily' | 'daily_allowance';

/** Which cap stops the next call, the widest first; null while all have room. */
export function spendBlock(spend: Spend, limits: SpendLimits): SpendBlock | null {
  if (spend.demoTotal >= limits.demoTotalMicroUsd) return 'demo_budget_total';
  if (spend.demoToday >= limits.demoDailyMicroUsd) return 'demo_budget_daily';
  if (spend.visitorToday >= limits.allowanceMicroUsd) return 'daily_allowance';
  return null;
}

/** How much of a cap is spent, as a whole percent from 0 to 100; a cap of 0 counts as spent. */
export function spentPercent(spentMicroUsd: number, limitMicroUsd: number): number {
  if (limitMicroUsd <= 0) return 100;
  return Math.min(100, Math.round((spentMicroUsd / limitMicroUsd) * 100));
}

export const RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * When the next call fits a sliding one-hour window again, given the moments
 * of earlier calls; null if it fits now.
 */
export function rateLimitRetryAt(
  calls: readonly Date[],
  { limit, now }: { limit: number; now: Date },
): Date | null {
  const windowStart = now.getTime() - RATE_WINDOW_MS;
  const recent = calls
    .map((call) => call.getTime())
    .filter((at) => at > windowStart)
    .sort((a, b) => a - b);
  if (recent.length < limit) return null;
  // The call that has to drop out so only limit - 1 are left.
  const blocking = recent[recent.length - limit];
  return blocking === undefined ? null : new Date(blocking + RATE_WINDOW_MS);
}
