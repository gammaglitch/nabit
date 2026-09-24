import type { TrpcServices } from "@repo/trpc";
import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import type { DatabaseState } from "../../db/client";
import { llmCallsTable } from "../../db/schema";

type UsageServiceContract = TrpcServices["usage"];
type SummaryInput = Parameters<UsageServiceContract["summary"]>[0];
type SummaryOutput = Awaited<ReturnType<UsageServiceContract["summary"]>>;

export type LlmFeature =
  | "chat"
  | "digest"
  | "digest-summary"
  | "find"
  | "tag-run"
  | "tag-suggest";

export interface LlmCallRecord {
  completionTokens?: number | null;
  /** What the provider charged. Null when it did not say. */
  costUsd?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  feature: LlmFeature;
  /** The provider's id for the call, for chasing one up with them. */
  generationId?: string | null;
  itemId?: number | null;
  model: string;
  promptTokens?: number | null;
  status?: "error" | "success";
  tagRunId?: number | null;
  totalTokens?: number | null;
  userId?: number | null;
}

/** How a call reports itself. Never throws: see UsageService.record. */
export type RecordLlmCall = (record: LlmCallRecord) => void;

const RECENT_LIMIT = 50;

export class UsageService implements UsageServiceContract {
  constructor(private readonly database: DatabaseState) {}

  /**
   * Writes one call to the ledger.
   *
   * Deliberately fire-and-forget and swallowing its own errors: bookkeeping
   * must never be the reason a search, a chat or a digest fails, and the
   * answer has usually already been paid for by the time this runs.
   */
  record(input: LlmCallRecord): void {
    const db = this.database.db;
    if (!db) return;

    void db
      .insert(llmCallsTable)
      .values({
        completionTokens: input.completionTokens ?? null,
        costUsd: input.costUsd ?? null,
        durationMs: input.durationMs ?? null,
        errorMessage: input.errorMessage ?? null,
        feature: input.feature,
        generationId: input.generationId ?? null,
        itemId: input.itemId ?? null,
        model: input.model,
        promptTokens: input.promptTokens ?? null,
        status: input.status ?? "success",
        tagRunId: input.tagRunId ?? null,
        totalTokens: input.totalTokens ?? null,
        userId: input.userId ?? null,
      })
      .catch((error) => {
        console.error(error, "failed to record an llm call");
      });
  }

  async summary(input: SummaryInput): Promise<SummaryOutput> {
    const days = input?.days ?? 30;
    const db = this.database.db;
    if (!db) {
      return {
        byDay: [],
        byFeature: [],
        days,
        recent: [],
        totals: { calls: 0, costUsd: 0, errors: 0 },
      };
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const inWindow = gte(llmCallsTable.createdAt, since);
    const errors = sql<number>`count(*) filter (where ${llmCallsTable.status} = 'error')`;

    const [totals, byFeature, byDay, recent] = await Promise.all([
      db
        .select({ calls: count(), cost: sum(llmCallsTable.costUsd), errors })
        .from(llmCallsTable)
        .where(inWindow),
      db
        .select({
          calls: count(),
          cost: sum(llmCallsTable.costUsd),
          errors,
          feature: llmCallsTable.feature,
          tokens: sum(llmCallsTable.totalTokens),
        })
        .from(llmCallsTable)
        .where(inWindow)
        .groupBy(llmCallsTable.feature)
        .orderBy(desc(sum(llmCallsTable.costUsd))),
      db
        .select({
          cost: sum(llmCallsTable.costUsd),
          day: sql<string>`to_char(date_trunc('day', ${llmCallsTable.createdAt}), 'YYYY-MM-DD')`,
        })
        .from(llmCallsTable)
        .where(inWindow)
        .groupBy(sql`date_trunc('day', ${llmCallsTable.createdAt})`)
        .orderBy(sql`date_trunc('day', ${llmCallsTable.createdAt}) asc`),
      db
        .select()
        .from(llmCallsTable)
        .where(inWindow)
        .orderBy(desc(llmCallsTable.id))
        .limit(RECENT_LIMIT),
    ]);

    return {
      byDay: byDay.map((row) => ({
        costUsd: toNumber(row.cost) ?? 0,
        day: row.day,
      })),
      byFeature: byFeature.map((row) => ({
        calls: row.calls,
        costUsd: toNumber(row.cost),
        errors: Number(row.errors),
        feature: row.feature,
        totalTokens: toNumber(row.tokens) ?? 0,
      })),
      days,
      recent: recent.map((row) => ({
        costUsd: row.costUsd,
        createdAt: row.createdAt.toISOString(),
        durationMs: row.durationMs,
        errorMessage: row.errorMessage,
        feature: row.feature,
        id: row.id,
        model: row.model,
        status: row.status,
        totalTokens: row.totalTokens,
      })),
      totals: {
        calls: totals[0]?.calls ?? 0,
        costUsd: toNumber(totals[0]?.cost) ?? 0,
        errors: Number(totals[0]?.errors ?? 0),
      },
    };
  }

  /** What one bulk tagging pass cost, for the run's own reporting. */
  async costOfTagRun(tagRunId: number): Promise<number> {
    const db = this.database.db;
    if (!db) return 0;

    const [row] = await db
      .select({ cost: sum(llmCallsTable.costUsd) })
      .from(llmCallsTable)
      .where(
        and(
          eq(llmCallsTable.tagRunId, tagRunId),
          eq(llmCallsTable.status, "success"),
        ),
      );

    return toNumber(row?.cost) ?? 0;
  }
}

// Postgres returns sums of numeric as strings, to keep a precision JavaScript
// numbers do not have. These are fractions of a cent, so the loss is harmless
// and a number is what the client wants.
function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
