import { describe, expect, test } from "bun:test";
import {
  getIngestor,
  normalizeSourceUrl,
  resolveIngestorName,
} from "../src/index";

describe("normalizeSourceUrl", () => {
  test("strips tracking params and normalizes hostname", () => {
    expect(
      normalizeSourceUrl(
        "https://twitter.com/someone/status/123?utm_source=rss&fbclid=abc",
      ),
    ).toBe("https://x.com/someone/status/123");
  });
});

describe("resolveIngestorName", () => {
  test("resolves source-specific ingestors", () => {
    expect(resolveIngestorName("https://x.com/someone/status/123")).toBe(
      "tweet",
    );
    expect(
      resolveIngestorName(
        "https://reddit.com/r/typescript/comments/abc123/demo",
      ),
    ).toBe("reddit");
    expect(
      resolveIngestorName("https://news.ycombinator.com/item?id=999"),
    ).toBe("hacker_news");
    expect(resolveIngestorName("https://example.com/story")).toBe("generic");
  });
});

describe("tweet ingestor", () => {
  test("extracts tweet payloads into structured content", async () => {
    const tweet = getIngestor("tweet");
    const extraction = await tweet.extract({
      snapshot: {
        body: JSON.stringify({
          core: {
            user_results: {
              result: {
                core: {
                  name: "Delta",
                  screen_name: "delta",
                },
                legacy: {},
                rest_id: "u-1",
              },
            },
          },
          legacy: {
            bookmark_count: 1,
            created_at: "Wed Oct 10 20:19:24 +0000 2018",
            favorite_count: 2,
            full_text: "Ship it.",
            reply_count: 3,
            retweet_count: 4,
          },
          rest_id: "123",
        }),
        contentType: "application/json",
      },
      url: "https://x.com/delta/status/123",
    });

    expect(extraction.status).toBe("success");
    expect(extraction.sourceType).toBe("tweet");
    expect(extraction.author).toBe("delta");
    expect(extraction.contentText).toBe("Ship it.");
    expect(extraction.externalId).toBe("123");
  });
});
