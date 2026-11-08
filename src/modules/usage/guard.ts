import { and, eq, gt, sql } from 'drizzle-orm';

import { db, withConnection } from '@/platform/db';
import { env } from '@/platform/env';
import { berlinDayStart, nextBerlinDayStart } from '@/platform/time';

import {
  RATE_WINDOW_MS,
  rateLimitRetryAt,
  spendBlock,
  type Spend,
  type SpendBlock,
  type SpendLimits,
} from './limits';
import { usageEvents, usageReservations, type GUARDED_FEATURES } from './schema';

/** The LLM features the Budget guard checks; token counting while ingesting is free. */
export type GuardedFeature = (typeof GUARDED_FEATURES)[number];

/** A spend cap that stops calls, and when it lifts (null: not on its own). */
type SpendBlockAt = { reason: SpendBlock; retryAt: Date | null };

/** Why a call may not run now, and when it may again. */
export type UsageBlock = SpendBlockAt | { reason: 'rate_limited'; retryAt: Date };

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

/** What a call holds against the caps while it runs: about what one may cost. */
function holdMicroUsd(feature: GuardedFeature): number {
  const config = env();
  const holds: Record<GuardedFeature, number> = {
    chat: config.CHAT_HOLD_USD,
    agent: config.AGENT_MAX_BUDGET_USD,
    studio: config.BRIEFING_HOLD_USD,
  };
  return toMicroUsd(holds[feature]);
}

// Longer than any call runs (an Agent run stops at AGENT_TIMEOUT_SECONDS), so only a hold
// whose process died runs out; until then it keeps counting, which errs on the safe side.
const HOLD_TTL_MS = 30 * 60 * 1000;

// Key of the advisory lock that serialises reservations, demo-wide.
const RESERVE_LOCK = 48_002;

function rateLimit(feature: GuardedFeature): number {
  const config = env();
  const limits: Record<GuardedFeature, number> = {
    chat: config.CHAT_RATE_LIMIT_PER_HOUR,
    agent: config.AGENT_RATE_LIMIT_PER_HOUR,
    studio: config.BRIEFING_RATE_LIMIT_PER_HOUR,
  };
  return limits[feature];
}

/** The daily caps lift at the next Berlin midnight; the total cap never does. */
function spendBlockAt(block: SpendBlock, now: Date): SpendBlockAt {
  return { reason: block, retryAt: block === 'demo_budget_total' ? null : nextBerlinDayStart(now) };
}

type Executor = Pick<ReturnType<typeof db>, 'select'>;

async function loadSpend(
  visitorId: string | null,
  now: Date,
  executor: Executor = db(),
): Promise<Spend> {
  const today = berlinDayStart(now);
  const visitorToday =
    visitorId === null
      ? sql<string>`0`
      : sql<string>`coalesce(sum(${usageEvents.costMicroUsd}) filter (where ${usageEvents.at} >= ${today} and ${usageEvents.visitorId} = ${visitorId}), 0)`;
  const [row] = await executor
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

/** Today's (Berlin) and all-time spend, and one Visitor's, plus the holds of calls in flight. */
async function loadSpendWithHolds(
  visitorId: string,
  now: Date,
  executor: Executor,
): Promise<Spend> {
  const spend = await loadSpend(visitorId, now, executor);
  const [held] = await executor
    .select({
      all: sql<string>`coalesce(sum(${usageReservations.costMicroUsd}), 0)`,
      visitor: sql<string>`coalesce(sum(${usageReservations.costMicroUsd}) filter (where ${usageReservations.visitorId} = ${visitorId}), 0)`,
    })
    .from(usageReservations)
    .where(gt(usageReservations.expiresAt, now));
  const all = Number(held?.all ?? 0);
  return {
    demoToday: spend.demoToday + all,
    demoTotal: spend.demoTotal + all,
    visitorToday: spend.visitorToday + Number(held?.visitor ?? 0),
  };
}

/**
 * Reserves room for one `feature` call by the Visitor, or says which cap stops
 * it: the Demo budget, their Daily allowance or the feature's hourly rate
 * limit. Calls still in flight count with their holds, and reservations are
 * taken one at a time, so concurrent calls can't all pass the same check.
 * Record the real cost with `recordUsage`, then `releaseUsage` the reservation.
 * A call may still overshoot a cap by what it costs beyond its hold.
 */
export async function reserveUsage(input: {
  visitorId: string;
  feature: GuardedFeature;
}): Promise<{ ok: true; reservationId: string } | { ok: false; block: UsageBlock }> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${RESERVE_LOCK})`);
    const now = new Date();
    const block = spendBlock(await loadSpendWithHolds(input.visitorId, now, tx), spendLimits());
    if (block) return { ok: false, block: spendBlockAt(block, now) };

    const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);
    const [recent, inFlight] = await Promise.all([
      tx
        .select({ at: usageEvents.at })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.visitorId, input.visitorId),
            eq(usageEvents.feature, input.feature),
            gt(usageEvents.at, windowStart),
          ),
        ),
      tx
        .select({ at: usageReservations.at })
        .from(usageReservations)
        .where(
          and(
            eq(usageReservations.visitorId, input.visitorId),
            eq(usageReservations.feature, input.feature),
            gt(usageReservations.expiresAt, now),
          ),
        ),
    ]);
    const retryAt = rateLimitRetryAt(
      [...recent, ...inFlight].map((row) => row.at),
      { limit: rateLimit(input.feature), now },
    );
    if (retryAt) return { ok: false, block: { reason: 'rate_limited', retryAt } };

    const [reservation] = await tx
      .insert(usageReservations)
      .values({
        visitorId: input.visitorId,
        feature: input.feature,
        costMicroUsd: holdMicroUsd(input.feature),
        expiresAt: new Date(now.getTime() + HOLD_TTL_MS),
      })
      .returning({ id: usageReservations.id });
    if (!reservation) throw new Error('Reservation insert returned no row');
    return { ok: true, reservationId: reservation.id };
  });
}

/** Ends a reservation once its call has recorded its cost (or never ran). Idempotent. */
export async function releaseUsage(reservationId: string): Promise<void> {
  await db().delete(usageReservations).where(eq(usageReservations.id, reservationId));
}

export type SpendStatus = {
  /** What stops this Visitor's next call by spend alone, if anything (rate limits aside). */
  blocked: SpendBlockAt | null;
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
    blocked: block && spendBlockAt(block, now),
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
