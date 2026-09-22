import { describe, expect, test } from "vitest";
import { formatUsd } from "@/features/usage/utils/format";

describe("formatUsd", () => {
  test("shows nothing spent as a bare zero", () => {
    expect(formatUsd(0)).toBe("$0");
  });

  test("keeps four decimals below a cent, where most calls land", () => {
    expect(formatUsd(0.0004)).toBe("$0.0004");
    expect(formatUsd(0.00004)).toBe("$0.0000");
    expect(formatUsd(0.009_95)).toBe("$0.0100");
  });

  test("falls back to two decimals from a cent up", () => {
    expect(formatUsd(0.01)).toBe("$0.01");
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatUsd(123.456)).toBe("$123.46");
  });

  test("marks an unpriced call rather than calling it free", () => {
    expect(formatUsd(null)).toBe("—");
  });
});
