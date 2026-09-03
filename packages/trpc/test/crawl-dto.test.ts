import { describe, expect, test } from "bun:test";
import {
  DeleteCrawlInput,
  GetCrawlOutput,
  StartCrawlInput,
} from "../src/modules/crawl/dto";

describe("@repo/trpc crawl DTOs", () => {
  test("applies the defaults a bare start relies on", () => {
    const parsed = StartCrawlInput.parse({
      url: "https://docs.site.com/guide/",
    });

    // Same host, one page deep enough to be useful, and no wandering off-site.
    expect(parsed.scope).toBe("host");
    expect(parsed.followExternal).toBe(false);
    expect(parsed.maxDepth).toBe(3);
    expect(parsed.maxPages).toBe(200);
  });

  test("keeps an explicit scope and external opt-in", () => {
    const parsed = StartCrawlInput.parse({
      followExternal: true,
      scope: "path",
      url: "https://docs.site.com/guide/intro",
    });

    expect(parsed.scope).toBe("path");
    expect(parsed.followExternal).toBe(true);
  });

  test("rejects a scope mode the crawler cannot honour", () => {
    // 'domain' would need a public-suffix list; it is deliberately not offered.
    const result = StartCrawlInput.safeParse({
      scope: "domain",
      url: "https://docs.site.com/",
    });

    expect(result.success).toBe(false);
  });

  test("rejects budgets outside what the service will clamp to", () => {
    expect(
      StartCrawlInput.safeParse({ maxDepth: 99, url: "https://a.com/" })
        .success,
    ).toBe(false);
    expect(
      StartCrawlInput.safeParse({ maxPages: 0, url: "https://a.com/" }).success,
    ).toBe(false);
  });

  test("rejects a start url that is not a url", () => {
    expect(StartCrawlInput.safeParse({ url: "docs.site.com" }).success).toBe(
      false,
    );
  });

  test("deleting a crawl keeps the archived pages unless asked", () => {
    expect(DeleteCrawlInput.parse({ id: 1 }).deleteItems).toBe(false);
  });

  test("a page tree round-trips, including a skipped page with no item", () => {
    const parsed = GetCrawlOutput.parse({
      crawl: {
        createdAt: "2026-09-01T10:00:00.000Z",
        errorMessage: null,
        excludePattern: null,
        finishedAt: null,
        followExternal: false,
        id: 1,
        includePattern: null,
        label: "Handbook",
        maxDepth: 3,
        maxPages: 200,
        pagesDone: 1,
        pagesFailed: 0,
        pagesQueued: 1,
        pathPrefix: null,
        rootItemId: 10,
        rootUrl: "https://docs.site.com/guide",
        scope: "host",
        status: "running",
        updatedAt: "2026-09-01T10:00:00.000Z",
      },
      pages: [
        {
          depth: 0,
          discoveryIndex: 0,
          errorMessage: null,
          id: 1,
          isExternal: false,
          isLeaf: false,
          isRoot: true,
          itemId: 10,
          parentPageId: null,
          sourceType: "article",
          status: "done",
          title: "Handbook",
          url: "https://docs.site.com/guide",
        },
        {
          depth: 1,
          discoveryIndex: 0,
          errorMessage: "Disallowed by robots.txt",
          id: 2,
          isExternal: false,
          isLeaf: false,
          isRoot: false,
          itemId: null,
          parentPageId: 1,
          sourceType: null,
          status: "skipped",
          title: null,
          url: "https://docs.site.com/private",
        },
      ],
    });

    expect(parsed.pages).toHaveLength(2);
    expect(parsed.pages[1].itemId).toBeNull();
    expect(parsed.pages[1].status).toBe("skipped");
  });
});
