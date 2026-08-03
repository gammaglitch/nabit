/**
 * Weekly period boundary math, in a caller-supplied IANA timezone.
 *
 * Pure and dependency-free so it can be unit-tested without a database or a
 * clock — the digest job's correctness lives almost entirely here.
 *
 * Everything is anchored to *wall-clock* time in the target zone rather than a
 * fixed number of hours, so "Monday 08:00" stays Monday 08:00 across a DST
 * transition instead of drifting to 07:00 or 09:00.
 */

export interface PeriodBounds {
  periodEnd: Date;
  periodStart: Date;
}

export interface PeriodConfig {
  /** 0 = Sunday, matching JS getUTCDay() and Postgres extract(dow ...). */
  dayOfWeek: number;
  /** Local hour the period closes on. */
  hour: number;
  timezone: string;
}

interface WallClock {
  day: number;
  hour: number;
  month: number;
  year: number;
}

const DAY_MS = 86_400_000;

function partsInZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  });

  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }

  return {
    day: parts.day,
    // Intl emits hour 24 for midnight under hour12:false in some engines.
    hour: parts.hour % 24,
    minute: parts.minute,
    month: parts.month,
    second: parts.second,
    year: parts.year,
  };
}

/** How far the zone is ahead of UTC at a given instant, in milliseconds. */
function offsetMs(date: Date, timeZone: string): number {
  const parts = partsInZone(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

/**
 * Converts a wall-clock reading in `timeZone` to the instant it refers to.
 *
 * Two passes: the first guesses an offset using the naive instant, the second
 * re-reads the offset at that guess. Without the second pass a boundary that
 * falls near a DST transition resolves an hour off, because the offset either
 * side of the jump differs from the offset at the naive timestamp.
 */
function wallClockToUtc(wall: WallClock, timeZone: string): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, 0, 0);
  const firstGuess = new Date(naive - offsetMs(new Date(naive), timeZone));

  return new Date(naive - offsetMs(firstGuess, timeZone));
}

/** Shifts a calendar date by whole days, without touching the hour. */
function shiftDays(wall: WallClock, days: number): WallClock {
  const shifted = new Date(
    Date.UTC(wall.year, wall.month - 1, wall.day) + days * DAY_MS,
  );

  return {
    day: shifted.getUTCDate(),
    hour: wall.hour,
    month: shifted.getUTCMonth() + 1,
    year: shifted.getUTCFullYear(),
  };
}

function weekdayOf(wall: WallClock): number {
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
}

/**
 * The most recent complete week as of `now`.
 *
 * `periodEnd` is the latest boundary at or before `now`; `periodStart` is the
 * boundary a week earlier. The window is half-open — [start, end) — so an item
 * ingested exactly on a boundary belongs to precisely one digest.
 */
export function resolvePeriod(now: Date, config: PeriodConfig): PeriodBounds {
  const local = partsInZone(now, config.timezone);
  const target: WallClock = {
    day: local.day,
    hour: config.hour,
    month: local.month,
    year: local.year,
  };

  const deltaDays = (weekdayOf(target) - config.dayOfWeek + 7) % 7;
  let end = shiftDays(target, -deltaDays);

  // Landing on the boundary weekday earlier in the day means this week's
  // boundary has not happened yet; the most recent complete week ended seven
  // days before it.
  if (wallClockToUtc(end, config.timezone).getTime() > now.getTime()) {
    end = shiftDays(end, -7);
  }

  return {
    periodEnd: wallClockToUtc(end, config.timezone),
    periodStart: wallClockToUtc(shiftDays(end, -7), config.timezone),
  };
}

/** Human label for a period, used as the digest's heading. */
export function formatPeriodLabel(bounds: PeriodBounds, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone,
    year: "numeric",
  });

  // The window is half-open, so the last *included* day is the day before the
  // closing boundary — labelling it with periodEnd would overstate by a day.
  const lastIncluded = new Date(bounds.periodEnd.getTime() - DAY_MS);

  return `${formatter.format(bounds.periodStart)} – ${formatter.format(lastIncluded)}`;
}
