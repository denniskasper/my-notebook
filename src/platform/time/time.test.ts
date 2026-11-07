import { describe, expect, it } from 'vitest';

import { berlinDayStart, nextBerlinDayStart } from '.';

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
