import { describe, expect, test } from "bun:test";
import {
  type CrawlScope,
  createLinkClassifier,
  resolvePathPrefix,
} from "../src/modules/crawl/scope";

function classifier(
  rootUrl: string,
  overrides: Partial<CrawlScope> = {},
) {
  return createLinkClassifier({
    rootUrl,
    scope: {
      mode: "host",
      followExternal: false,
      maxDepth: 3,
      ...overrides,
    },
  });
}

describe("resolvePathPrefix", () => {
  test("uses the directory of a file-shaped root", () => {
    expect(resolvePathPrefix("https://docs.site.com/guide/intro")).toBe(
      "/guide/",
    );
  });

  test("keeps a directory-shaped root as-is", () => {
    expect(resolvePathPrefix("https://docs.site.com/guide/")).toBe("/guide/");
  });

  test("falls back to the site root", () => {
    expect(resolvePathPrefix("https://docs.site.com/")).toBe("/");
    expect(resolvePathPrefix("https://docs.site.com/intro")).toBe("/");
  });
});

describe("host scope", () => {
  const classify = classifier("https://docs.site.com/guide/intro");

  test("follows any path on the same host", () => {
    expect(classify("https://docs.site.com/blog/2024", 0)).toMatchObject({
      follow: "expand",
      url: "https://docs.site.com/blog/2024",
      depth: 1,
    });
  });

  test("rejects a sibling subdomain and the apex", () => {
    expect(classify("https://api.site.com/reference", 0)).toMatchObject({
      follow: "skip",
      reason: "out-of-scope",
    });
    expect(classify("https://site.com/", 0)).toMatchObject({
      follow: "skip",
      reason: "out-of-scope",
    });
  });

  test("treats www as the same host", () => {
    const wwwClassify = classifier("https://www.site.com/docs/intro");
    expect(wwwClassify("https://site.com/docs/setup", 0)).toMatchObject({
      follow: "expand",
    });
  });
});

describe("path scope", () => {
  const classify = classifier("https://docs.site.com/guide/intro", {
    mode: "path",
    pathPrefix: "/guide/",
  });

  test("follows siblings under the root directory", () => {
    expect(classify("https://docs.site.com/guide/setup", 0)).toMatchObject({
      follow: "expand",
    });
    expect(classify("https://docs.site.com/guide/api/auth", 0)).toMatchObject({
      follow: "expand",
    });
  });

  test("rejects same-host paths outside the directory", () => {
    expect(classify("https://docs.site.com/blog/2024", 0)).toMatchObject({
      follow: "skip",
      reason: "out-of-scope",
    });
  });

  test("accepts the root itself even though it is not a directory", () => {
    expect(classify("https://docs.site.com/guide/intro", 0)).toMatchObject({
      follow: "expand",
    });
  });
});

describe("external links", () => {
  test("are skipped by default", () => {
    const classify = classifier("https://docs.site.com/guide/intro");
    expect(classify("https://blog.other.com/post", 0)).toMatchObject({
      follow: "skip",
      reason: "out-of-scope",
    });
  });

  test("are archived as leaves when enabled, never expanded", () => {
    const classify = classifier("https://docs.site.com/guide/intro", {
      followExternal: true,
    });
    expect(classify("https://blog.other.com/post", 0)).toMatchObject({
      follow: "leaf",
      external: true,
      depth: 1,
    });
  });
});

describe("depth budget", () => {
  const classify = classifier("https://docs.site.com/a", { maxDepth: 2 });

  test("expands below the cap", () => {
    expect(classify("https://docs.site.com/b", 0)).toMatchObject({
      follow: "expand",
      depth: 1,
    });
  });

  test("archives without expanding at the cap", () => {
    expect(classify("https://docs.site.com/b", 1)).toMatchObject({
      follow: "leaf",
      external: false,
      depth: 2,
    });
  });

  test("skips past the cap", () => {
    expect(classify("https://docs.site.com/b", 2)).toMatchObject({
      follow: "skip",
      reason: "max-depth",
    });
  });
});

describe("link hygiene", () => {
  const classify = classifier("https://docs.site.com/guide/intro");

  test("skips non-http protocols found in page chrome", () => {
    for (const href of [
      "mailto:hi@site.com",
      "javascript:void(0)",
      "tel:+1234",
      "data:text/plain,hi",
    ]) {
      expect(classify(href, 0)).toMatchObject({
        follow: "skip",
        reason: "unsupported-protocol",
      });
    }
  });

  test("skips assets that could never grade as an article", () => {
    for (const href of [
      "https://docs.site.com/manual.pdf",
      "https://docs.site.com/bundle.zip",
      "https://docs.site.com/logo.png",
      "https://docs.site.com/feed.xml",
    ]) {
      expect(classify(href, 0)).toMatchObject({
        follow: "skip",
        reason: "non-document",
      });
    }
  });

  test("skips unparseable hrefs", () => {
    expect(classify("not a url", 0)).toMatchObject({
      follow: "skip",
      reason: "unparseable",
    });
  });

  test("normalizes so trailing slashes, fragments and tracking params dedupe", () => {
    const variants = [
      "https://docs.site.com/guide/setup",
      "https://docs.site.com/guide/setup/",
      "https://docs.site.com/guide/setup#install",
      "https://docs.site.com/guide/setup?utm_source=toc",
    ];
    const urls = variants.map((href) => {
      const verdict = classify(href, 0);
      if (verdict.follow === "skip") throw new Error(`skipped ${href}`);
      return verdict.url;
    });
    expect(new Set(urls).size).toBe(1);
  });
});

describe("include and exclude patterns", () => {
  test("exclude wins over scope", () => {
    const classify = classifier("https://docs.site.com/a", {
      excludePattern: "/changelog/",
    });
    expect(classify("https://docs.site.com/changelog/v2", 0)).toMatchObject({
      follow: "skip",
      reason: "excluded",
    });
  });

  test("include narrows to matching urls only", () => {
    const classify = classifier("https://docs.site.com/a", {
      includePattern: "/guide/",
    });
    expect(classify("https://docs.site.com/guide/setup", 0)).toMatchObject({
      follow: "expand",
    });
    expect(classify("https://docs.site.com/blog/post", 0)).toMatchObject({
      follow: "skip",
      reason: "not-included",
    });
  });

  test("an unusable pattern fails when the crawl is built, not mid-crawl", () => {
    expect(() =>
      classifier("https://docs.site.com/a", { excludePattern: "([" }),
    ).toThrow(/Invalid exclude pattern/);
  });
});
