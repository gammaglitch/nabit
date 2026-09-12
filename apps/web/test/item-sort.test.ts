import { describe, expect, test } from "vitest";
import type { DisplayItem } from "@/features/items/utils/item-helpers";
import {
  DEFAULT_SORT,
  directionLabel,
  type SortSpec,
  sortItems,
  sortStamp,
} from "@/features/items/utils/item-sort";

function item(overrides: Partial<DisplayItem> & { id: number }): DisplayItem {
  return {
    author: null,
    commentCount: 0,
    contentText: null,
    domain: "example.com",
    excerpt: "",
    publishedAt: null,
    savedAt: 0,
    score: null,
    source: "article",
    sourceCreatedAt: null,
    sourceUrl: "https://example.com",
    subreddit: null,
    tags: [],
    title: "Untitled",
    updatedAt: 0,
    ...overrides,
  };
}

const ids = (items: DisplayItem[]) => items.map((i) => i.id);

const sort = (items: DisplayItem[], spec: SortSpec) =>
  ids(sortItems(items, spec));

describe("sortItems", () => {
  test("orders by date added in both directions", () => {
    const items = [
      item({ id: 1, savedAt: 200 }),
      item({ id: 2, savedAt: 100 }),
      item({ id: 3, savedAt: 300 }),
    ];

    expect(sort(items, { field: "added", direction: "desc" })).toEqual([
      3, 1, 2,
    ]);
    expect(sort(items, { field: "added", direction: "asc" })).toEqual([
      2, 1, 3,
    ]);
  });

  test("does not mutate the input", () => {
    const items = [
      item({ id: 1, savedAt: 100 }),
      item({ id: 2, savedAt: 200 }),
    ];

    sortItems(items, { field: "added", direction: "desc" });

    expect(ids(items)).toEqual([1, 2]);
  });

  /**
   * The reason this sort exists: a 2023 thread archived last night is "new" by
   * date added and "old" by date published, and only the second answers "what
   * is the most recent thing I saved a copy of".
   */
  test("published date is independent of when the item was added", () => {
    const items = [
      item({ id: 1, savedAt: 300, publishedAt: 100 }),
      item({ id: 2, savedAt: 100, publishedAt: 300 }),
    ];

    expect(sort(items, { field: "added", direction: "desc" })).toEqual([1, 2]);
    expect(sort(items, { field: "published", direction: "desc" })).toEqual([
      2, 1,
    ]);
  });

  // Flipping the direction must not bury every real result under the blanks.
  test("items missing the sorted field sink in both directions", () => {
    const items = [
      item({ id: 1, publishedAt: null }),
      item({ id: 2, publishedAt: 200 }),
      item({ id: 3, publishedAt: 100 }),
    ];

    expect(sort(items, { field: "published", direction: "desc" })).toEqual([
      2, 3, 1,
    ]);
    expect(sort(items, { field: "published", direction: "asc" })).toEqual([
      3, 2, 1,
    ]);
  });

  test("a score of zero still outranks an item with no score", () => {
    const items = [item({ id: 1, score: null }), item({ id: 2, score: 0 })];

    expect(sort(items, { field: "score", direction: "desc" })).toEqual([2, 1]);
    expect(sort(items, { field: "score", direction: "asc" })).toEqual([2, 1]);
  });

  test("equal values fall back to a stable id order, not query order", () => {
    const items = [
      item({ id: 5, savedAt: 100 }),
      item({ id: 9, savedAt: 100 }),
      item({ id: 7, savedAt: 100 }),
    ];

    expect(sort(items, { field: "added", direction: "desc" })).toEqual([
      9, 7, 5,
    ]);
    // Same tiebreak in the other direction: it is there to be predictable.
    expect(sort(items, { field: "added", direction: "asc" })).toEqual([
      9, 7, 5,
    ]);
  });

  test("titles sort case-insensitively with numbers in numeric order", () => {
    const items = [
      item({ id: 1, title: "banana" }),
      item({ id: 2, title: "Apple" }),
      item({ id: 3, title: "Chapter 10" }),
      item({ id: 4, title: "Chapter 2" }),
    ];

    expect(sort(items, { field: "title", direction: "asc" })).toEqual([
      2, 1, 4, 3,
    ]);
    expect(sort(items, { field: "title", direction: "desc" })).toEqual([
      3, 4, 1, 2,
    ]);
  });

  test("sorts by comment count", () => {
    const items = [
      item({ id: 1, commentCount: 3 }),
      item({ id: 2, commentCount: 41 }),
      item({ id: 3, commentCount: 0 }),
    ];

    expect(sort(items, { field: "comments", direction: "desc" })).toEqual([
      2, 1, 3,
    ]);
  });

  test("an unparseable updated timestamp sinks rather than scrambling the order", () => {
    const items = [
      item({ id: 1, updatedAt: null }),
      item({ id: 2, updatedAt: 100 }),
      item({ id: 3, updatedAt: 200 }),
    ];

    expect(sort(items, { field: "updated", direction: "desc" })).toEqual([
      3, 2, 1,
    ]);
  });
});

describe("directionLabel", () => {
  test("reads in the vocabulary of the field it describes", () => {
    expect(directionLabel(DEFAULT_SORT)).toBe("Newest first");
    expect(directionLabel({ field: "added", direction: "asc" })).toBe(
      "Oldest first",
    );
    expect(directionLabel({ field: "title", direction: "asc" })).toBe("A → Z");
    expect(directionLabel({ field: "score", direction: "desc" })).toBe(
      "Highest first",
    );
  });
});

describe("sortStamp", () => {
  const saved = Date.parse("2026-09-10T00:00:00.000Z");
  const published = Date.parse("2023-04-01T00:00:00.000Z");

  test("stamps the date added for fields that are not dates", () => {
    const stamp = sortStamp(item({ id: 1, savedAt: saved }), "title");

    expect(stamp.text).not.toContain("pub");
    expect(stamp.title).toContain("added 2026-09-10");
  });

  test("follows the sorted field so the list reads in the order it is in", () => {
    const stamp = sortStamp(
      item({ id: 1, savedAt: saved, publishedAt: published }),
      "published",
    );

    expect(stamp.text).toMatch(/^pub /);
    expect(stamp.title).toContain("published 2023-04-01");
    // The date added stays reachable on hover — it is still the fact the rest
    // of the app is keyed on.
    expect(stamp.title).toContain("added 2026-09-10");
  });

  test("an item the field does not apply to gets a dash, not a bare label", () => {
    const stamp = sortStamp(
      item({ id: 1, savedAt: saved, publishedAt: null }),
      "published",
    );

    expect(stamp.text).toBe("—");
    expect(stamp.title).toContain("no publication date");
  });
});
