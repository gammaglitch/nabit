import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { DatabaseState } from "../../db/client";
import {
  commentsTable,
  itemsTable,
  itemTagsTable,
  tagsTable,
} from "../../db/schema";
import type {
  ExportArticleData,
  ExportArticleSummary,
  ExportListQuery,
  ExportListResult,
} from "./dto";
import { computeContentHash, slugify } from "./markdown";

type Database = NonNullable<DatabaseState["db"]>;
type ItemRow = typeof itemsTable.$inferSelect;
type CommentRow = typeof commentsTable.$inferSelect;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function requireDatabase(database: DatabaseState): Database {
  if (!database.db) {
    throw new Error("Database not configured");
  }
  return database.db;
}

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

function encodeCursor(contentUpdatedAt: Date, id: number): string {
  return `${contentUpdatedAt.toISOString()}_${id}`;
}

function decodeCursor(cursor: string): { ts: Date; id: number } | null {
  const separator = cursor.lastIndexOf("_");
  if (separator <= 0) {
    return null;
  }
  const ts = new Date(cursor.slice(0, separator));
  const id = Number(cursor.slice(separator + 1));
  if (Number.isNaN(ts.getTime()) || !Number.isInteger(id)) {
    return null;
  }
  return { ts, id };
}

export class ExportService {
  constructor(private readonly database: DatabaseState) {}

  async listArticles(input: ExportListQuery = {}): Promise<ExportListResult> {
    const db = requireDatabase(this.database);
    const order = input.order ?? "asc";
    const limit = clampLimit(input.limit);

    // Filters shared between the page query and the total count.
    const baseConditions: SQL[] = [];
    if (input.sourceType) {
      baseConditions.push(eq(itemsTable.sourceType, input.sourceType));
    }
    if (input.since) {
      const since = new Date(input.since);
      if (!Number.isNaN(since.getTime())) {
        baseConditions.push(gt(itemsTable.contentUpdatedAt, since));
      }
    }

    const pageConditions = [...baseConditions];
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    if (cursor) {
      // Keyset pagination on (content_updated_at, id) so concurrent inserts
      // during a sync never shift or skip rows.
      const compare = order === "asc" ? gt : lt;
      const keyset = or(
        compare(itemsTable.contentUpdatedAt, cursor.ts),
        and(
          eq(itemsTable.contentUpdatedAt, cursor.ts),
          compare(itemsTable.id, cursor.id),
        ),
      );
      if (keyset) {
        pageConditions.push(keyset);
      }
    }

    const orderBy =
      order === "asc"
        ? [asc(itemsTable.contentUpdatedAt), asc(itemsTable.id)]
        : [desc(itemsTable.contentUpdatedAt), desc(itemsTable.id)];

    // Fetch one extra row to detect whether another page exists.
    const rows = await db
      .select()
      .from(itemsTable)
      .where(pageConditions.length > 0 ? and(...pageConditions) : undefined)
      .orderBy(...orderBy)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const itemIds = pageRows.map((row) => row.id);
    const [totalRows, commentCountRows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(itemsTable)
        .where(baseConditions.length > 0 ? and(...baseConditions) : undefined),
      itemIds.length > 0
        ? db
            .select({
              count: sql<number>`count(*)`,
              itemId: commentsTable.itemId,
            })
            .from(commentsTable)
            .where(inArray(commentsTable.itemId, itemIds))
            .groupBy(commentsTable.itemId)
        : Promise.resolve([] as { count: number; itemId: number }[]),
    ]);

    const commentCountByItem = new Map(
      commentCountRows.map((row) => [row.itemId, Number(row.count)]),
    );

    const articles: ExportArticleSummary[] = pageRows.map((row) => {
      const commentCount = commentCountByItem.get(row.id) ?? 0;
      const contentUpdatedAt = row.contentUpdatedAt.toISOString();
      return {
        id: row.id,
        sourceType: row.sourceType,
        title: row.title,
        sourceUrl: row.sourceUrl,
        ingestedAt: row.ingestedAt.toISOString(),
        sourceCreatedAt: row.sourceCreatedAt?.toISOString() ?? null,
        contentUpdatedAt,
        commentCount,
        contentHash: computeContentHash({
          contentMarkdown: row.contentMarkdown,
          contentUpdatedAt,
          commentCount,
        }),
        slug: slugify(row.id, row.title),
      };
    });

    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(last.contentUpdatedAt, last.id) : null;

    return {
      articles,
      nextCursor,
      total: Number(totalRows[0]?.count ?? 0),
    };
  }

  async getArticle(input: { id: number }): Promise<ExportArticleData | null> {
    const db = requireDatabase(this.database);

    const [item] = await db
      .select()
      .from(itemsTable)
      .where(eq(itemsTable.id, input.id))
      .limit(1);

    if (!item) {
      return null;
    }

    const [comments, tags] = await Promise.all([
      db
        .select()
        .from(commentsTable)
        .where(eq(commentsTable.itemId, input.id))
        .orderBy(commentsTable.path),
      this.tagsForItems(db, [input.id]),
    ]);

    return this.toArticleData(item, comments, tags.get(input.id) ?? []);
  }

  async getArticlesBatch(input: {
    ids: number[];
  }): Promise<ExportArticleData[]> {
    const db = requireDatabase(this.database);
    if (input.ids.length === 0) {
      return [];
    }

    const [items, comments, tagsByItem] = await Promise.all([
      db.select().from(itemsTable).where(inArray(itemsTable.id, input.ids)),
      db
        .select()
        .from(commentsTable)
        .where(inArray(commentsTable.itemId, input.ids))
        .orderBy(commentsTable.path),
      this.tagsForItems(db, input.ids),
    ]);

    const itemById = new Map(items.map((item) => [item.id, item]));
    const commentsByItem = new Map<number, CommentRow[]>();
    for (const comment of comments) {
      const existing = commentsByItem.get(comment.itemId) ?? [];
      existing.push(comment);
      commentsByItem.set(comment.itemId, existing);
    }

    // Preserve the caller's requested id order, skipping unknown ids.
    const result: ExportArticleData[] = [];
    for (const id of input.ids) {
      const item = itemById.get(id);
      if (!item) {
        continue;
      }
      result.push(
        this.toArticleData(
          item,
          commentsByItem.get(id) ?? [],
          tagsByItem.get(id) ?? [],
        ),
      );
    }
    return result;
  }

  private async tagsForItems(
    db: Database,
    itemIds: number[],
  ): Promise<Map<number, string[]>> {
    const rows = await db
      .select({ itemId: itemTagsTable.itemId, tagName: tagsTable.name })
      .from(itemTagsTable)
      .innerJoin(tagsTable, eq(itemTagsTable.tagId, tagsTable.id))
      .where(inArray(itemTagsTable.itemId, itemIds));

    const tagsByItem = new Map<number, string[]>();
    for (const row of rows) {
      const existing = tagsByItem.get(row.itemId) ?? [];
      existing.push(row.tagName);
      tagsByItem.set(row.itemId, existing);
    }
    return tagsByItem;
  }

  private toArticleData(
    item: ItemRow,
    comments: CommentRow[],
    tags: string[],
  ): ExportArticleData {
    const commentCount = comments.length;
    const contentUpdatedAt = item.contentUpdatedAt.toISOString();
    return {
      frontmatter: {
        nabitId: item.id,
        sourceType: item.sourceType,
        title: item.title,
        author: item.author,
        sourceUrl: item.sourceUrl,
        externalId: item.externalId,
        sourceCreatedAt: item.sourceCreatedAt?.toISOString() ?? null,
        ingestedAt: item.ingestedAt.toISOString(),
        contentUpdatedAt,
        commentCount,
        tags,
        contentHash: computeContentHash({
          contentMarkdown: item.contentMarkdown,
          contentUpdatedAt,
          commentCount,
        }),
      },
      title: item.title,
      contentMarkdown: item.contentMarkdown,
      contentText: item.contentText,
      comments: comments.map((comment) => ({
        author: comment.author,
        path: comment.path,
        sourceCreatedAt: comment.sourceCreatedAt?.toISOString() ?? null,
        contentMarkdown: comment.contentMarkdown,
        contentText: comment.contentText,
      })),
    };
  }
}
