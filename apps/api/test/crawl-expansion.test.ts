import { describe, expect, test } from "bun:test";
import {
  type Candidate,
  planExpansion,
  selectCandidates,
} from "../src/modules/crawl/expansion";
import { createLinkClassifier } from "../src/modules/crawl/scope";

const classify = createLinkClassifier({
  rootUrl: "https://docs.site.com/guide/intro",
  scope: { followExternal: true, maxDepth: 3, mode: "host" },
});

function candidate(url: string, overrides: Partial<Candidate> = {}): Candidate {
  return { depth: 1, isExternal: false, isLeaf: false, url, ...overrides };
}

const allowAll = () => true;

describe("selectCandidates", () => {
  test("drops links the scope rejects and keeps the rest in order", () => {
    const candidates = selectCandidates({
      classify,
      links: [
        "https://docs.site.com/guide/b",
        "mailto:hi@site.com",
        "https://docs.site.com/logo.png",
        "https://docs.site.com/guide/a",
      ],
      parentDepth: 0,
    });

    expect(candidates.map((c) => c.url)).toEqual([
      "https://docs.site.com/guide/b",
      "https://docs.site.com/guide/a",
    ]);
  });

  test("keeps the first occurrence of a repeated link", () => {
    // A nav block in both the header and the footer is the normal case, not a
    // pathological one.
    const candidates = selectCandidates({
      classify,
      links: [
        "https://docs.site.com/guide/a",
        "https://docs.site.com/guide/b",
        "https://docs.site.com/guide/a/",
        "https://docs.site.com/guide/a#top",
      ],
      parentDepth: 0,
    });

    expect(candidates.map((c) => c.url)).toEqual([
      "https://docs.site.com/guide/a",
      "https://docs.site.com/guide/b",
    ]);
  });

  test("marks an off-site page as an external leaf", () => {
    const [external] = selectCandidates({
      classify,
      links: ["https://blog.other.com/post"],
      parentDepth: 0,
    });

    expect(external).toMatchObject({ isExternal: true, isLeaf: true });
  });

  test("marks an in-scope page at the depth cap as a leaf", () => {
    const [atCap] = selectCandidates({
      classify,
      links: ["https://docs.site.com/guide/deep"],
      parentDepth: 2,
    });

    expect(atCap).toMatchObject({ depth: 3, isExternal: false, isLeaf: true });
  });

  test("returns nothing when a page links nowhere useful", () => {
    expect(
      selectCandidates({
        classify,
        links: ["#top", "javascript:void(0)"],
        parentDepth: 0,
      }),
    ).toEqual([]);
  });
});

describe("planExpansion", () => {
  test("queues everything when there is budget for it", () => {
    const rows = planExpansion({
      candidates: [candidate("https://a.com/1"), candidate("https://a.com/2")],
      isAllowedByRobots: allowAll,
      maxPages: 10,
      pagesUsed: 1,
    });

    expect(rows.map((row) => row.status)).toEqual(["queued", "queued"]);
    expect(rows.map((row) => row.discoveryIndex)).toEqual([0, 1]);
    expect(rows.every((row) => row.errorMessage === null)).toBe(true);
  });

  test("stops queueing at the cap but still records what it found", () => {
    const rows = planExpansion({
      candidates: [
        candidate("https://a.com/1"),
        candidate("https://a.com/2"),
        candidate("https://a.com/3"),
      ],
      isAllowedByRobots: allowAll,
      maxPages: 5,
      // Four already spent, so exactly one more fits.
      pagesUsed: 4,
    });

    expect(rows.map((row) => row.status)).toEqual([
      "queued",
      "skipped",
      "skipped",
    ]);
    // Recorded, not dropped — otherwise a capped crawl just looks short.
    expect(rows[1].errorMessage).toBe("Crawl page limit of 5 reached");
    expect(rows).toHaveLength(3);
  });

  test("queues nothing once the budget is already spent", () => {
    const rows = planExpansion({
      candidates: [candidate("https://a.com/1")],
      isAllowedByRobots: allowAll,
      maxPages: 3,
      pagesUsed: 3,
    });

    expect(rows[0].status).toBe("skipped");
  });

  test("treats an over-spent budget as spent rather than going negative", () => {
    const rows = planExpansion({
      candidates: [candidate("https://a.com/1")],
      isAllowedByRobots: allowAll,
      maxPages: 3,
      pagesUsed: 9,
    });

    expect(rows[0].status).toBe("skipped");
  });

  test("records a robots-disallowed page without spending budget on it", () => {
    const rows = planExpansion({
      candidates: [
        candidate("https://a.com/private"),
        candidate("https://a.com/public"),
      ],
      isAllowedByRobots: (url) => !url.includes("private"),
      maxPages: 1,
      pagesUsed: 0,
    });

    expect(rows[0]).toMatchObject({
      errorMessage: "Disallowed by robots.txt",
      status: "skipped",
    });
    // The disallowed page did not consume the single available slot.
    expect(rows[1].status).toBe("queued");
  });

  test("carries the leaf and external flags through to the rows", () => {
    const rows = planExpansion({
      candidates: [
        candidate("https://other.com/x", { isExternal: true, isLeaf: true }),
      ],
      isAllowedByRobots: allowAll,
      maxPages: 10,
      pagesUsed: 0,
    });

    expect(rows[0]).toMatchObject({ isExternal: true, isLeaf: true });
  });

  test("plans nothing from nothing", () => {
    expect(
      planExpansion({
        candidates: [],
        isAllowedByRobots: allowAll,
        maxPages: 10,
        pagesUsed: 0,
      }),
    ).toEqual([]);
  });
});
