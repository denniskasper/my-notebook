import { and, eq, gt, sql } from 'drizzle-orm';

import { db, withConnection } from '@/platform/db';
import { env } from '@/platform/env';

import {
  berlinDayStart,
  nextBerlinDayStart,
  RATE_WINDOW_MS,
  rateLimitRetryAt,
  spendBlock,
  type Spend,
  type SpendBlock,
  type SpendLimits,
} from './limits';
import { usageEvents } from './schema';

/** The LLM features the Budget guard checks; token counting while ingesting is free. */
export type GuardedFeature = 'chat' | 'agent' | 'studio';

/** Why a call may not run now, and when it may again (null: not on its own). */
export type UsageBlock =
  { reason: SpendBlock; retryAt: Date | null } | { reason: 'rate_limited'; retryAt: Date };

const MICRO_USD_PER_USD = 1_000_000;
const toMicroUsd = (usd: number) => Math.round(usd * MICRO_USD_PER_USD);

function spendLimits(): SpendLimits {
  const config = env();
  return {
    demoDailyMicroUsd: toMicroUsd(config.DEMO_BUDGET_DAILY_USD),
    demoTotalMicroUsd: toMicroUsd(config.DEMO_BUDGET_TOTAL_USD),
    allowanceMicroUsd: toMicroUsd(config.DAILY_ALLOWANCE_USD),
  };
}

function rateLimit(feature: GuardedFeature): number {
  const config = env();
  const limits: Record<GuardedFeature, number> = {
    chat: config.CHAT_RATE_LIMIT_PER_HOUR,
    agent: config.AGENT_RATE_LIMIT_PER_HOUR,
    studio: config.BRIEFING_RATE_LIMIT_PER_HOUR,
  };
  return limits[feature];
}

/** Today's (Berlin) and all-time spend, and one Visitor's spend today, in one query. */
async function loadSpend(visitorId: string | null, now: Date): Promise<Spend> {
  const today = berlinDayStart(now);
  const visitorToday =
    visitorId === null
      ? sql<string>`0`
      : sql<string>`coalesce(sum(${usageEvents.costMicroUsd}) filter (where ${usageEvents.at} >= ${today} and ${usageEvents.visitorId} = ${visitorId}), 0)`;
  const [row] = await db()
    .select({
      demoToday: sql<string>`coalesce(sum(${usageEvents.costMicroUsd}) filter (where ${usageEvents.at} >= ${today}), 0)`,
      demoTotal: sql<string>`coalesce(sum(${usageEvents.costMicroUsd}), 0)`,
      visitorToday,
    })
    .from(usageEvents);
  return {
    demoToday: Number(row?.demoToday ?? 0),
    demoTotal: Number(row?.demoTotal ?? 0),
    visitorToday: Number(row?.visitorToday ?? 0),
  };
}

/**
 * Check before: whether the Visitor may make one more `feature` call now,
 * against the Demo budget, their Daily allowance and the feature's hourly
 * rate limit. Charge after with `recordUsage`. Without a reservation one call
 * may overshoot a cap by its own cost.
 */
export async function checkUsage(input: {
  visitorId: string;
  feature: GuardedFeature;
}): Promise<UsageBlock | null> {
  const now = new Date();
  const block = spendBlock(await loadSpend(input.visitorId, now), spendLimits());
  if (block) {
    return {
      reason: block,
      retryAt: block === 'demo_budget_total' ? null : nextBerlinDayStart(now),
    };
  }

  const recent = await db()
    .select({ at: usageEvents.at })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.visitorId, input.visitorId),
        eq(usageEvents.feature, input.feature),
        gt(usageEvents.at, new Date(now.getTime() - RATE_WINDOW_MS)),
      ),
    );
  const retryAt = rateLimitRetryAt(
    recent.map((row) => row.at),
    { limit: rateLimit(input.feature), now },
  );
  return retryAt ? { reason: 'rate_limited', retryAt } : null;
}

export type SpendStatus = {
  /** What stops this Visitor's next call by spend alone, if anything (rate limits aside). */
  blocked: { reason: SpendBlock; retryAt: Date | null } | null;
  /** The Visitor's Daily allowance (nothing spent without a Visitor). */
  allowance: { spentMicroUsd: number; limitMicroUsd: number; resetsAt: Date };
  demoBudget: {
    spentTodayMicroUsd: number;
    dailyLimitMicroUsd: number;
    spentTotalMicroUsd: number;
    totalLimitMicroUsd: number;
    exhausted: 'daily' | 'total' | null;
  };
};

/** Spend against the caps, for the Kontingent meter, the Demo budget banner and the Status page. */
export async function getSpendStatus(visitorId: string | null): Promise<SpendStatus> {
  const now = new Date();
  const spend = await loadSpend(visitorId, now);
  const limits = spendLimits();
  const block = spendBlock(spend, limits);
  const exhaustedByBlock: Record<SpendBlock, SpendStatus['demoBudget']['exhausted']> = {
    demo_budget_total: 'total',
    demo_budget_daily: 'daily',
    daily_allowance: null,
  };
  return {
    blocked: block && {
      reason: block,
      retryAt: block === 'demo_budget_total' ? null : nextBerlinDayStart(now),
    },
    allowance: {
      spentMicroUsd: spend.visitorToday,
      limitMicroUsd: limits.allowanceMicroUsd,
      resetsAt: nextBerlinDayStart(now),
    },
    demoBudget: {
      spentTodayMicroUsd: spend.demoToday,
      dailyLimitMicroUsd: limits.demoDailyMicroUsd,
      spentTotalMicroUsd: spend.demoTotal,
      totalLimitMicroUsd: limits.demoTotalMicroUsd,
      exhausted: block ? exhaustedByBlock[block] : null,
    },
  };
}

// First key of the two-int advisory lock space; the second is the slot number.
const AGENT_SLOT_LOCK = 48_001;

/**
 * Runs an Agent run in one of the demo-wide Agent slots (`AGENT_CONCURRENCY_LIMIT`),
 * or reports `agent_busy` when all are taken. Slots are Postgres session locks,
 * so they hold across instances and free themselves if the process dies.
 */
export async function withAgentSlot<T>(
  run: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; reason: 'agent_busy' }> {
  return withConnection(async (connection) => {
    const slots = env().AGENT_CONCURRENCY_LIMIT;
    for (let slot = 0; slot < slots; slot += 1) {
      const result = await connection.execute<{ locked: boolean }>(
        sql`select pg_try_advisory_lock(${AGENT_SLOT_LOCK}, ${slot}) as locked`,
      );
      if (!result.rows[0]?.locked) continue;
      try {
        return { ok: true, value: await run() };
      } finally {
        await connection.execute(sql`select pg_advisory_unlock(${AGENT_SLOT_LOCK}, ${slot})`);
      }
    }
    return { ok: false, reason: 'agent_busy' };
  });
}
