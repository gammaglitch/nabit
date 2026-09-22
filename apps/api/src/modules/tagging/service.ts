import type { TrpcServices } from "@repo/trpc";
import { TRPCError } from "@trpc/server";
import { eq, notInArray } from "drizzle-orm";
import type { DatabaseState } from "../../db/client";
import { itemTagsTable, tagsTable } from "../../db/schema";
import type { AppEnv } from "../../lib/config/env";
import {
  JEV_MODEL,
  JEV_STATE_CHARS,
  JevClient,
  type JevFetcher,
  mapConcurrent,
  type NoulQuestion,
  UNTRUSTED_NOTE,
} from "../../lib/jev";
import type { ExportService } from "../export/service";
import { TagRunService } from "./run-service";

type TaggingServiceContract = TrpcServices["tagging"];
type SuggestInput = Parameters<TaggingServiceContract["suggest"]>[0];
type SuggestOutput = Awaited<ReturnType<TaggingServiceContract["suggest"]>>;

export interface TagRow {
  description: string | null;
  id: number;
  name: string;
}

// The article is the shared state, so a request's size barely grows with the
// number of tags in it. Several requests re-send that state, which is why the
// batch is generous rather than the 16 find screens with.
export const TAGS_PER_REQUEST = 64;
// Past this the library has more tags than one suggestion is worth paying for.
export const MAX_TAGS_WEIGHED = 256;
// Below this Jev is guessing, and a wrong tag costs more than a missing one.
export const SUGGESTION_FLOOR = 0.5;
export const MAX_SUGGESTIONS = 10;

export class TaggingService implements TaggingServiceContract {
  /**
   * Bulk passes live in their own service: they are a worker job with a
   * lifecycle, where a suggestion is a single request the user waits for.
   * Delegated rather than merged so the tRPC contract stays one service.
   */
  readonly runs: TagRunService;

  constructor(
    private readonly database: DatabaseState,
    private readonly exportService: ExportService,
    private readonly env: AppEnv,
    private readonly fetcher?: JevFetcher,
  ) {
    this.runs = new TagRunService(database, env, fetcher);
  }

  estimateRun: TagRunService["estimateRun"] = (input) =>
    this.runs.estimateRun(input);
  startRun: TagRunService["startRun"] = (input, actor) =>
    this.runs.startRun(input, actor);
  getRun: TagRunService["getRun"] = (input) => this.runs.getRun(input);
  latestRun: TagRunService["latestRun"] = () => this.runs.latestRun();
  applyRun: TagRunService["applyRun"] = (input) => this.runs.applyRun(input);
  cancelRun: TagRunService["cancelRun"] = (input) => this.runs.cancelRun(input);

  /**
   * Weighs every tag in the library against one item and returns the ones
   * that fit. Nothing is applied: the answer is a proposal the user accepts
   * or ignores, because a tag written by a machine is indistinguishable from
   * one the user chose once it lands on the item.
   */
  async suggest(input: SuggestInput): Promise<SuggestOutput> {
    const apiKey = this.env.openrouter.apiKey;
    if (!apiKey) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Tag suggestions are not configured: set OPENROUTER_API_KEY on the API.",
      });
    }

    const article = await this.exportService.getArticle({ id: input.itemId });
    if (!article) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `No article found for item ${input.itemId}`,
      });
    }

    const candidates = await this.candidateTags(input.itemId);
    if (candidates.length === 0) {
      return { model: JEV_MODEL, suggestions: [], truncated: false };
    }

    const weighed = candidates.slice(0, MAX_TAGS_WEIGHED);
    const scored = await scoreTags(
      new JevClient(apiKey, this.fetcher, "Tag suggestions"),
      buildArticleState(article),
      weighed,
    );

    return { ...scored, truncated: weighed.length < candidates.length };
  }

  /** Every tag the item does not already carry. */
  private async candidateTags(itemId: number): Promise<TagRow[]> {
    const db = this.database.db;
    if (!db) {
      throw new Error("Database not configured");
    }

    const applied = await db
      .select({ tagId: itemTagsTable.tagId })
      .from(itemTagsTable)
      .where(eq(itemTagsTable.itemId, itemId));
    const appliedIds = applied.map((row) => row.tagId);

    const query = db
      .select({
        description: tagsTable.description,
        id: tagsTable.id,
        name: tagsTable.name,
      })
      .from(tagsTable)
      .orderBy(tagsTable.name);

    const rows =
      appliedIds.length > 0
        ? await query.where(notInArray(tagsTable.id, appliedIds))
        : await query;

    return rows;
  }
}

/**
 * Weighs each tag against the article and keeps the ones Jev is confident
 * about, most confident first. Every question is judged against the same
 * state, so a batch costs little more than a single tag would.
 */
export async function scoreTags(
  jev: JevClient,
  article: ReturnType<typeof buildArticleState>,
  tags: TagRow[],
  options: { limit?: number } = {},
): Promise<Omit<SuggestOutput, "truncated">> {
  const state = { article };
  let model = JEV_MODEL;

  const scored = await mapConcurrent(
    chunk(tags, TAGS_PER_REQUEST),
    async (batch) => {
      const response = await jev.decide(
        state,
        Object.fromEntries(
          batch.map((tag, i) => [`t${i}`, buildTagQuestion(tag)]),
        ),
      );
      model = response.model;
      return batch.map((tag, i) => ({
        confidence: jev.readNoul(response.answers[`t${i}`]),
        description: tag.description,
        id: tag.id,
        name: tag.name,
      }));
    },
  );

  return {
    model,
    suggestions: scored
      .flat()
      .filter((suggestion) => suggestion.confidence >= SUGGESTION_FLOOR)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, options.limit ?? MAX_SUGGESTIONS),
  };
}

/**
 * What Jev reads about the item. The body is cut to the context budget: the
 * opening of an article says what it is about, which is all a tag needs.
 */
export function buildArticleState(article: {
  contentMarkdown: string | null;
  contentText: string | null;
  title: string | null;
}) {
  const body = (article.contentMarkdown ?? article.contentText ?? "").trim();
  return {
    text: body.slice(0, JEV_STATE_CHARS),
    title: article.title ?? "",
    truncated: body.length > JEV_STATE_CHARS,
  };
}

/**
 * One yes/no question per tag, all answered against the same article in a
 * single pass. The tag's own description is the criteria, so "rust" means
 * whatever the user says it means.
 */
export function buildTagQuestion(tag: TagRow): NoulQuestion {
  const meaning = tag.description
    ? `The user describes this tag as: """${tag.description}"""`
    : "The user has not described this tag, so judge it by its name alone.";

  return {
    criteria: {
      false:
        "The article is not about this, or touches it only in passing. Prefer this when unsure.",
      true: "The article is substantially about this, enough that the user would expect to find it again under this tag.",
    },
    instructions: `The user files articles under tags. Should the article in state be filed under the tag "${tag.name}"? ${meaning} ${UNTRUSTED_NOTE}`,
    type: "noul",
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
