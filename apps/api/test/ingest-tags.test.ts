import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { normalizeTagNames } from "../src/modules/ingest/service";
import { buildApp } from "../src/server";

/**
 * `/ingest` and `/ingest/batch` take an unvalidated body — they never pass
 * through the tRPC zod schema — so this function is the only thing standing
 * between a caller's `tags` field and the `ingest_jobs` row.
 */
describe("normalizeTagNames", () => {
  test("matches what TagsService.create would have stored", () => {
    // Same trim + lowercase, so an ingest-applied tag reuses the reader's row
    // instead of creating a near-duplicate beside it.
    expect(normalizeTagNames(["  HN Favorites  "])).toEqual(["hn favorites"]);
  });

  test("collapses names that differ only by case or padding", () => {
    expect(normalizeTagNames(["hn", "HN", " hn "])).toEqual(["hn"]);
  });

  test("drops empty and whitespace-only names", () => {
    expect(normalizeTagNames(["", "   ", "keep"])).toEqual(["keep"]);
  });

  test("returns null rather than an empty array when nothing survives", () => {
    // Null is what the column stores for the vast majority of jobs, and what
    // applyTags short-circuits on.
    expect(normalizeTagNames([])).toBeNull();
    expect(normalizeTagNames(["", "  "])).toBeNull();
    expect(normalizeTagNames(undefined)).toBeNull();
    expect(normalizeTagNames(null)).toBeNull();
  });

  test("ignores non-string entries instead of throwing on them", () => {
    // A hand-rolled REST client can put anything in this array.
    expect(normalizeTagNames([1, null, { name: "x" }, "real"])).toEqual([
      "real",
    ]);
    expect(normalizeTagNames("not-an-array")).toBeNull();
  });

  test("caps the number of tags one job can carry", () => {
    const many = Array.from({ length: 50 }, (_, i) => `tag-${i}`);
    expect(normalizeTagNames(many)).toHaveLength(20);
  });

  test("caps the length of a single tag name", () => {
    const [name] = normalizeTagNames(["x".repeat(500)]) ?? [];
    expect(name).toHaveLength(64);
  });
});

/**
 * The REST routes are the surface the browser extension actually talks to, and
 * they hand-roll their body handling rather than going through the tRPC schema.
 * These run against a real Fastify instance with no database, stubbing
 * `enqueue` to capture exactly what the route passes down.
 */
describe("POST /ingest/batch tags", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let enqueued: Array<Record<string, unknown>>;
  const previousEnv = {
    authRequired: process.env.AUTH_REQUIRED,
    databaseUrl: process.env.DATABASE_URL,
  };

  beforeEach(async () => {
    process.env.AUTH_REQUIRED = "false";
    process.env.DATABASE_URL = "";
    app = await buildApp();

    enqueued = [];
    // biome-ignore lint/suspicious/noExplicitAny: stubbing a service method
    (app.services.ingest as any).enqueue = async (input: any) => {
      enqueued.push(input);
      return {
        job: { id: enqueued.length, status: "queued", url: input.url },
        reused: false,
      };
    };
  });

  afterEach(async () => {
    await app.close();
    process.env.AUTH_REQUIRED = previousEnv.authRequired;
    process.env.DATABASE_URL = previousEnv.databaseUrl;
  });

  test("applies a batch-level tag to every item", async () => {
    const response = await app.inject({
      method: "POST",
      payload: {
        items: [
          { url: "https://news.ycombinator.com/item?id=1" },
          { url: "https://news.ycombinator.com/item?id=2" },
        ],
        tags: ["hn favorites"],
      },
      url: "/ingest/batch",
    });

    expect(response.statusCode).toBe(202);
    expect(enqueued).toHaveLength(2);
    for (const input of enqueued) {
      expect(input.tags).toEqual(["hn favorites"]);
    }
  });

  test("merges batch tags with an item's own", async () => {
    await app.inject({
      method: "POST",
      payload: {
        items: [{ tags: ["own"], url: "https://example.com/a" }],
        tags: ["batch"],
      },
      url: "/ingest/batch",
    });

    expect(enqueued[0].tags).toEqual(["own", "batch"]);
  });

  test("sends an empty tag list when the caller omits tags", async () => {
    // The extension omits the field entirely for an untagged send; the route
    // must not turn that into undefined-shaped junk on the job row.
    await app.inject({
      method: "POST",
      payload: { items: [{ url: "https://example.com/a" }] },
      url: "/ingest/batch",
    });

    expect(enqueued[0].tags).toEqual([]);
  });

  test("carries tags on the single-item route too", async () => {
    await app.inject({
      method: "POST",
      payload: { tags: ["solo"], url: "https://example.com/a" },
      url: "/ingest",
    });

    expect(enqueued[0].tags).toEqual(["solo"]);
  });
});
