import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createNotebook, deleteNotebook } from '@/modules/notebooks';
import { createVisitor } from '@/modules/visitors';
import { closeDb } from '@/platform/db';
import { MODELS } from '@/platform/llm';
import { nextBerlinDayStart } from '@/platform/time';
import { resetDatabase } from '@/test/database';

import {
  getSpendStatus,
  recordUsage,
  releaseUsage,
  reserveUsage,
  spendSince,
  withAgentSlot,
  type GuardedFeature,
} from '.';

/** The block a reservation ran into, or null after releasing the reservation it got. */
async function checkUsage(input: { visitorId: string; feature: GuardedFeature }) {
  const reservation = await reserveUsage(input);
  if (!reservation.ok) return reservation.block;
  await releaseUsage(reservation.reservationId);
  return null;
}

let visitor: string;
let notebook: string;
const start = new Date(Date.now() - 1_000);

beforeEach(async () => {
  await resetDatabase();
  visitor = await createVisitor({ ipHash: null });
  notebook = (await createNotebook(visitor, 'Wärmewende')).id;
});
afterAll(closeDb);

const haikuCall = {
  feature: 'chat' as const,
  model: MODELS.chat,
  inputTokens: 10_000,
  outputTokens: 1_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

describe('recordUsage', () => {
  it('appends one event per LLM call with its cost', async () => {
    const event = await recordUsage({ visitorId: visitor, notebookId: notebook, ...haikuCall });
    expect(event).toMatchObject({
      visitorId: visitor,
      notebookId: notebook,
      feature: 'chat',
      model: MODELS.chat,
      costMicroUsd: 1_500,
    });
  });

  it('keeps a cost the SDK reported instead of pricing the tokens (an Agent run)', async () => {
    const event = await recordUsage({
      visitorId: visitor,
      notebookId: notebook,
      ...haikuCall,
      feature: 'agent',
      model: MODELS.agent,
      costMicroUsd: 42_000,
    });
    expect(event).toMatchObject({ feature: 'agent', costMicroUsd: 42_000 });
  });
});

describe('spendSince', () => {
  it('adds up the cost of every event since a moment, overall or for one Visitor', async () => {
    const other = await createVisitor({ ipHash: null });
    await recordUsage({ visitorId: visitor, notebookId: notebook, ...haikuCall });
    await recordUsage({ visitorId: other, notebookId: null, ...haikuCall });

    expect(await spendSince({ since: start })).toBe(3_000);
    expect(await spendSince({ since: start, visitorId: visitor })).toBe(1_500);
    expect(await spendSince({ since: new Date(Date.now() + 60_000) })).toBe(0);
  });

  it('keeps the spend when the Notebook is deleted', async () => {
    await recordUsage({ visitorId: visitor, notebookId: notebook, ...haikuCall });
    await deleteNotebook(visitor, notebook);
    expect(await spendSince({ since: start, visitorId: visitor })).toBe(1_500);
  });
});

// Sonnet, 1000 in / 1000 out: 12_000 micro-dollars, more than the test allowance of $0.01.
const sonnetCall = {
  feature: 'studio' as const,
  model: MODELS.studio,
  inputTokens: 1_000,
  outputTokens: 1_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

describe('reserveUsage', () => {
  it('lets a call through while every cap has room', async () => {
    await recordUsage({ visitorId: visitor, notebookId: notebook, ...haikuCall });
    expect(await checkUsage({ visitorId: visitor, feature: 'chat' })).toBeNull();
  });

  it('stops a Visitor whose Daily allowance is used up until midnight in Berlin', async () => {
    await recordUsage({ visitorId: visitor, notebookId: notebook, ...sonnetCall });
    const other = await createVisitor({ ipHash: null });

    expect(await checkUsage({ visitorId: visitor, feature: 'chat' })).toEqual({
      reason: 'daily_allowance',
      retryAt: nextBerlinDayStart(new Date()),
    });
    expect(await checkUsage({ visitorId: other, feature: 'chat' })).toBeNull();
  });

  it('stops everyone once the daily, then the total Demo budget is used up', async () => {
    const others = await Promise.all([1, 2, 3, 4].map(() => createVisitor({ ipHash: null })));
    for (const other of others.slice(0, 3)) {
      await recordUsage({ visitorId: other, notebookId: null, ...sonnetCall });
    }
    expect(await checkUsage({ visitorId: visitor, feature: 'chat' })).toEqual({
      reason: 'demo_budget_daily',
      retryAt: nextBerlinDayStart(new Date()),
    });

    await recordUsage({ visitorId: others[3] ?? null, notebookId: null, ...sonnetCall });
    await recordUsage({ visitorId: null, notebookId: null, ...sonnetCall });
    expect(await checkUsage({ visitorId: visitor, feature: 'chat' })).toEqual({
      reason: 'demo_budget_total',
      retryAt: null,
    });
  });

  it('limits Briefings per Visitor per hour and says when the next one fits', async () => {
    const cheapBriefing = { ...sonnetCall, inputTokens: 1, outputTokens: 1 };
    const first = await recordUsage({ visitorId: visitor, notebookId: notebook, ...cheapBriefing });
    await recordUsage({ visitorId: visitor, notebookId: notebook, ...cheapBriefing });
    expect(await checkUsage({ visitorId: visitor, feature: 'studio' })).toBeNull();

    await recordUsage({ visitorId: visitor, notebookId: notebook, ...cheapBriefing });
    expect(await checkUsage({ visitorId: visitor, feature: 'studio' })).toEqual({
      reason: 'rate_limited',
      retryAt: new Date(first.at.getTime() + 60 * 60 * 1000),
    });
    // Chat counts only questions, not Briefings.
    expect(await checkUsage({ visitorId: visitor, feature: 'chat' })).toBeNull();
  });
});

describe('reserveUsage holds', () => {
  // The test hold for a Chat call is $0.001 (1_000 micro-dollars); the allowance is $0.01.
  const spendUpTo = (microUsd: number) =>
    recordUsage({
      visitorId: visitor,
      notebookId: notebook,
      ...haikuCall,
      costMicroUsd: microUsd,
    });

  it('admits only one of many concurrent calls when one hold fills the cap', async () => {
    await spendUpTo(9_500);
    // Open the connections first, or the first call finishes before the others connect.
    await Promise.all(Array.from({ length: 8 }, () => spendSince({ since: start })));
    const results = await Promise.all(
      Array.from({ length: 8 }, () => reserveUsage({ visitorId: visitor, feature: 'chat' })),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toEqual({
      ok: false,
      block: { reason: 'daily_allowance', retryAt: nextBerlinDayStart(new Date()) },
    });
  });

  it('frees the room again once the call is released', async () => {
    await spendUpTo(9_500);
    const first = await reserveUsage({ visitorId: visitor, feature: 'chat' });
    if (!first.ok) throw new Error('first reservation refused');
    expect((await reserveUsage({ visitorId: visitor, feature: 'chat' })).ok).toBe(false);

    await releaseUsage(first.reservationId);
    expect((await reserveUsage({ visitorId: visitor, feature: 'chat' })).ok).toBe(true);
  });

  it('counts calls still in flight against the hourly rate limit', async () => {
    const held = await Promise.all(
      [1, 2, 3].map(() => reserveUsage({ visitorId: visitor, feature: 'studio' })),
    );
    expect(held.every((result) => result.ok)).toBe(true);
    expect(await reserveUsage({ visitorId: visitor, feature: 'studio' })).toMatchObject({
      ok: false,
      block: { reason: 'rate_limited' },
    });
  });

  it('does not show holds as spend', async () => {
    await reserveUsage({ visitorId: visitor, feature: 'chat' });
    expect((await getSpendStatus(visitor)).allowance.spentMicroUsd).toBe(0);
  });
});

describe('getSpendStatus', () => {
  it('reports the Daily allowance left and whether the Demo budget is used up', async () => {
    await recordUsage({ visitorId: visitor, notebookId: notebook, ...haikuCall });

    expect(await getSpendStatus(visitor)).toEqual({
      blocked: null,
      allowance: {
        spentMicroUsd: 1_500,
        limitMicroUsd: 10_000,
        resetsAt: nextBerlinDayStart(new Date()),
      },
      demoBudget: {
        spentTodayMicroUsd: 1_500,
        dailyLimitMicroUsd: 30_000,
        spentTotalMicroUsd: 1_500,
        totalLimitMicroUsd: 50_000,
        exhausted: null,
      },
    });
  });

  it('gives a Visitor without a cookie the whole allowance', async () => {
    await recordUsage({ visitorId: visitor, notebookId: notebook, ...sonnetCall });
    await recordUsage({ visitorId: visitor, notebookId: notebook, ...sonnetCall });
    await recordUsage({ visitorId: visitor, notebookId: notebook, ...sonnetCall });

    const status = await getSpendStatus(null);
    expect(status.allowance.spentMicroUsd).toBe(0);
    expect(status.demoBudget.exhausted).toBe('daily');
    expect(status.blocked).toEqual({
      reason: 'demo_budget_daily',
      retryAt: nextBerlinDayStart(new Date()),
    });
  });

  it('reports a used-up Daily allowance as blocking the Visitor until midnight', async () => {
    await recordUsage({ visitorId: visitor, notebookId: notebook, ...sonnetCall });
    expect((await getSpendStatus(visitor)).blocked).toEqual({
      reason: 'daily_allowance',
      retryAt: nextBerlinDayStart(new Date()),
    });
  });
});

describe('withAgentSlot', () => {
  it('runs at most the concurrency limit of Agent runs at once, demo-wide', async () => {
    let releaseRuns = () => {};
    const runsHeld = new Promise<void>((resolve) => (releaseRuns = resolve));
    let started = 0;
    const run = () =>
      withAgentSlot(async () => {
        started += 1;
        await runsHeld;
        return 'done';
      });

    const first = run();
    const second = run();
    await vi.waitFor(() => expect(started).toBe(2));
    expect(await run()).toEqual({ ok: false, reason: 'agent_busy' });

    releaseRuns();
    expect(await first).toEqual({ ok: true, value: 'done' });
    expect(await second).toEqual({ ok: true, value: 'done' });
    expect(await run()).toEqual({ ok: true, value: 'done' });
  });

  it('frees the slot when the run throws', async () => {
    await expect(
      withAgentSlot(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(withAgentSlot(async () => 1)).resolves.toEqual({ ok: true, value: 1 });
    await expect(withAgentSlot(async () => 2)).resolves.toEqual({ ok: true, value: 2 });
  });
});
