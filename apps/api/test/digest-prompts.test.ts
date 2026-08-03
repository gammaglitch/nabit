import { describe, expect, test } from "bun:test";
import {
  buildDigestPrompt,
  buildSummaryPrompt,
} from "../src/modules/digest/prompts";

describe("buildSummaryPrompt", () => {
  test("passes a short document through untouched", () => {
    const built = buildSummaryPrompt({
      document: "A short article body.",
      maxContextChars: 1000,
      title: "Short piece",
    });

    expect(built.truncated).toBe(false);
    expect(built.prompt).toContain("Title: Short piece");
    expect(built.prompt).toContain("A short article body.");
    expect(built.prompt).not.toContain("cut off");
  });

  test("truncates at the budget and says so", () => {
    const built = buildSummaryPrompt({
      document: "x".repeat(500),
      maxContextChars: 100,
      title: null,
    });

    expect(built.truncated).toBe(true);
    // The model has to know the ending is missing, or it will summarize a
    // half-read article as though it were the whole thing.
    expect(built.prompt).toContain("cut off");
    expect(built.prompt).toContain("x".repeat(100));
    expect(built.prompt).not.toContain("x".repeat(101));
  });

  test("is stable for identical input, so the staleness hash is stable", () => {
    const input = {
      document: "Body text.",
      maxContextChars: 1000,
      title: "T",
    };

    expect(buildSummaryPrompt(input).prompt).toBe(
      buildSummaryPrompt(input).prompt,
    );
  });

  test("changes when the document changes, so a re-extract invalidates", () => {
    const first = buildSummaryPrompt({
      document: "Original body.",
      maxContextChars: 1000,
      title: "T",
    });
    const second = buildSummaryPrompt({
      document: "Re-extracted body.",
      maxContextChars: 1000,
      title: "T",
    });

    expect(first.prompt).not.toBe(second.prompt);
  });
});

describe("buildDigestPrompt", () => {
  const items = [
    {
      sourceType: "hacker_news",
      sourceUrl: "https://news.ycombinator.com/item?id=1",
      summary: "A summary of the first thing.",
      title: "First thing",
    },
    {
      sourceType: "webpage",
      sourceUrl: "https://example.com/second",
      summary: "A summary of the second thing.",
      title: "Second thing",
    },
  ];

  test("includes every item, its source and its summary, in order", () => {
    const built = buildDigestPrompt(items, {
      omittedCount: 0,
      periodLabel: "30 Mar 2026 – 5 Apr 2026",
    });

    expect(built.prompt).toContain("30 Mar 2026 – 5 Apr 2026");
    expect(built.prompt).toContain("Items saved: 2");
    expect(built.prompt).toContain("1. First thing");
    expect(built.prompt).toContain("2. Second thing");
    expect(built.prompt).toContain("https://example.com/second");
    expect(built.prompt).toContain("A summary of the first thing.");
    expect(built.prompt).not.toContain("could not be summarized");
  });

  test("tells the model when items were dropped", () => {
    const built = buildDigestPrompt(items, {
      omittedCount: 3,
      periodLabel: "30 Mar 2026 – 5 Apr 2026",
    });

    // A digest that quietly omitted items would read as a complete week.
    expect(built.prompt).toContain("3 further item(s)");
  });

  test("survives an item with no source URL", () => {
    const built = buildDigestPrompt(
      [{ ...items[0], sourceUrl: null, title: null }],
      { omittedCount: 0, periodLabel: "week" },
    );

    expect(built.prompt).toContain("Untitled");
    expect(built.prompt).toContain("(no source URL)");
  });
});
