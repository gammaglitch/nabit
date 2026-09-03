import { describe, expect, test } from "vitest";
import {
  type ArchivedPageRef,
  buildArchiveIndex,
  canonicalize,
  resolveArchivedPage,
} from "@/features/sites/utils/archive-links";

function page(overrides: Partial<ArchivedPageRef> = {}): ArchivedPageRef {
  return {
    id: 1,
    itemId: 10,
    status: "done",
    url: "https://docs.site.com/guide/intro",
    ...overrides,
  };
}

describe("canonicalize", () => {
  test("ignores the parts of a URL that do not change which page it is", () => {
    const key = canonicalize("https://docs.site.com/guide/intro");

    // Scheme, www, a trailing slash, a fragment and a default port are all
    // noise for the purpose of "is this the page we archived?".
    expect(canonicalize("http://docs.site.com/guide/intro")).toBe(key);
    expect(canonicalize("https://www.docs.site.com/guide/intro")).toBe(key);
    expect(canonicalize("https://docs.site.com/guide/intro/")).toBe(key);
    expect(canonicalize("https://docs.site.com/guide/intro#install")).toBe(key);
    expect(canonicalize("https://docs.site.com:443/guide/intro")).toBe(key);
    expect(canonicalize("https://DOCS.SITE.COM/guide/intro")).toBe(key);
  });

  test("keeps the parts that do", () => {
    const key = canonicalize("https://docs.site.com/guide/intro");

    expect(canonicalize("https://docs.site.com/guide/other")).not.toBe(key);
    expect(canonicalize("https://other.site.com/guide/intro")).not.toBe(key);
    expect(canonicalize("https://docs.site.com/guide/intro?v=2")).not.toBe(key);
    expect(canonicalize("https://docs.site.com:8080/guide/intro")).not.toBe(
      key,
    );
  });

  test("does not reorder query parameters", () => {
    // Two archived pages that differ only in parameter order are separate
    // rows; collapsing them would point a link at the wrong copy.
    expect(canonicalize("https://site.com/a?x=1&y=2")).not.toBe(
      canonicalize("https://site.com/a?y=2&x=1"),
    );
  });

  test("rejects anything that cannot be an archived page", () => {
    expect(canonicalize("mailto:hi@site.com")).toBeNull();
    expect(canonicalize("javascript:alert(1)")).toBeNull();
    expect(canonicalize("not a url")).toBeNull();
    expect(canonicalize("#section")).toBeNull();
  });

  test("resolves a relative href against the page it was found on", () => {
    expect(
      canonicalize("../reference/api", "https://docs.site.com/guide/intro"),
    ).toBe(canonicalize("https://docs.site.com/reference/api"));
    expect(canonicalize("/top", "https://docs.site.com/guide/intro")).toBe(
      canonicalize("https://docs.site.com/top"),
    );
  });
});

describe("buildArchiveIndex", () => {
  test("indexes only pages that have something to show", () => {
    const index = buildArchiveIndex([
      page({ id: 1, url: "https://site.com/done" }),
      page({ id: 2, status: "queued", url: "https://site.com/queued" }),
      page({ id: 3, status: "failed", url: "https://site.com/failed" }),
      page({ id: 4, itemId: null, url: "https://site.com/no-item" }),
    ]);

    expect(index.size).toBe(1);
    expect(index.get(canonicalize("https://site.com/done") as string)).toBe(1);
  });

  test("keeps the first page when two collapse to the same key", () => {
    // Rows arrive parents-before-children, so first is the shallower page.
    const index = buildArchiveIndex([
      page({ id: 1, url: "https://site.com/a" }),
      page({ id: 2, url: "https://www.site.com/a/" }),
    ]);

    expect(index.size).toBe(1);
    expect(index.get(canonicalize("https://site.com/a") as string)).toBe(1);
  });

  test("skips a page whose URL cannot be parsed", () => {
    const index = buildArchiveIndex([page({ id: 1, url: "not a url" })]);

    expect(index.size).toBe(0);
  });
});

describe("resolveArchivedPage", () => {
  const index = buildArchiveIndex([
    page({ id: 1, url: "https://docs.site.com/guide/intro" }),
    page({ id: 2, url: "https://docs.site.com/reference/api" }),
  ]);
  const base = "https://docs.site.com/guide/intro";

  test("resolves an absolute link to an archived page", () => {
    expect(
      resolveArchivedPage(index, "https://docs.site.com/reference/api", base),
    ).toBe(2);
  });

  test("resolves a relative link against the page being read", () => {
    expect(resolveArchivedPage(index, "../reference/api", base)).toBe(2);
  });

  test("resolves a link that only differs by fragment or trailing slash", () => {
    expect(
      resolveArchivedPage(
        index,
        "https://docs.site.com/reference/api/#auth",
        base,
      ),
    ).toBe(2);
  });

  test("leaves a bare fragment alone rather than claiming the current page", () => {
    // `#install` resolves against the page being read and then loses its hash,
    // landing on that page's own key — which is in the index. Claiming it would
    // render an internal link whose click is swallowed and goes nowhere.
    expect(resolveArchivedPage(index, "#install", base)).toBeNull();
    expect(resolveArchivedPage(index, "#", base)).toBeNull();
  });

  test("leaves a link to the page being read alone", () => {
    expect(resolveArchivedPage(index, base, base)).toBeNull();
    expect(
      resolveArchivedPage(
        index,
        "https://www.docs.site.com/guide/intro/",
        base,
      ),
    ).toBeNull();
  });

  test("still resolves a fragment link that points at a different page", () => {
    expect(resolveArchivedPage(index, "../reference/api#auth", base)).toBe(2);
  });

  test("leaves a link to a page this crawl never archived alone", () => {
    expect(
      resolveArchivedPage(index, "https://elsewhere.com/post", base),
    ).toBeNull();
    expect(
      resolveArchivedPage(index, "https://docs.site.com/not-crawled", base),
    ).toBeNull();
  });

  test("leaves non-web and missing hrefs alone", () => {
    expect(resolveArchivedPage(index, "mailto:hi@site.com", base)).toBeNull();
    expect(resolveArchivedPage(index, undefined, base)).toBeNull();
  });
});
