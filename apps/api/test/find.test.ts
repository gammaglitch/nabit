import { describe, expect, test } from "bun:test";
import {
  buildFindPrompt,
  MAX_FIND_MATCHES,
  verifyMatches,
} from "../src/modules/find/service";

describe("buildFindPrompt", () => {
  test("numbers passages by their index in the request", () => {
    const built = buildFindPrompt(
      { passages: ["Alpha.", "  ", "Gamma\n  delta."], query: "greek" },
      10_000,
    );

    expect(built.sentCount).toBe(3);
    expect(built.prompt).toContain("[0] Alpha.\n[2] Gamma delta.");
    expect(built.prompt).not.toContain("[1]");
    expect(built.prompt).toEndWith("Query: greek");
  });

  test("stops at whole passages once the context budget is spent", () => {
    const passages = ["a".repeat(40), "b".repeat(40), "c".repeat(40)];
    const built = buildFindPrompt({ passages, query: "q" }, 100);

    expect(built.sentCount).toBe(2);
    expect(built.prompt).toContain("[1] ");
    expect(built.prompt).not.toContain("[2] ");
    expect(built.prompt).toContain("cut off at a length limit");
  });
});

describe("verifyMatches", () => {
  const passages = ["The cache is warmed at boot.", "Unrelated.", "Tail."];

  test("drops passage numbers the model was never shown", () => {
    const verified = verifyMatches(
      [
        { passage: 7, quote: "", reason: "made up" },
        { passage: -1, quote: "", reason: "made up" },
        { passage: 2, quote: "", reason: "cut off" },
        { passage: 1.5, quote: "", reason: "not an index" },
        { passage: 0, quote: "", reason: "real" },
      ],
      passages,
      2,
    );

    expect(verified).toEqual([{ passage: 0, quote: null, reason: "real" }]);
  });

  test("keeps a quote only if it is really in its passage", () => {
    const verified = verifyMatches(
      [
        { passage: 0, quote: "cache  is WARMED", reason: "real quote" },
        { passage: 1, quote: "the cache", reason: "wrong passage" },
      ],
      passages,
      passages.length,
    );

    expect(verified).toEqual([
      { passage: 0, quote: "cache is WARMED", reason: "real quote" },
      // Downgraded to the whole passage, not dropped.
      { passage: 1, quote: null, reason: "wrong passage" },
    ]);
  });

  test("dedupes and caps the result list", () => {
    const many = Array.from({ length: 50 }, (_, index) => `Passage ${index}.`);
    const matches = [0, 0, ...many.keys()].map((passage) => ({
      passage,
      quote: "",
      reason: "",
    }));
    const verified = verifyMatches(matches, many, many.length);

    expect(verified).toHaveLength(MAX_FIND_MATCHES);
    expect(new Set(verified.map((match) => match.passage)).size).toBe(
      MAX_FIND_MATCHES,
    );
  });
});
