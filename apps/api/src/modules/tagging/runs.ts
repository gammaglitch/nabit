import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  notInArray,
  sql,
} from "drizzle-orm";
import type { DatabaseState } from "../../db/client";
import {
  itemsTable,
  itemTagsTable,
  tagRunMatchesTable,
  tagRunsTable,
  tagRunTagsTable,
  tagsTable,
} from "../../db/schema";
import type { JevClient } from "../../lib/jev";
import type { TagRow } from "./service";
import { buildArticleState, scoreTags } from "./service";

type Database = NonNullable<DatabaseState["db"]>;

// Items are claimed a page at a time so progress advances steadily and a
// cancelled run stops within a few seconds rather than at the end.
export const SCORING_PAGE = 20;

export interface ClaimedRun {
  attempts: number;
  cursorItemId: number | null;
  id: number;
  maxAttempts: number;
}

export interface TagRunRow {
  appliedCount: number;
  createdAt: Date;
  errorMessage: string | null;
  finishedAt: Date | null;
  id: number;
  itemsScored: number;
  itemsTotal: number;
  model: string | null;
  status: string;
}

/**
 * Items the run still has to weigh: anything with a body that is missing at
 * least one of the chosen tags. An item already carrying every chosen tag has
 * nothing to decide, so it is never paid for.
 */
export function candidateItemsQuery(db: Database, tagIds: number[]) {
  const alreadyTagged = db
    .select({ itemId: itemTagsTable.itemId })
    .from(itemTagsTable)
    .where(inArray(itemTagsTable.tagId, tagIds))
    .groupBy(itemTagsTable.itemId)
    .having(sql`count(*) >= ${tagIds.length}`);

  return and(
    sql`coalesce(${itemsTable.contentMarkdown}, ${itemsTable.contentText}) is not null`,
    notInArray(itemsTable.id, alreadyTagged),
  );
}

export async function countCandidateItems(db: Database, tagIds: number[]) {
  const [row] = await db
    .select({ total: count() })
    .from(itemsTable)
    .where(candidateItemsQuery(db, tagIds));

  return row?.total ?? 0;
}

/** One page of items to weigh, in id order so the cursor can resume. */
export async function nextItemPage(
  db: Database,
  tagIds: number[],
  cursorItemId: number | null,
) {
  const scope = candidateItemsQuery(db, tagIds);
  return db
    .select({
      contentMarkdown: itemsTable.contentMarkdown,
      contentText: itemsTable.contentText,
      id: itemsTable.id,
      title: itemsTable.title,
    })
    .from(itemsTable)
    .where(
      cursorItemId === null
        ? scope
        : and(scope, gt(itemsTable.id, cursorItemId)),
    )
    .orderBy(asc(itemsTable.id))
    .limit(SCORING_PAGE);
}

export async function runTags(db: Database, runId: number): Promise<TagRow[]> {
  return db
    .select({
      description: tagsTable.description,
      id: tagsTable.id,
      name: tagsTable.name,
    })
    .from(tagRunTagsTable)
    .innerJoin(tagsTable, eq(tagsTable.id, tagRunTagsTable.tagId))
    .where(eq(tagRunTagsTable.runId, runId))
    .orderBy(tagsTable.name);
}

/**
 * Scores one page of items against the run's tags and records what it would
 * do. Tags an item already has are never asked about again, so a resumed run
 * costs only what it has not already scored.
 */
export async function scorePage(
  db: Database,
  jev: JevClient,
  input: {
    items: Awaited<ReturnType<typeof nextItemPage>>;
    runId: number;
    tags: TagRow[];
  },
): Promise<{ matches: number; model: string | null }> {
  let model: string | null = null;
  let matches = 0;

  for (const item of input.items) {
    const applied = await db
      .select({ tagId: itemTagsTable.tagId })
      .from(itemTagsTable)
      .where(eq(itemTagsTable.itemId, item.id));
    const appliedIds = new Set(applied.map((row) => row.tagId));
    const tags = input.tags.filter((tag) => !appliedIds.has(tag.id));
    if (tags.length === 0) continue;

    const scored = await scoreTags(jev, buildArticleState(item), tags, {
      // A bulk pass wants every tag that fits, not a shortlist: the cap that
      // keeps a suggestion list readable would silently drop matches here.
      limit: tags.length,
    });
    model = scored.model;

    if (scored.suggestions.length > 0) {
      await db
        .insert(tagRunMatchesTable)
        .values(
          scored.suggestions.map((suggestion) => ({
            confidence: suggestion.confidence,
            itemId: item.id,
            runId: input.runId,
            tagId: suggestion.id,
          })),
        )
        .onConflictDoNothing();
      matches += scored.suggestions.length;
    }
  }

  return { matches, model };
}

/** Per-tag counts of what the run would do, biggest first. */
export async function matchCounts(db: Database, runId: number) {
  const rows = await db
    .select({
      count: count(),
      description: tagsTable.description,
      tagId: tagRunMatchesTable.tagId,
      tagName: tagsTable.name,
    })
    .from(tagRunMatchesTable)
    .innerJoin(tagsTable, eq(tagsTable.id, tagRunMatchesTable.tagId))
    .where(eq(tagRunMatchesTable.runId, runId))
    .groupBy(tagRunMatchesTable.tagId, tagsTable.name, tagsTable.description)
    .orderBy(desc(count()), asc(tagsTable.name));

  return rows;
}

/**
 * Writes the run's matches to the items in one statement. Items that gained
 * the tag by hand since scoring conflict away, so applying twice is a no-op.
 */
export async function applyMatches(db: Database, runId: number) {
  const inserted = await db
    .insert(itemTagsTable)
    .select(
      db
        .select({
          itemId: tagRunMatchesTable.itemId,
          tagId: tagRunMatchesTable.tagId,
        })
        .from(tagRunMatchesTable)
        .where(eq(tagRunMatchesTable.runId, runId)),
    )
    .onConflictDoNothing()
    .returning({ itemId: itemTagsTable.itemId });

  return inserted.length;
}

export function isUnfinished(status: string) {
  return status === "pending" || status === "scoring";
}

export { tagRunsTable };
