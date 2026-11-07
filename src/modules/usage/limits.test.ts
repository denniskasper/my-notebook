import { describe, expect, it } from 'vitest';

import { berlinDayStart, nextBerlinDayStart, rateLimitRetryAt, spendBlock } from '.';

describe('berlinDayStart', () => {
  it('is midnight in Berlin, 23:00 UTC the day before in winter', () => {
    expect(berlinDayStart(new Date('2026-11-07T12:00:00Z'))).toEqual(
      new Date('2026-11-06T23:00:00Z'),
    );
  });

  it('is 22:00 UTC the day before in summer', () => {
    expect(berlinDayStart(new Date('2026-07-15T08:00:00Z'))).toEqual(
      new Date('2026-07-14T22:00:00Z'),
    );
  });

  it('already counts 23:30 UTC as the next Berlin day', () => {
    expect(berlinDayStart(new Date('2026-11-07T23:30:00Z'))).toEqual(
      new Date('2026-11-07T23:00:00Z'),
    );
    expect(berlinDayStart(new Date('2026-11-07T22:59:59Z'))).toEqual(
      new Date('2026-11-06T23:00:00Z'),
    );
  });

  it('handles the days the clocks change', () => {
    // 29 March 2026: clocks go forward at 02:00, the day started at 23:00 UTC.
    expect(berlinDayStart(new Date('2026-03-29T20:00:00Z'))).toEqual(
      new Date('2026-03-28T23:00:00Z'),
    );
    // 25 October 2026: clocks go back at 03:00, the day started at 22:00 UTC.
    expect(berlinDayStart(new Date('2026-10-25T20:00:00Z'))).toEqual(
      new Date('2026-10-24T22:00:00Z'),
    );
  });
});

describe('nextBerlinDayStart', () => {
  it('is the coming midnight in Berlin', () => {
    expect(nextBerlinDayStart(new Date('2026-11-07T12:00:00Z'))).toEqual(
      new Date('2026-11-07T23:00:00Z'),
    );
  });

  it('is a 23-hour day away on the day the clocks go forward', () => {
    expect(nextBerlinDayStart(new Date('2026-03-29T10:00:00Z'))).toEqual(
      new Date('2026-03-29T22:00:00Z'),
    );
  });

  it('is a 25-hour day away on the day the clocks go back', () => {
    expect(nextBerlinDayStart(new Date('2026-10-25T10:00:00Z'))).toEqual(
      new Date('2026-10-25T23:00:00Z'),
    );
  });
});

describe('spendBlock', () => {
  const limits = {
    demoDailyMicroUsd: 2_000_000,
    demoTotalMicroUsd: 13_000_000,
    allowanceMicroUsd: 500_000,
  };
  const spend = { demoToday: 0, demoTotal: 0, visitorToday: 0 };

  it('lets a call through while every cap has room', () => {
    expect(
      spendBlock({ demoToday: 1_999_999, demoTotal: 12_999_999, visitorToday: 499_999 }, limits),
    ).toBeNull();
  });

  it('blocks once the Daily allowance is used up', () => {
    expect(spendBlock({ ...spend, visitorToday: 500_000 }, limits)).toBe('daily_allowance');
  });

  it('blocks once the daily Demo budget is used up', () => {
    expect(spendBlock({ ...spend, demoToday: 2_000_000 }, limits)).toBe('demo_budget_daily');
  });

  it('reports the total Demo budget before the daily one, and both before the allowance', () => {
    expect(
      spendBlock({ demoToday: 2_000_000, demoTotal: 13_000_000, visitorToday: 500_000 }, limits),
    ).toBe('demo_budget_total');
    expect(spendBlock({ ...spend, demoToday: 2_000_000, visitorToday: 500_000 }, limits)).toBe(
      'demo_budget_daily',
    );
  });
});

describe('rateLimitRetryAt', () => {
  const now = new Date('2026-11-07T12:00:00Z');
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

  it('allows a call while fewer than the limit happened in the last hour', () => {
    expect(rateLimitRetryAt([minutesAgo(10), minutesAgo(5)], { limit: 3, now })).toBeNull();
  });

  it('ignores calls older than an hour', () => {
    expect(
      rateLimitRetryAt([minutesAgo(90), minutesAgo(61), minutesAgo(5)], { limit: 2, now }),
    ).toBeNull();
  });

  it('at the limit, is free again when the oldest call in the hour drops out', () => {
    expect(
      rateLimitRetryAt([minutesAgo(5), minutesAgo(40), minutesAgo(20)], { limit: 3, now }),
    ).toEqual(new Date('2026-11-07T12:20:00Z'));
  });

  it('over the limit, waits until only limit - 1 calls are left in the hour', () => {
    expect(
      rateLimitRetryAt([minutesAgo(50), minutesAgo(40), minutesAgo(30), minutesAgo(10)], {
        limit: 3,
        now,
      }),
    ).toEqual(new Date('2026-11-07T12:20:00Z'));
  });
});
