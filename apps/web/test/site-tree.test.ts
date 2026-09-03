import { describe, expect, test } from "vitest";
import {
  buildSiteTree,
  type CrawlPage,
  countPages,
  flattenVisible,
  isReadable,
  pageLabel,
} from "@/features/sites/utils/tree";

function page(overrides: Partial<CrawlPage> & { id: number }): CrawlPage {
  return {
    depth: 0,
    discoveryIndex: 0,
    errorMessage: null,
    isExternal: false,
    isLeaf: false,
    isRoot: false,
    itemId: overrides.id * 100,
    parentPageId: null,
    sourceType: "article",
    status: "done",
    title: null,
    url: `https://docs.site.com/p${overrides.id}`,
    ...overrides,
  };
}

describe("buildSiteTree", () => {
  test("nests children under the page that linked to them", () => {
    const tree = buildSiteTree([
      page({ id: 1, isRoot: true }),
      page({ id: 2, depth: 1, parentPageId: 1 }),
      page({ id: 3, depth: 1, parentPageId: 1 }),
      page({ id: 4, depth: 2, parentPageId: 2 }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(1);
    expect(tree[0].children.map((child) => child.id)).toEqual([2, 3]);
    expect(tree[0].children[0].children.map((c) => c.id)).toEqual([4]);
  });

  test("keeps the order the rows arrive in, which is discovery order", () => {
    const tree = buildSiteTree([
      page({ id: 1, isRoot: true }),
      page({ id: 9, depth: 1, discoveryIndex: 0, parentPageId: 1 }),
      page({ id: 5, depth: 1, discoveryIndex: 1, parentPageId: 1 }),
      page({ id: 7, depth: 1, discoveryIndex: 2, parentPageId: 1 }),
    ]);

    expect(tree[0].children.map((child) => child.id)).toEqual([9, 5, 7]);
  });

  test("shows an orphan at the root rather than dropping it", () => {
    const tree = buildSiteTree([
      page({ id: 1, isRoot: true }),
      page({ id: 2, depth: 1, parentPageId: 404 }),
    ]);

    expect(tree.map((node) => node.id)).toEqual([1, 2]);
  });

  test("does not hang on a page that claims itself as its parent", () => {
    const tree = buildSiteTree([page({ id: 1, parentPageId: 1 })]);

    expect(tree.map((node) => node.id)).toEqual([1]);
    expect(tree[0].children).toEqual([]);
  });

  test("handles an empty crawl", () => {
    expect(buildSiteTree([])).toEqual([]);
  });
});

describe("flattenVisible", () => {
  const tree = buildSiteTree([
    page({ id: 1, isRoot: true }),
    page({ id: 2, depth: 1, parentPageId: 1 }),
    page({ id: 3, depth: 2, parentPageId: 2 }),
    page({ id: 4, depth: 1, parentPageId: 1 }),
  ]);

  test("lists rows in visual order when everything is open", () => {
    expect(flattenVisible(tree, () => true).map((n) => n.id)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  test("omits the children of a collapsed page", () => {
    const collapsed = flattenVisible(tree, (id) => id !== 2);
    expect(collapsed.map((n) => n.id)).toEqual([1, 2, 4]);
  });
});

describe("pageLabel", () => {
  test("prefers the extracted title", () => {
    expect(
      pageLabel({ title: "Getting Started", url: "https://x.com/a" }),
    ).toBe("Getting Started");
  });

  test("falls back to a readable last path segment", () => {
    expect(
      pageLabel({
        title: null,
        url: "https://docs.site.com/guide/get_started",
      }),
    ).toBe("get started");
  });

  test("falls back to the hostname at the site root", () => {
    expect(pageLabel({ title: null, url: "https://docs.site.com/" })).toBe(
      "docs.site.com",
    );
  });

  test("survives a url it cannot parse", () => {
    expect(pageLabel({ title: null, url: "not a url" })).toBe("not a url");
  });
});

describe("isReadable", () => {
  test("only an archived page with an item can be read", () => {
    expect(isReadable(page({ id: 1 }))).toBe(true);
    expect(isReadable(page({ id: 2, status: "queued" }))).toBe(false);
    expect(isReadable(page({ id: 3, status: "skipped" }))).toBe(false);
    expect(isReadable(page({ id: 4, itemId: null }))).toBe(false);
  });
});

describe("countPages", () => {
  test("buckets every status", () => {
    expect(
      countPages([
        page({ id: 1 }),
        page({ id: 2, status: "queued" }),
        page({ id: 3, status: "failed" }),
        page({ id: 4, status: "skipped" }),
        page({ id: 5, status: "running" }),
      ]),
    ).toEqual({ done: 1, failed: 1, pending: 2, skipped: 1, total: 5 });
  });
});
