import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { llmCallsTable } from "../src/db/schema";
import { type JevCallReport, JevClient } from "../src/lib/jev";
import { readOpenRouterUsage } from "../src/modules/usage/openrouter";
import { UsageService } from "../src/modules/usage/service";

describe("readOpenRouterUsage", () => {
  test("reads the priced usage OpenRouter returns", () => {
    expect(
      readOpenRouterUsage({
        openrouter: {
          usage: {
            completionTokens: 4,
            cost: 0.000034,
            promptTokens: 14,
            totalTokens: 18,
          },
        },
      }),
    ).toEqual({
      completionTokens: 4,
      costUsd: 0.000034,
      promptTokens: 14,
      totalTokens: 18,
    });
  });

  test("falls back to the SDK's token counts, with no price", () => {
    // What a call made without usage accounting looks like: still worth a row,
    // just one that cannot say what it cost.
    expect(
      readOpenRouterUsage(undefined, {
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
      }),
    ).toEqual({
      completionTokens: 20,
      costUsd: null,
      promptTokens: 100,
      totalTokens: 120,
    });
  });

  test("keeps nulls rather than inventing zeroes", () => {
    expect(readOpenRouterUsage({ openrouter: {} })).toEqual({
      completionTokens: null,
      costUsd: null,
      promptTokens: null,
      totalTokens: null,
    });
  });
});

describe("JevClient reporting", () => {
  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    });
  }

  test("reports what a decision cost, as the provider priced it", async () => {
    const calls: JevCallReport[] = [];
    const jev = new JevClient(
      "test-key",
      async () =>
        respond({
          answers: { q: { noul: 0.9, type: "noul" } },
          id: "gen-dec-123",
          model: "typesafe/jev-1.13-20260917",
          usage: { cost: 0.000021, input_tokens: 495, output_tokens: 58 },
        }),
      "Find",
      (call) => calls.push(call),
    );

    await jev.decide({ query: "q" }, {});

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      completionTokens: 58,
      costUsd: 0.000021,
      generationId: "gen-dec-123",
      // The dated version that answered, not the slug we asked for.
      model: "typesafe/jev-1.13-20260917",
      promptTokens: 495,
      totalTokens: 553,
    });
    expect(calls[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("reports a refused call too, so failures are not free silence", async () => {
    const calls: JevCallReport[] = [];
    const jev = new JevClient(
      "test-key",
      async () => respond({ error: { message: "Insufficient credits" } }, 402),
      "Find",
      (call) => calls.push(call),
    );

    await expect(jev.decide({}, {})).rejects.toThrow("Insufficient credits");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      error: "Insufficient credits",
      // The slug we asked for: a refusal never names a dated version.
      model: "typesafe/jev-1.13",
    });
    expect(calls[0]?.costUsd).toBeUndefined();
  });
});

// The summary is entirely SQL. See test/tag-runs.test.ts for how to start a
// throwaway Postgres to run these against.
const url = process.env.TEST_DATABASE_URL;
const client = url ? postgres(url, { max: 1, prepare: false }) : null;
const db = client ? drizzle({ client }) : null;
const describeWithDb = url ? describe : describe.skip;

describeWithDb("UsageService.summary against Postgres", () => {
  const service = new UsageService({ configured: true, db });

  async function insert(rows: Array<Record<string, unknown>>) {
    await db?.insert(llmCallsTable).values(rows as never);
  }

  beforeEach(async () => {
    await db?.delete(llmCallsTable);
  });

  afterAll(async () => {
    await client?.end();
  });

  test("totals the window by feature, biggest spender first", async () => {
    await insert([
      { costUsd: 0.02, feature: "chat", model: "m", totalTokens: 1000 },
      { costUsd: 0.005, feature: "find", model: "jev", totalTokens: 500 },
      { costUsd: 0.001, feature: "find", model: "jev", totalTokens: 100 },
      {
        errorMessage: "boom",
        feature: "find",
        model: "jev",
        status: "error",
      },
    ]);

    const summary = await service.summary({ days: 30 });

    expect(summary.totals).toEqual({ calls: 4, costUsd: 0.026, errors: 1 });
    expect(summary.byFeature).toEqual([
      {
        calls: 1,
        costUsd: 0.02,
        errors: 0,
        feature: "chat",
        totalTokens: 1000,
      },
      {
        calls: 3,
        costUsd: 0.006,
        errors: 1,
        feature: "find",
        totalTokens: 600,
      },
    ]);
    expect(summary.recent).toHaveLength(4);
    expect(summary.recent[0]?.errorMessage).toBe("boom");
  });

  test("ignores calls older than the window", async () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await insert([
      { costUsd: 1, createdAt: old, feature: "chat", model: "m" },
      { costUsd: 2, feature: "chat", model: "m" },
    ]);

    expect((await service.summary({ days: 30 })).totals).toMatchObject({
      calls: 1,
      costUsd: 2,
    });
    expect((await service.summary({ days: 365 })).totals).toMatchObject({
      calls: 2,
      costUsd: 3,
    });
  });

  test("an unpriced call still counts as a call", async () => {
    await insert([{ feature: "digest", model: "m", totalTokens: 10 }]);

    const summary = await service.summary({ days: 30 });
    expect(summary.totals).toEqual({ calls: 1, costUsd: 0, errors: 0 });
    expect(summary.byFeature[0]?.costUsd).toBeNull();
  });

  test("adds up what one tagging run spent", async () => {
    await insert([
      { costUsd: 0.001, feature: "tag-run", model: "jev", tagRunId: null },
    ]);

    // No run id on that row, so a run's own total stays zero.
    expect(await service.costOfTagRun(1)).toBe(0);
  });

  test("records nothing and answers empty without a database", async () => {
    const offline = new UsageService({ configured: false, db: null });
    offline.record({ feature: "find", model: "jev" });

    expect(await offline.summary({ days: 30 })).toMatchObject({
      byFeature: [],
      totals: { calls: 0, costUsd: 0, errors: 0 },
    });
  });
});
