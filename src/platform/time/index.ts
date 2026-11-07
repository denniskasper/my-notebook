/** The Demo budget and the Daily allowance follow the Berlin calendar day. */
const TIME_ZONE = 'Europe/Berlin';

const berlinParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** Berlin wall-clock time of `instant`, read as if it were UTC. */
function berlinWallClock(instant: Date): number {
  const parts = Object.fromEntries(
    berlinParts.formatToParts(instant).map((part) => [part.type, Number(part.value)]),
  );
  return Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
}

/** The instant of midnight in Berlin on the Berlin calendar date `y-m-d`. */
function berlinMidnight(year: number, monthIndex: number, day: number): Date {
  const utcMidnight = Date.UTC(year, monthIndex, day);
  // Berlin's clocks change at 01:00 UTC, so the offset at UTC midnight is the one at Berlin midnight.
  const offset = berlinWallClock(new Date(utcMidnight)) - utcMidnight;
  return new Date(utcMidnight - offset);
}

/** Midnight in Berlin that started the day `now` falls in. */
export function berlinDayStart(now: Date): Date {
  const wall = new Date(berlinWallClock(now));
  return berlinMidnight(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
}

/** The coming midnight in Berlin, when the daily caps reset. */
export function nextBerlinDayStart(now: Date): Date {
  const wall = new Date(berlinWallClock(now));
  return berlinMidnight(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1);
}
