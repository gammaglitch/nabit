import type { TrpcServices } from "@repo/trpc";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { DatabaseState } from "../../db/client";
import { tagRunsTable, tagRunTagsTable, tagsTable } from "../../db/schema";
import type { AppEnv } from "../../lib/config/env";
import { JevClient, type JevFetcher } from "../../lib/jev";
import type { UsageService } from "../usage/service";
import {
  applyMatches,
  type ClaimedRun,
  countCandidateItems,
  isUnfinished,
  itemsByIds,
  matchCounts,
  nextItemPage,
  runTags,
  scoreItem,
} from "./runs";
import type { TagRow } from "./service";

type TaggingContract = TrpcServices["tagging"];
type StartInput = Parameters<TaggingContract["startRun"]>[0];
type RunOutput = Awaited<ReturnType<TaggingContract["getRun"]>>;
type Actor = Parameters<TaggingContract["startRun"]>[1];
type Database = NonNullable<DatabaseState["db"]>;

// Matches the digest worker's: a run is one model call per item, so the lock
// must be refreshed or the reaper would treat a healthy run as dead.
const HEARTBEAT_MS = 30_000;

function retryDelayMs(attempts: number) {
  return Math.min(60_000, 2 ** attempts * 5_000);
}

/**
 * Bulk tagging: weighs a set of tags against every item that lacks them,
 * records what it would do, and writes nothing until the user has seen the
 * counts. Scoring belongs to the worker — a library of any size is minutes of
 * model calls, which no HTTP request should hold open.
 */
export class TagRunService {
  constructor(
    private readonly database: DatabaseState,
    private readonly env: AppEnv,
    private readonly usage?: UsageService,
    private readonly fetcher?: JevFetcher,
  ) {}

  async estimateRun(input: StartInput) {
    const db = this.requireDatabase();
    const tagIds = await this.validTagIds(db, input.tagIds);

    return { itemsTotal: await countCandidateItems(db, tagIds) };
  }

  async startRun(input: StartInput, actor: Actor): Promise<RunOutput> {
    const db = this.requireDatabase();
    if (!this.env.openrouter.enabled) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Auto-tagging is not configured: set OPENROUTER_API_KEY on the API.",
      });
    }

    const tagIds = await this.validTagIds(db, input.tagIds);

    // One at a time: two runs scoring the same items would pay twice and
    // leave the user with two sets of counts to reconcile.
    const [running] = await db
      .select({ id: tagRunsTable.id })
      .from(tagRunsTable)
      .where(inArray(tagRunsTable.status, ["pending", "scoring"]))
      .limit(1);
    if (running) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A tagging pass is already running.",
      });
    }

    const [created] = await db
      .insert(tagRunsTable)
      .values({
        createdByUserId: actor.userId,
        itemsTotal: await countCandidateItems(db, tagIds),
      })
      .returning({ id: tagRunsTable.id });
    if (!created) {
      throw new Error("Failed to create the tagging run");
    }

    await db
      .insert(tagRunTagsTable)
      .values(tagIds.map((tagId) => ({ runId: created.id, tagId })));

    return this.getRun({ id: created.id });
  }

  async getRun(input: { id: number }): Promise<RunOutput> {
    const db = this.requireDatabase();
    const [run] = await db
      .select()
      .from(tagRunsTable)
      .where(eq(tagRunsTable.id, input.id))
      .limit(1);

    if (!run) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `No tagging run with id ${input.id}`,
      });
    }

    return toOutput(run, await matchCounts(db, run.id));
  }

  async latestRun() {
    const db = this.requireDatabase();
    const [run] = await db
      .select()
      .from(tagRunsTable)
      .orderBy(desc(tagRunsTable.id))
      .limit(1);

    return {
      run: run ? toOutput(run, await matchCounts(db, run.id)) : null,
    };
  }

  /** Writes the scored matches. Only a run the user has seen can apply. */
  async applyRun(input: { id: number }): Promise<RunOutput> {
    const db = this.requireDatabase();
    const current = await this.getRun(input);
    if (current.status !== "scored") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `A ${current.status} run cannot be applied.`,
      });
    }

    const applied = await applyMatches(db, input.id);
    await db
      .update(tagRunsTable)
      .set({
        appliedAt: new Date(),
        appliedCount: applied,
        status: "applied",
        updatedAt: new Date(),
      })
      .where(eq(tagRunsTable.id, input.id));

    return this.getRun(input);
  }

  /**
   * Stops a run, or discards the counts of one that finished scoring. The
   * worker notices between pages, so a cancel lands within a page rather
   * than instantly.
   */
  async cancelRun(input: { id: number }): Promise<RunOutput> {
    const db = this.requireDatabase();
    const current = await this.getRun(input);
    if (current.status === "applied") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "That run has already been applied.",
      });
    }

    await db
      .update(tagRunsTable)
      .set({
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(tagRunsTable.id, input.id));

    return this.getRun(input);
  }

  /**
   * Claims and scores one queued run. Mirrors DigestService.processNextDue:
   * a single CTE + UPDATE is implicitly atomic, and `FOR UPDATE SKIP LOCKED`
   * lets several workers claim distinct rows without blocking each other.
   */
  async processNextRun(workerId: string): Promise<{ processed: boolean }> {
    const db = this.requireDatabase();
    const rows = (await db.execute(sql`
      with next_run as (
        select id
        from ${tagRunsTable}
        where status = 'pending'
          and run_after <= now()
        order by id
        for update skip locked
        limit 1
      )
      update ${tagRunsTable}
      set
        status = 'scoring',
        locked_by = ${workerId},
        locked_at = now(),
        attempts = attempts + 1,
        updated_at = now()
      where id in (select id from next_run)
      returning
        id,
        attempts,
        max_attempts as "maxAttempts",
        cursor_item_id as "cursorItemId",
        failed_item_ids as "failedItemIds"
    `)) as unknown as ClaimedRun[];

    const claimed = rows[0];
    if (!claimed) {
      return { processed: false };
    }

    const heartbeat = setInterval(async () => {
      try {
        await db
          .update(tagRunsTable)
          .set({ lockedAt: new Date(), updatedAt: new Date() })
          .where(eq(tagRunsTable.id, claimed.id));
      } catch (error) {
        console.error(error, "tag run heartbeat failed");
      }
    }, HEARTBEAT_MS);

    try {
      await this.scoreRun(db, claimed);
      return { processed: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const willRetry = Number(claimed.attempts) < Number(claimed.maxAttempts);

      await db
        .update(tagRunsTable)
        .set({
          errorMessage: message,
          finishedAt: willRetry ? null : new Date(),
          lockedAt: null,
          lockedBy: null,
          runAfter: new Date(Date.now() + retryDelayMs(claimed.attempts)),
          status: willRetry ? "pending" : "failed",
          updatedAt: new Date(),
        })
        .where(eq(tagRunsTable.id, claimed.id));

      return { processed: true };
    } finally {
      clearInterval(heartbeat);
    }
  }

  /** Recovers runs whose worker died mid-pass. They resume at their cursor. */
  async reapStuckRuns(stuckMs: number) {
    const db = this.requireDatabase();
    const cutoff = new Date(Date.now() - stuckMs);
    const reaped = await db
      .update(tagRunsTable)
      .set({
        lockedAt: null,
        lockedBy: null,
        status: "pending",
        updatedAt: new Date(),
      })
      // Built with operators rather than a raw fragment: postgres-js cannot
      // bind a Date interpolated into sql``.
      .where(
        and(
          eq(tagRunsTable.status, "scoring"),
          lt(tagRunsTable.lockedAt, cutoff),
        ),
      )
      .returning({ id: tagRunsTable.id });

    return { reaped: reaped.length };
  }

  private async scoreRun(db: Database, claimed: ClaimedRun) {
    const apiKey = this.env.openrouter.apiKey;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }

    const jev = new JevClient(apiKey, this.fetcher, "Auto-tagging", (call) =>
      this.usage?.record({
        ...call,
        errorMessage: call.error ?? null,
        feature: "tag-run",
        status: call.error ? "error" : "success",
        tagRunId: claimed.id,
      }),
    );
    const tags = await runTags(db, claimed.id);
    const tagIds = tags.map((tag) => tag.id);
    let cursor = claimed.cursorItemId;
    // Carried across attempts: a run reclaimed after a crash resumes at its
    // cursor, which would otherwise walk straight past what it could not score.
    const failed = new Set(claimed.failedItemIds ?? []);

    for (;;) {
      const items = await nextItemPage(db, tagIds, cursor);
      if (items.length === 0) break;

      for (const item of items) {
        const outcome = await this.scoreOne(db, jev, {
          failed,
          item,
          runId: claimed.id,
          tags,
        });
        cursor = item.id;
        if (outcome === "cancelled") return;
      }
    }

    // One more go at the stragglers, now that whatever was overloaded has had
    // the length of a library pass to recover.
    for (const item of await itemsByIds(db, [...failed])) {
      failed.delete(item.id);
      const outcome = await this.scoreOne(db, jev, {
        failed,
        item,
        retry: true,
        runId: claimed.id,
        tags,
      });
      if (outcome === "cancelled") return;
    }

    await db
      .update(tagRunsTable)
      .set({
        // Whatever failed is counted on the run, not thrown as an error: the
        // items that did score are still worth showing and applying.
        errorMessage: null,
        failedCount: failed.size,
        failedItemIds: [...failed],
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        status: "scored",
        updatedAt: new Date(),
      })
      .where(eq(tagRunsTable.id, claimed.id));
  }

  /**
   * Scores one item and moves the run on by one.
   *
   * Progress is written per item rather than per page: a pass over a few
   * hundred articles otherwise sat at zero for minutes, which read as a job
   * that had died. The counters are incremented in SQL so a heartbeat or a
   * concurrent update cannot lose a tick.
   */
  private async scoreOne(
    db: Database,
    jev: JevClient,
    input: {
      failed: Set<number>;
      item: Awaited<ReturnType<typeof nextItemPage>>[number];
      retry?: boolean;
      runId: number;
      tags: TagRow[];
    },
  ): Promise<"cancelled" | "done"> {
    let matches = 0;
    let model: string | null = null;

    try {
      const scored = await scoreItem(db, jev, {
        item: input.item,
        runId: input.runId,
        tags: input.tags,
      });
      matches = scored.matches;
      model = scored.model;
    } catch (error) {
      // One refused item is not a reason to abandon the library. It is
      // remembered, retried once the pass is through, and counted if it still
      // will not score.
      input.failed.add(input.item.id);
      console.error(error, `tag run ${input.runId} could not score an item`);
    }

    const [state] = await db
      .update(tagRunsTable)
      .set({
        cursorItemId: input.retry ? undefined : input.item.id,
        failedCount: input.failed.size,
        failedItemIds: [...input.failed],
        // A retried item was already counted on its first attempt.
        itemsScored: input.retry
          ? undefined
          : sql`${tagRunsTable.itemsScored} + 1`,
        matchCount: sql`${tagRunsTable.matchCount} + ${matches}`,
        model: model ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(tagRunsTable.id, input.runId))
      .returning({ status: tagRunsTable.status });

    // The same write tells us whether a cancel landed, so watching for one
    // costs no extra query.
    return state?.status === "scoring" ? "done" : "cancelled";
  }

  /** Tag ids that still exist, so a deleted tag cannot stall a run. */
  private async validTagIds(db: Database, tagIds: number[]) {
    const rows = await db
      .select({ id: tagsTable.id })
      .from(tagsTable)
      .where(inArray(tagsTable.id, tagIds));

    if (rows.length === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "None of those tags exist.",
      });
    }
    return rows.map((row) => row.id);
  }

  private requireDatabase(): Database {
    if (!this.database.db) {
      throw new Error("Database not configured");
    }
    return this.database.db;
  }
}

export function toOutput(
  run: {
    appliedCount: number;
    createdAt: Date;
    errorMessage: string | null;
    failedCount: number;
    finishedAt: Date | null;
    id: number;
    itemsScored: number;
    itemsTotal: number;
    model: string | null;
    status: string;
  },
  matches: Awaited<ReturnType<typeof matchCounts>>,
): RunOutput {
  return {
    appliedCount: run.appliedCount,
    errorMessage: run.errorMessage,
    failedCount: run.failedCount,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    id: run.id,
    itemsScored: run.itemsScored,
    itemsTotal: run.itemsTotal,
    matches: matches.map((match) => ({
      count: match.count,
      description: match.description,
      tagId: match.tagId,
      tagName: match.tagName,
    })),
    model: run.model,
    startedAt: run.createdAt.toISOString(),
    status: run.status as RunOutput["status"],
  };
}

export { isUnfinished };
