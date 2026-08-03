import { describe, expect, test } from "bun:test";
import { normalizeClaimedDigest } from "../src/modules/digest/service";

// The claim CTE goes through db.execute, which bypasses Drizzle's column
// mappers — Postgres hands back timestamptz as a string. Casting the row to a
// type that claims `Date` compiled fine and then failed in production with
// "value.toISOString is not a function" the first time a date reached a query
// builder. These assert the conversion actually happens.
describe("normalizeClaimedDigest", () => {
  test("converts the timestamps Postgres actually returns", () => {
    const digest = normalizeClaimedDigest({
      attempts: 1,
      id: 7,
      maxAttempts: 3,
      periodEnd: "2026-08-03 08:00:00+00",
      periodStart: "2026-07-27 08:00:00+00",
    });

    expect(digest.periodStart).toBeInstanceOf(Date);
    expect(digest.periodEnd).toBeInstanceOf(Date);
    expect(digest.periodStart.toISOString()).toBe("2026-07-27T08:00:00.000Z");
    expect(digest.periodEnd.toISOString()).toBe("2026-08-03T08:00:00.000Z");
  });

  test("passes through values that are already Dates", () => {
    const periodStart = new Date("2026-07-27T08:00:00.000Z");
    const digest = normalizeClaimedDigest({
      attempts: 0,
      id: 1,
      maxAttempts: 3,
      periodEnd: new Date("2026-08-03T08:00:00.000Z"),
      periodStart,
    });

    expect(digest.periodStart.toISOString()).toBe(periodStart.toISOString());
    expect(digest.periodEnd).toBeInstanceOf(Date);
  });

  test("coerces counters, which some drivers return as strings", () => {
    const digest = normalizeClaimedDigest({
      attempts: "2",
      id: "7",
      maxAttempts: "3",
      periodEnd: "2026-08-03 08:00:00+00",
      periodStart: "2026-07-27 08:00:00+00",
    });

    // The retry branch compares these; string compare would make "10" < "3".
    expect(digest.attempts).toBe(2);
    expect(digest.maxAttempts).toBe(3);
    expect(digest.id).toBe(7);
    expect(digest.attempts < digest.maxAttempts).toBe(true);
  });

  test("the result survives the call that failed in production", () => {
    const digest = normalizeClaimedDigest({
      attempts: 1,
      id: 7,
      maxAttempts: 3,
      periodEnd: "2026-08-03 08:00:00+00",
      periodStart: "2026-07-27 08:00:00+00",
    });

    // Drizzle's timestamp mapper calls exactly this on the bound parameter.
    expect(() => digest.periodStart.toISOString()).not.toThrow();
    expect(() => digest.periodEnd.toISOString()).not.toThrow();
  });
});
