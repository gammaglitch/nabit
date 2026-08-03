import { createHash } from "node:crypto";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { DatabaseState } from "../../db/client";
import {
  articleSummariesTable,
  digestsTable,
  itemsTable,
} from "../../db/schema";
import type { AppEnv } from "../../lib/config/env";
import { renderArticleDocument } from "../export/markdown";
import type { ExportService } from "../export/service";
import type { SettingsService } from "../settings/service";
import { DigestNotConfiguredError, type DigestStatus } from "./dto";
import { formatPeriodLabel, resolvePeriod } from "./periods";
import {
  buildDigestPrompt,
  buildSummaryPrompt,
  SUMMARY_PROMPT_VERSION,
} from "./prompts";

type Database = NonNullable<DatabaseState["db"]>;
type DigestRow = typeof digestsTable.$inferSelect;

// Comments are capped independently of the character budget so a huge thread
// is trimmed by rank rather than truncated mid-sentence. Lower than the chat
// panel's cap: a digest summary does not need the full discussion.
const MAX_SUMMARY_COMMENTS = 40;

// Matches the ingest worker's heartbeat. A digest run makes one model call per
// article and can legitimately take many minutes, so its lock has to be
// refreshed or a reaper would treat a healthy run as dead.
const HEARTBEAT_MS = 30_000;

type ClaimedDigest = {
  attempts: number;
  id: number;
  maxAttempts: number;
  periodEnd: Date;
  periodStart: Date;
};

export type DigestRunResult =
  | { digestId: number; processed: true; status: DigestStatus }
  | { processed: false };

function requireDatabase(database: DatabaseState): Database {
  if (!database.db) {
    throw new Error("Database not configured");
  }

  return database.db;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function toDigest(row: DigestRow) {
  return {
    createdAt: row.createdAt.toISOString(),
    errorMessage: row.errorMessage,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    id: row.id,
    itemCount: row.itemCount,
    model: row.model,
    omittedCount: row.omittedCount,
    periodEnd: row.periodEnd.toISOString(),
    periodStart: row.periodStart.toISOString(),
    status: row.status as DigestStatus,
    summaryMarkdown: row.summaryMarkdown,
  };
}

export class DigestService {
  constructor(
    private readonly database: DatabaseState,
    private readonly env: AppEnv,
    private readonly exportService: ExportService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Creates the row for the most recently completed period, if it does not
   * exist. Idempotent by way of the unique constraint on `period_start`, so it
   * is safe to call on every worker tick and from several workers at once.
   *
   * Deliberately materializes only the latest period. A worker that was down
   * for a month should not wake up and bill for four stale digests.
   */
  async materializeDuePeriods(now: Date = new Date()) {
    const db = requireDatabase(this.database);
    const settings = await this.settingsService.getDigestSettings();
    const bounds = resolvePeriod(now, {
      dayOfWeek: settings.dayOfWeek,
      hour: settings.hour,
      timezone: settings.timezone,
    });

    const inserted = await db
      .insert(digestsTable)
      .values({
        periodEnd: bounds.periodEnd,
        periodStart: bounds.periodStart,
        status: "pending",
      })
      .onConflictDoNothing({ target: digestsTable.periodStart })
      .returning({ id: digestsTable.id });

    return {
      created: inserted.length > 0,
      periodEnd: bounds.periodEnd,
      periodStart: bounds.periodStart,
    };
  }

  /**
   * Claims and runs one pending digest. Mirrors IngestService.processNextJob:
   * a single CTE + UPDATE is implicitly atomic, and `FOR UPDATE SKIP LOCKED`
   * lets multiple workers claim distinct rows without blocking each other.
   */
  async processNextDue(workerId: string): Promise<DigestRunResult> {
    const db = requireDatabase(this.database);
    const rows = (await db.execute(sql`
      with next_digest as (
        select id
        from ${digestsTable}
        where status = 'pending'
        order by period_start
        for update skip locked
        limit 1
      )
      update ${digestsTable}
      set
        status = 'processing',
        locked_by = ${workerId},
        locked_at = now(),
        attempts = attempts + 1,
        updated_at = now()
      where id in (select id from next_digest)
      returning
        id,
        period_start as "periodStart",
        period_end as "periodEnd",
        attempts,
        max_attempts as "maxAttempts"
    `)) as unknown as ClaimedDigest[];

    const digest = rows[0];
    if (!digest) {
      return { processed: false };
    }

    const heartbeat = setInterval(async () => {
      try {
        await db
          .update(digestsTable)
          .set({ lockedAt: new Date(), updatedAt: new Date() })
          .where(eq(digestsTable.id, digest.id));
      } catch (error) {
        console.error(error, "digest heartbeat failed");
      }
    }, HEARTBEAT_MS);

    try {
      const outcome = await this.buildDigest(db, digest);

      await db
        .update(digestsTable)
        .set({
          errorMessage: null,
          finishedAt: new Date(),
          itemCount: outcome.itemCount,
          lockedAt: null,
          lockedBy: null,
          model: outcome.model,
          omittedCount: outcome.omittedCount,
          status: outcome.status,
          summaryMarkdown: outcome.summaryMarkdown,
          updatedAt: new Date(),
        })
        .where(eq(digestsTable.id, digest.id));

      return { digestId: digest.id, processed: true, status: outcome.status };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      // Retries resume rather than restart: summaries already written are
      // reused, so a late failure does not re-pay for the whole week.
      const willRetry = digest.attempts < digest.maxAttempts;

      await db
        .update(digestsTable)
        .set({
          errorMessage: message,
          finishedAt: willRetry ? null : new Date(),
          lockedAt: null,
          lockedBy: null,
          status: willRetry ? "pending" : "failed",
          updatedAt: new Date(),
        })
        .where(eq(digestsTable.id, digest.id));

      return {
        digestId: digest.id,
        processed: true,
        status: willRetry ? "pending" : "failed",
      };
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async buildDigest(db: Database, digest: ClaimedDigest) {
    const settings = await this.settingsService.getDigestSettings();
    const itemRows = await db
      .select({
        id: itemsTable.id,
        sourceType: itemsTable.sourceType,
        sourceUrl: itemsTable.sourceUrl,
        title: itemsTable.title,
      })
      .from(itemsTable)
      .where(
        and(
          eq(itemsTable.digestOptIn, true),
          gte(itemsTable.ingestedAt, digest.periodStart),
          lt(itemsTable.ingestedAt, digest.periodEnd),
        ),
      )
      .orderBy(asc(itemsTable.ingestedAt))
      .limit(settings.maxItems);

    if (itemRows.length === 0) {
      return {
        itemCount: 0,
        model: null,
        omittedCount: 0,
        status: "empty" as DigestStatus,
        summaryMarkdown: null,
      };
    }

    // Only checked once there is work to do, so an instance with no key and no
    // opted-in items never fails a digest it was never going to build.
    const apiKey = this.env.openrouter.apiKey;
    if (!apiKey) {
      throw new DigestNotConfiguredError();
    }
    const openrouter = createOpenRouter({ apiKey });

    const articles = await this.exportService.getArticlesBatch({
      ids: itemRows.map((row) => row.id),
    });
    const articleById = new Map(
      articles.map((article) => [article.frontmatter.nabitId, article]),
    );

    const summaries: Array<{
      sourceType: string;
      sourceUrl: string | null;
      summary: string;
      title: string | null;
    }> = [];
    let omittedCount = 0;

    for (const row of itemRows) {
      const article = articleById.get(row.id);
      if (!article) {
        omittedCount += 1;
        continue;
      }

      try {
        const summary = await this.ensureSummary(db, {
          article,
          itemId: row.id,
          maxContextChars: settings.maxContextChars,
          model: openrouter(settings.summaryModel),
          modelName: settings.summaryModel,
        });
        summaries.push({
          sourceType: row.sourceType,
          sourceUrl: row.sourceUrl,
          summary,
          title: row.title,
        });
      } catch (error) {
        // One unsummarizable article must not sink the week. It is recorded on
        // the row and surfaced in the digest text rather than silently dropped.
        omittedCount += 1;
        console.error(error, `digest summary failed for item ${row.id}`);
      }
    }

    if (summaries.length === 0) {
      throw new Error(
        `every item in the period failed to summarize (${omittedCount} attempted)`,
      );
    }

    const periodLabel = formatPeriodLabel(
      { periodEnd: digest.periodEnd, periodStart: digest.periodStart },
      settings.timezone,
    );
    const prompt = buildDigestPrompt(summaries, {
      omittedCount,
      periodLabel,
    });
    const result = await generateText({
      model: openrouter(settings.digestModel),
      prompt: prompt.prompt,
      system: prompt.system,
    });

    return {
      itemCount: summaries.length,
      model: settings.digestModel,
      omittedCount,
      status: "success" as DigestStatus,
      summaryMarkdown: `# Week of ${periodLabel}\n\n${result.text.trim()}\n`,
    };
  }

  /**
   * Returns a usable TL;DR for one item, generating it only when there isn't
   * one already written from the same source text, model, and prompt version.
   */
  private async ensureSummary(
    db: Database,
    input: {
      article: Awaited<ReturnType<ExportService["getArticlesBatch"]>>[number];
      itemId: number;
      maxContextChars: number;
      model: Parameters<typeof generateText>[0]["model"];
      modelName: string;
    },
  ): Promise<string> {
    // No assetBaseUrl: the model cannot fetch images either way, and absolute
    // URLs would just burn tokens.
    const document = renderArticleDocument(input.article, {
      comments: true,
      maxComments: MAX_SUMMARY_COMMENTS,
    });
    const built = buildSummaryPrompt({
      document,
      maxContextChars: input.maxContextChars,
      title: input.article.title,
    });
    const sourceSha256 = sha256(built.prompt);

    const [existing] = await db
      .select()
      .from(articleSummariesTable)
      .where(eq(articleSummariesTable.itemId, input.itemId))
      .limit(1);

    if (
      existing?.status === "success" &&
      existing.summaryText &&
      existing.sourceSha256 === sourceSha256 &&
      existing.model === input.modelName &&
      existing.promptVersion === SUMMARY_PROMPT_VERSION
    ) {
      return existing.summaryText;
    }

    try {
      const result = await generateText({
        model: input.model,
        prompt: built.prompt,
        system: built.system,
      });
      const summaryText = result.text.trim();
      if (!summaryText) {
        throw new Error("model returned an empty summary");
      }

      await db
        .insert(articleSummariesTable)
        .values({
          attempts: 1,
          errorMessage: null,
          inputChars: built.prompt.length,
          itemId: input.itemId,
          model: input.modelName,
          promptVersion: SUMMARY_PROMPT_VERSION,
          sourceSha256,
          status: "success",
          summaryText,
        })
        .onConflictDoUpdate({
          target: articleSummariesTable.itemId,
          set: {
            attempts: sql`${articleSummariesTable.attempts} + 1`,
            errorMessage: null,
            inputChars: built.prompt.length,
            model: input.modelName,
            promptVersion: SUMMARY_PROMPT_VERSION,
            sourceSha256,
            status: "success",
            summaryText,
            updatedAt: new Date(),
          },
        });

      return summaryText;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await db
        .insert(articleSummariesTable)
        .values({
          attempts: 1,
          errorMessage: message,
          itemId: input.itemId,
          promptVersion: SUMMARY_PROMPT_VERSION,
          status: "failed",
        })
        .onConflictDoUpdate({
          target: articleSummariesTable.itemId,
          set: {
            attempts: sql`${articleSummariesTable.attempts} + 1`,
            errorMessage: message,
            status: "failed",
            updatedAt: new Date(),
          },
        });

      throw error;
    }
  }

  async list(input: { limit?: number } = {}) {
    const db = requireDatabase(this.database);
    const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 20)));
    const rows = await db
      .select()
      .from(digestsTable)
      .orderBy(desc(digestsTable.periodStart))
      .limit(limit);

    return { digests: rows.map(toDigest) };
  }

  async get(input: { id: number }) {
    const db = requireDatabase(this.database);
    const [row] = await db
      .select()
      .from(digestsTable)
      .where(eq(digestsTable.id, input.id))
      .limit(1);

    return { digest: row ? toDigest(row) : null };
  }
}
