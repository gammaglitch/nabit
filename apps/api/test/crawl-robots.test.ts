import { describe, expect, test } from "bun:test";
import { isPathAllowed, parseRobots } from "../src/modules/crawl/robots";

describe("parseRobots", () => {
  test("prefers a group naming us over the wildcard group", () => {
    const rules = parseRobots(
      `User-agent: *
       Disallow: /

       User-agent: nabit
       Disallow: /private/
       Crawl-delay: 2`,
      "nabit",
    );

    expect(rules.disallow).toEqual(["/private/"]);
    expect(rules.crawlDelayMs).toBe(2000);
    expect(isPathAllowed(rules, "/guide/intro")).toBe(true);
  });

  test("falls back to the wildcard group when nothing names us", () => {
    const rules = parseRobots(
      `User-agent: googlebot
       Disallow: /

       User-agent: *
       Disallow: /admin/`,
      "nabit",
    );

    expect(rules.disallow).toEqual(["/admin/"]);
  });

  test("consecutive user-agent lines share one group of directives", () => {
    const rules = parseRobots(
      `User-agent: nabit
       User-agent: otherbot
       Disallow: /shared/`,
      "nabit",
    );

    expect(rules.disallow).toEqual(["/shared/"]);
  });

  test("an empty Disallow means allow everything, not block everything", () => {
    const rules = parseRobots("User-agent: *\nDisallow:", "nabit");

    expect(rules.disallow).toEqual([]);
    expect(isPathAllowed(rules, "/anything")).toBe(true);
  });

  test("ignores comments and unknown directives", () => {
    const rules = parseRobots(
      `# a comment
       User-agent: *
       Sitemap: https://site.com/sitemap.xml
       Disallow: /x/ # trailing comment`,
      "nabit",
    );

    expect(rules.disallow).toEqual(["/x/"]);
  });
});

describe("isPathAllowed", () => {
  test("blocks paths under a disallowed prefix", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /private/", "nabit");

    expect(isPathAllowed(rules, "/private/secret")).toBe(false);
    expect(isPathAllowed(rules, "/public/page")).toBe(true);
  });

  test("a more specific Allow carves an exception out of a broad Disallow", () => {
    const rules = parseRobots(
      "User-agent: *\nDisallow: /docs/\nAllow: /docs/public/",
      "nabit",
    );

    expect(isPathAllowed(rules, "/docs/internal")).toBe(false);
    expect(isPathAllowed(rules, "/docs/public/intro")).toBe(true);
  });

  test("supports * wildcards and $ end anchors", () => {
    const rules = parseRobots(
      "User-agent: *\nDisallow: /*.json$\nDisallow: /a/*/b",
      "nabit",
    );

    expect(isPathAllowed(rules, "/data/file.json")).toBe(false);
    expect(isPathAllowed(rules, "/data/file.json.html")).toBe(true);
    expect(isPathAllowed(rules, "/a/anything/b")).toBe(false);
  });

  test("matches against the query string too", () => {
    const rules = parseRobots(
      "User-agent: *\nDisallow: /*?replytocom",
      "nabit",
    );

    expect(isPathAllowed(rules, "/post?replytocom=12")).toBe(false);
    expect(isPathAllowed(rules, "/post")).toBe(true);
  });
});
