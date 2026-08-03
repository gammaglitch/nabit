import { describe, expect, test } from "bun:test";
import {
  formatPeriodLabel,
  resolvePeriod,
} from "../src/modules/digest/periods";

// Weekdays used below, verified independently: 2026-03-23, 2026-03-30,
// 2026-04-06 and 2026-04-13 are Mondays; 2026-04-08 is a Wednesday.
// Europe/Berlin moves +01:00 -> +02:00 on Sunday 2026-03-29.
const MONDAY_0800_UTC = { dayOfWeek: 1, hour: 8, timezone: "UTC" };

describe("resolvePeriod", () => {
  test("mid-week resolves to the last completed boundary", () => {
    const { periodStart, periodEnd } = resolvePeriod(
      new Date("2026-04-08T12:00:00.000Z"),
      MONDAY_0800_UTC,
    );

    expect(periodEnd.toISOString()).toBe("2026-04-06T08:00:00.000Z");
    expect(periodStart.toISOString()).toBe("2026-03-30T08:00:00.000Z");
  });

  test("an instant exactly on the boundary closes that period", () => {
    // The window is half-open, so the boundary instant belongs to the period
    // that is starting, not the one that just ended — otherwise an item
    // ingested on the tick would land in two digests or none.
    const { periodEnd } = resolvePeriod(
      new Date("2026-04-06T08:00:00.000Z"),
      MONDAY_0800_UTC,
    );

    expect(periodEnd.toISOString()).toBe("2026-04-06T08:00:00.000Z");
  });

  test("earlier in the day on the boundary weekday falls back a week", () => {
    const { periodStart, periodEnd } = resolvePeriod(
      new Date("2026-04-06T07:59:00.000Z"),
      MONDAY_0800_UTC,
    );

    expect(periodEnd.toISOString()).toBe("2026-03-30T08:00:00.000Z");
    expect(periodStart.toISOString()).toBe("2026-03-23T08:00:00.000Z");
  });

  test("boundaries hold local wall-clock time across a DST transition", () => {
    // Both ends are 08:00 in Berlin, but they sit either side of the spring
    // forward, so their UTC hours differ. A naive "end minus 168 hours" would
    // silently shift the window by an hour and drop or double-count items.
    const { periodStart, periodEnd } = resolvePeriod(
      new Date("2026-04-01T12:00:00.000Z"),
      { dayOfWeek: 1, hour: 8, timezone: "Europe/Berlin" },
    );

    expect(periodEnd.toISOString()).toBe("2026-03-30T06:00:00.000Z");
    expect(periodStart.toISOString()).toBe("2026-03-23T07:00:00.000Z");

    const hours =
      (periodEnd.getTime() - periodStart.getTime()) / (60 * 60 * 1000);
    expect(hours).toBe(167);
  });

  test("consecutive weeks abut exactly, with no gap or overlap", () => {
    const thisWeek = resolvePeriod(
      new Date("2026-04-08T12:00:00.000Z"),
      MONDAY_0800_UTC,
    );
    const lastWeek = resolvePeriod(
      new Date("2026-04-01T12:00:00.000Z"),
      MONDAY_0800_UTC,
    );

    expect(lastWeek.periodEnd.toISOString()).toBe(
      thisWeek.periodStart.toISOString(),
    );
  });

  test("shifting the reference instant walks back whole periods", () => {
    // This is how DigestService.trigger reaches an older week for a rebuild:
    // it moves the reference back N*7 days and re-resolves, so each step is
    // recomputed against the calendar instead of assuming 168-hour weeks.
    const now = new Date("2026-04-08T12:00:00.000Z");
    const current = resolvePeriod(now, MONDAY_0800_UTC);
    const twoBack = resolvePeriod(
      new Date(now.getTime() - 2 * 7 * 86_400_000),
      MONDAY_0800_UTC,
    );

    expect(current.periodEnd.toISOString()).toBe("2026-04-06T08:00:00.000Z");
    expect(twoBack.periodEnd.toISOString()).toBe("2026-03-23T08:00:00.000Z");
    expect(twoBack.periodStart.toISOString()).toBe("2026-03-16T08:00:00.000Z");
  });

  test("a Sunday boundary is reachable (dayOfWeek 0)", () => {
    const { periodEnd } = resolvePeriod(new Date("2026-04-08T12:00:00.000Z"), {
      dayOfWeek: 0,
      hour: 0,
      timezone: "UTC",
    });

    expect(periodEnd.toISOString()).toBe("2026-04-05T00:00:00.000Z");
  });
});

describe("formatPeriodLabel", () => {
  test("labels the last included day, not the closing boundary", () => {
    const label = formatPeriodLabel(
      {
        periodEnd: new Date("2026-04-06T08:00:00.000Z"),
        periodStart: new Date("2026-03-30T08:00:00.000Z"),
      },
      "UTC",
    );

    // Reads "30 Mar – 5 Apr", not "– 6 Apr": nothing from the 6th is in it.
    expect(label).toBe("30 Mar 2026 – 5 Apr 2026");
  });
});
