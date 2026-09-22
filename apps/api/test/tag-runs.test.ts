import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  itemsTable,
  itemTagsTable,
  tagRunMatchesTable,
  tagRunsTable,
  tagRunTagsTable,
  tagsTable,
} from "../src/db/schema";
import type { AppEnv } from "../src/lib/config/env";
import { TagRunService } from "../src/modules/tagging/run-service";

// These exercise the SQL a bulk pass is mostly made of — the candidate scope,
// the resume cursor, the apply — which a mocked database would assert nothing
// about. Point TEST_DATABASE_URL at a throwaway Postgres to run them:
//
//   podman run -d --rm --name nabit-test-db -e POSTGRES_PASSWORD=test \
//     -e POSTGRES_DB=nabit -p 55432:5432 docker.io/library/postgres:16-alpine
//   DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/nabit bun migrate.ts
//   TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/nabit bun test
const url = process.env.TEST_DATABASE_URL;
const client = url ? postgres(url, { max: 1, prepare: false }) : null;
const db = client ? drizzle({ client }) : null;
const database = { configured: Boolean(db), db };

function makeEnv(): AppEnv {
  return {
    allowedEmails: null,
    apiToken: null,
    assetStoragePath: "./data/assets",
    authRequired: false,
    headlessBrowser: { captureUrl: null, enabled: false },
    host: "127.0.0.1",
    openrouter: { apiKey: "test-key", enabled: true, model: "env/model" },
    port: 3001,
    supabase: {
      authEnabled: false,
      jwtAudience: ["authenticated"],
      jwtIssuer: null,
      jwksUrl: null,
      url: null,
    },
    websocketsEnabled: false,
  };
}

/** A Jev that says yes to a tag whose name appears in the article. */
function fakeJev() {
  let calls = 0;
  const fetcher = async (_url: string, init: RequestInit) => {
    calls++;
    const body = JSON.parse(String(init.body)) as {
      questions: Record<string, { instructions: string }>;
      state: { article: { text: string; title: string } };
    };
    const answers = Object.fromEntries(
      Object.entries(body.questions).map(([key, question]) => {
        const name = question.instructions.match(/tag "([^"]+)"/)?.[1] ?? "";
        const text = `${body.state.article.title} ${body.state.article.text}`;
        return [key, { noul: text.includes(name) ? 0.9 : 0.05, type: "noul" }];
      }),
    );
    return new Response(
      JSON.stringify({ answers, model: "typesafe/jev-1.13-20260917" }),
      { headers: { "Content-Type": "application/json" }, status: 200 },
    );
  };
  return { calls: () => calls, fetcher };
}

async function seed() {
  if (!db) throw new Error("no database");
  await db.delete(tagRunMatchesTable);
  await db.delete(tagRunTagsTable);
  await db.delete(tagRunsTable);
  await db.delete(itemTagsTable);
  await db.delete(itemsTable);
  await db.delete(tagsTable);

  const tags = await db
    .insert(tagsTable)
    .values([
      { description: "Storage engines and query planners.", name: "postgres" },
      { description: "Hand tools and joinery.", name: "woodworking" },
    ])
    .returning();

  const items = await db
    .insert(itemsTable)
    .values([
      {
        contentMarkdown: "A piece about postgres indexes.",
        sourceType: "web",
        title: "Indexing",
      },
      {
        contentMarkdown: "Sharpening a chisel for woodworking.",
        sourceType: "web",
        title: "Chisels",
      },
      // No body: nothing to judge, so a run must never pay for it.
      { contentMarkdown: null, sourceType: "web", title: "Empty" },
    ])
    .returning();

  return { items, tags };
}

const describeWithDb = url ? describe : describe.skip;

describeWithDb("TagRunService against Postgres", () => {
  let seeded: Awaited<ReturnType<typeof seed>>;

  beforeEach(async () => {
    seeded = await seed();
  });

  afterAll(async () => {
    await client?.end();
  });

  test("scores the library, then applies only once asked", async () => {
    const jev = fakeJev();
    const service = new TagRunService(
      database,
      makeEnv(),
      undefined,
      jev.fetcher,
    );
    const tagIds = seeded.tags.map((tag) => tag.id);

    // Items without a body are not candidates.
    expect(await service.estimateRun({ tagIds })).toEqual({ itemsTotal: 2 });

    const started = await service.startRun({ tagIds }, { userId: null });
    expect(started.status).toBe("pending");
    expect(started.itemsTotal).toBe(2);

    // A second pass would pay twice for the same items.
    await expect(
      service.startRun({ tagIds }, { userId: null }),
    ).rejects.toThrow("already running");

    expect(await service.processNextRun("test-worker")).toEqual({
      processed: true,
    });

    const scored = await service.getRun({ id: started.id });
    expect(scored.status).toBe("scored");
    expect(scored.itemsScored).toBe(2);
    expect(scored.model).toBe("typesafe/jev-1.13-20260917");
    // Equal counts fall back to tag name, so the list has a stable order.
    expect(scored.matches).toEqual([
      {
        count: 1,
        description: "Storage engines and query planners.",
        tagId: seeded.tags[0]?.id ?? 0,
        tagName: "postgres",
      },
      {
        count: 1,
        description: "Hand tools and joinery.",
        tagId: seeded.tags[1]?.id ?? 0,
        tagName: "woodworking",
      },
    ]);

    // Nothing is written before the user says so.
    expect(await db?.select().from(itemTagsTable)).toEqual([]);

    const applied = await service.applyRun({ id: started.id });
    expect(applied.status).toBe("applied");
    expect(applied.appliedCount).toBe(2);
    const rows = (await db?.select().from(itemTagsTable)) ?? [];
    expect(rows).toHaveLength(2);

    await expect(service.applyRun({ id: started.id })).rejects.toThrow(
      "cannot be applied",
    );
  });

  test("a rerun skips items that already carry every chosen tag", async () => {
    const jev = fakeJev();
    const service = new TagRunService(
      database,
      makeEnv(),
      undefined,
      jev.fetcher,
    );
    const tagIds = seeded.tags.map((tag) => tag.id);

    const first = await service.startRun({ tagIds }, { userId: null });
    await service.processNextRun("test-worker");
    await service.applyRun({ id: first.id });
    const firstCalls = jev.calls();

    // Each item now carries one of the two tags, so both are still candidates
    // — but only for the tag they lack.
    expect(await service.estimateRun({ tagIds })).toEqual({ itemsTotal: 2 });

    const second = await service.startRun({ tagIds }, { userId: null });
    await service.processNextRun("test-worker");
    const scored = await service.getRun({ id: second.id });

    expect(scored.status).toBe("scored");
    expect(scored.matches).toEqual([]);
    // One request per item either way, but each asks about fewer tags.
    expect(jev.calls()).toBe(firstCalls + 2);
  });

  test("a cancelled run stops scoring and writes nothing", async () => {
    const service = new TagRunService(
      database,
      makeEnv(),
      undefined,
      fakeJev().fetcher,
    );
    const tagIds = seeded.tags.map((tag) => tag.id);
    const run = await service.startRun({ tagIds }, { userId: null });

    const cancelled = await service.cancelRun({ id: run.id });
    expect(cancelled.status).toBe("cancelled");

    // Already cancelled, so the worker has nothing to claim.
    expect(await service.processNextRun("test-worker")).toEqual({
      processed: false,
    });
    expect(await db?.select().from(itemTagsTable)).toEqual([]);
  });

  test("a run whose worker died resumes from its cursor", async () => {
    const service = new TagRunService(
      database,
      makeEnv(),
      undefined,
      fakeJev().fetcher,
    );
    const tagIds = seeded.tags.map((tag) => tag.id);
    const run = await service.startRun({ tagIds }, { userId: null });

    // Mid-run and abandoned: locked long ago, still marked scoring.
    await db
      ?.update(tagRunsTable)
      .set({
        lockedAt: new Date(Date.now() - 60 * 60_000),
        lockedBy: "dead-worker",
        status: "scoring",
      })
      .where(eq(tagRunsTable.id, run.id));

    expect(await service.reapStuckRuns(30 * 60_000)).toEqual({ reaped: 1 });
    expect((await service.getRun({ id: run.id })).status).toBe("pending");

    await service.processNextRun("test-worker");
    expect((await service.getRun({ id: run.id })).status).toBe("scored");
  });
});
