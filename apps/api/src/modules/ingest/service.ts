import type { TrpcServices } from "@repo/trpc";
import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { DatabaseState } from "../../db/client";
import {
  commentsTable,
  extractionsTable,
  itemsTable,
  itemTagsTable,
  rawSnapshotsTable,
  tagsTable,
} from "../../db/schema";
import type { AppEnv } from "../../lib/config/env";
import type {
  ExtractionAttempt,
  ExtractionStatus,
  IngestorName,
  ItemIdentity,
} from "./ingestors";
import {
  getIngestor,
  normalizeSourceUrl,
  resolveIngestorName,
} from "./ingestors";

type IngestServiceContract = TrpcServices["ingest"];
type Database = NonNullable<DatabaseState["db"]>;

type IngestResult = {
  created: boolean;
  extractionId: number | null;
  ingestor: IngestorName;
  itemId: number;
  normalizedUrl: string;
  snapshotId: number;
  sourceItem: IngestResult | null;
  sourceType: string;
  status: ExtractionStatus;
  subjectItemId: number | null;
};

type InternalIngestInput = {
  ingestor?: IngestorName | null;
  payload?: unknown;
  skipLinkedUrls?: boolean;
  url: string;
};

function requireDatabase(database: DatabaseState): Database {
  if (!database.db) {
    throw new Error("Database not configured");
  }

  return database.db;
}

function rankStatus(status: ExtractionStatus) {
  switch (status) {
    case "success":
      return 3;
    case "partial":
      return 2;
    default:
      return 1;
  }
}

function pickFirstLinkedUrl(linkedUrls: string[] | undefined) {
  if (!linkedUrls?.length) return null;
  for (const candidate of linkedUrls) {
    try {
      normalizeSourceUrl(candidate);
      return candidate;
    } catch {
      // Skip unparseable URLs and try the next one.
    }
  }
  return null;
}

function preferExtraction(
  current: ExtractionAttempt | null,
  candidate: ExtractionAttempt,
) {
  if (!current) {
    return candidate;
  }

  const currentRank = rankStatus(current.status);
  const candidateRank = rankStatus(candidate.status);

  if (candidateRank !== currentRank) {
    return candidateRank > currentRank ? candidate : current;
  }

  const currentLength = current.contentText?.length ?? 0;
  const candidateLength = candidate.contentText?.length ?? 0;

  return candidateLength > currentLength ? candidate : current;
}

type ItemRow = typeof itemsTable.$inferSelect;

function toSummary(
  row: ItemRow,
  counts: {
    commentCount: number;
    latestExtractionStatus: ExtractionStatus | null;
    snapshotCount: number;
  },
) {
  return {
    author: row.author,
    commentCount: counts.commentCount,
    contentMarkdown: row.contentMarkdown,
    contentText: row.contentText,
    externalId: row.externalId,
    id: row.id,
    ingestedAt: row.ingestedAt.toISOString(),
    latestExtractionStatus: counts.latestExtractionStatus,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    snapshotCount: counts.snapshotCount,
    sourceCreatedAt: row.sourceCreatedAt?.toISOString() ?? null,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    subjectItemId: row.subjectItemId,
    title: row.title,
  };
}

export class IngestService implements IngestServiceContract {
  constructor(
    private readonly database: DatabaseState,
    private readonly env: AppEnv,
  ) {}

  async ingest(input: {
    ingestor?: IngestorName | null;
    payload?: unknown;
    url: string;
  }): Promise<IngestResult> {
    return this.ingestInternal({ ...input, skipLinkedUrls: false });
  }

  private async ingestInternal(
    input: InternalIngestInput,
  ): Promise<IngestResult> {
    const db = requireDatabase(this.database);
    const requestedUrl = normalizeSourceUrl(input.url);
    const ingestorName = resolveIngestorName(
      requestedUrl,
      input.ingestor ?? null,
    );
    const ingestor = getIngestor(ingestorName);
    const capture = await ingestor.capture({
      env: this.env,
      payload: input.payload,
      url: requestedUrl,
    });

    const normalizedUrl = normalizeSourceUrl(
      capture.normalizedUrl ?? requestedUrl,
    );
    const identity = ingestor.identify({
      payload: input.payload,
      snapshots: capture.snapshots,
      url: normalizedUrl,
    });

    const extractions: Array<{
      attempt: ExtractionAttempt;
      snapshot: (typeof capture.snapshots)[number];
    }> = [];
    let preferredExtraction: ExtractionAttempt | null = null;
    for (const snapshot of capture.snapshots) {
      const attempt = await ingestor.extract({
        payload: input.payload,
        snapshot,
        url: normalizedUrl,
      });
      extractions.push({ attempt, snapshot });
      preferredExtraction = preferExtraction(preferredExtraction, attempt);
    }

    // The archived item is always primary (subjectItemId=null). If the ingestor
    // surfaces a linked off-site URL (e.g. the article an HN thread points at),
    // we auto-fetch it and attach it as a child pointing back at this item.
    const { created, itemId } = await this.ensureItem(db, {
      ...identity,
      sourceUrl: normalizedUrl,
      subjectItemId: null,
    });

    let latestExtractionId: number | null = null;
    let latestSnapshotId = 0;
    for (const { attempt, snapshot } of extractions) {
      const [storedSnapshot] = await db
        .insert(rawSnapshotsTable)
        .values({
          body: snapshot.body,
          contentType: snapshot.contentType,
          itemId,
        })
        .returning({ id: rawSnapshotsTable.id });
      latestSnapshotId = storedSnapshot.id;

      const [storedExtraction] = await db
        .insert(extractionsTable)
        .values({
          errorMessage: attempt.errorMessage ?? null,
          extractor: attempt.extractor,
          extractorVersion: attempt.extractorVersion ?? null,
          itemId: attempt.status === "failed" ? null : itemId,
          snapshotId: storedSnapshot.id,
          status: attempt.status,
        })
        .returning({ id: extractionsTable.id });
      latestExtractionId = storedExtraction.id;
    }

    let sourceItem: IngestResult | null = null;
    let linkedFetchError: string | null = null;
    const linkedUrl = !input.skipLinkedUrls
      ? pickFirstLinkedUrl(preferredExtraction?.linkedUrls)
      : null;
    if (linkedUrl) {
      try {
        sourceItem = await this.ingestInternal({
          skipLinkedUrls: true,
          url: linkedUrl,
        });
        // Only link newly-created children. If the user had already archived
        // this URL standalone, respect that earlier intent and leave it as a
        // top-level item rather than silently demoting it.
        if (sourceItem.created) {
          await db
            .update(itemsTable)
            .set({ subjectItemId: itemId })
            .where(eq(itemsTable.id, sourceItem.itemId));
          sourceItem = { ...sourceItem, subjectItemId: itemId };
        }
      } catch (error) {
        linkedFetchError =
          error instanceof Error ? error.message : "Unknown error";
      }
    }

    if (preferredExtraction && preferredExtraction.status !== "failed") {
      await this.applyExtraction(db, {
        extraction: preferredExtraction,
        extraMetadata: linkedFetchError ? { linkedFetchError } : undefined,
        fallbackIdentity: {
          ...identity,
          sourceUrl: normalizedUrl,
        },
        itemId,
      });
    }

    return {
      created,
      extractionId: latestExtractionId,
      ingestor: ingestorName,
      itemId,
      normalizedUrl,
      snapshotId: latestSnapshotId,
      sourceItem,
      sourceType: preferredExtraction?.sourceType ?? identity.sourceType,
      status: preferredExtraction?.status ?? "failed",
      subjectItemId: null,
    };
  }

  async ingestBatch(input: {
    items: Array<Parameters<IngestService["ingest"]>[0]>;
  }) {
    const results = [];
    for (const item of input.items) {
      results.push(await this.ingest(item));
    }
    return { results };
  }

  async list(
    input: { search?: string; sourceType?: string; tagIds?: number[] } = {},
  ) {
    const db = requireDatabase(this.database);

    const conditions: SQL[] = [];

    if (input.sourceType) {
      conditions.push(eq(itemsTable.sourceType, input.sourceType));
    }

    if (input.search?.trim()) {
      conditions.push(
        sql`${itemsTable.searchVector} @@ plainto_tsquery('english', ${input.search.trim()})`,
      );
    }

    if (input.tagIds && input.tagIds.length > 0) {
      const tagSubquery = db
        .select({ itemId: itemTagsTable.itemId })
        .from(itemTagsTable)
        .where(inArray(itemTagsTable.tagId, input.tagIds))
        .groupBy(itemTagsTable.itemId)
        .having(
          sql`count(distinct ${itemTagsTable.tagId}) = ${input.tagIds.length}`,
        );

      conditions.push(inArray(itemsTable.id, tagSubquery));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(itemsTable)
      .where(whereClause)
      .orderBy(desc(itemsTable.ingestedAt));

    if (rows.length === 0) {
      return {
        items: [],
        total: 0,
      };
    }

    const itemIds = rows.map((row) => row.id);

    const [countRows, commentRows, extractionRows, totalRows, tagRows] =
      await Promise.all([
        db
          .select({
            count: sql<number>`count(*)`,
            itemId: rawSnapshotsTable.itemId,
          })
          .from(rawSnapshotsTable)
          .where(inArray(rawSnapshotsTable.itemId, itemIds))
          .groupBy(rawSnapshotsTable.itemId),
        db
          .select({
            count: sql<number>`count(*)`,
            itemId: commentsTable.itemId,
          })
          .from(commentsTable)
          .where(inArray(commentsTable.itemId, itemIds))
          .groupBy(commentsTable.itemId),
        db
          .select({
            extractedAt: extractionsTable.extractedAt,
            itemId: extractionsTable.itemId,
            status: extractionsTable.status,
          })
          .from(extractionsTable)
          .where(inArray(extractionsTable.itemId, itemIds))
          .orderBy(desc(extractionsTable.extractedAt)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(itemsTable)
          .where(whereClause),
        db
          .select({
            itemId: itemTagsTable.itemId,
            tagId: tagsTable.id,
            tagName: tagsTable.name,
          })
          .from(itemTagsTable)
          .innerJoin(tagsTable, eq(itemTagsTable.tagId, tagsTable.id))
          .where(inArray(itemTagsTable.itemId, itemIds)),
      ]);

    const snapshotCountByItem = new Map(
      countRows.map((row) => [row.itemId, Number(row.count)]),
    );
    const commentCountByItem = new Map(
      commentRows.map((row) => [row.itemId, Number(row.count)]),
    );
    const latestExtractionByItem = new Map<number, ExtractionStatus>();

    for (const row of extractionRows) {
      if (row.itemId && !latestExtractionByItem.has(row.itemId)) {
        latestExtractionByItem.set(row.itemId, row.status as ExtractionStatus);
      }
    }

    const tagsByItem = new Map<number, Array<{ id: number; name: string }>>();
    for (const row of tagRows) {
      const existing = tagsByItem.get(row.itemId) ?? [];
      existing.push({ id: row.tagId, name: row.tagName });
      tagsByItem.set(row.itemId, existing);
    }

    return {
      items: rows.map((row) => ({
        ...toSummary(row, {
          commentCount: commentCountByItem.get(row.id) ?? 0,
          latestExtractionStatus: latestExtractionByItem.get(row.id) ?? null,
          snapshotCount: snapshotCountByItem.get(row.id) ?? 0,
        }),
        tags: tagsByItem.get(row.id) ?? [],
      })),
      total: Number(totalRows[0]?.count ?? 0),
    };
  }

  async get(input: { id: number }) {
    const db = requireDatabase(this.database);
    const [item] = await db
      .select()
      .from(itemsTable)
      .where(eq(itemsTable.id, input.id))
      .limit(1);

    if (!item) {
      throw new Error(`Item ${input.id} not found`);
    }

    const [snapshots, comments, itemTagRows, linkedItemRows] =
      await Promise.all([
        db
          .select()
          .from(rawSnapshotsTable)
          .where(eq(rawSnapshotsTable.itemId, input.id))
          .orderBy(desc(rawSnapshotsTable.capturedAt)),
        db
          .select()
          .from(commentsTable)
          .where(eq(commentsTable.itemId, input.id))
          .orderBy(commentsTable.path),
        db
          .select({
            tagId: tagsTable.id,
            tagName: tagsTable.name,
          })
          .from(itemTagsTable)
          .innerJoin(tagsTable, eq(itemTagsTable.tagId, tagsTable.id))
          .where(eq(itemTagsTable.itemId, input.id)),
        db
          .select()
          .from(itemsTable)
          .where(eq(itemsTable.subjectItemId, input.id))
          .orderBy(desc(itemsTable.ingestedAt))
          .limit(1),
      ]);

    const snapshotIds = snapshots.map((snapshot) => snapshot.id);
    const extractions =
      snapshotIds.length === 0
        ? []
        : await db
            .select()
            .from(extractionsTable)
            .where(inArray(extractionsTable.snapshotId, snapshotIds))
            .orderBy(desc(extractionsTable.extractedAt));

    const [linkedItem = null] = await this.summarizeItemRows(
      db,
      linkedItemRows,
    );

    return {
      item: {
        ...toSummary(item, {
          commentCount: comments.length,
          latestExtractionStatus:
            (extractions[0]?.status as ExtractionStatus | undefined) ?? null,
          snapshotCount: snapshots.length,
        }),
        tags: itemTagRows.map((row) => ({ id: row.tagId, name: row.tagName })),
        comments: comments.map((comment) => ({
          author: comment.author,
          contentMarkdown: comment.contentMarkdown,
          contentText: comment.contentText,
          externalId: comment.externalId,
          id: comment.id,
          metadata: (comment.metadata ?? {}) as Record<string, unknown>,
          parentExternalId: comment.parentExternalId,
          path: comment.path,
          sourceCreatedAt: comment.sourceCreatedAt?.toISOString() ?? null,
        })),
        linkedItem,
        extractions: extractions.map((extraction) => ({
          errorMessage: extraction.errorMessage,
          extractedAt: extraction.extractedAt.toISOString(),
          extractor: extraction.extractor,
          extractorVersion: extraction.extractorVersion,
          id: extraction.id,
          snapshotId: extraction.snapshotId,
          status: extraction.status as ExtractionStatus,
        })),
        snapshots: snapshots.map((snapshot) => ({
          body: snapshot.body,
          capturedAt: snapshot.capturedAt.toISOString(),
          contentType: snapshot.contentType,
          id: snapshot.id,
        })),
      },
    };
  }

  async delete(input: { id: number }) {
    const db = requireDatabase(this.database);
    const result = await db
      .delete(itemsTable)
      .where(eq(itemsTable.id, input.id))
      .returning({ id: itemsTable.id });

    return { deleted: result.length > 0 };
  }

  private async summarizeItemRows(db: Database, rows: ItemRow[]) {
    if (rows.length === 0) {
      return [];
    }

    const itemIds = rows.map((row) => row.id);

    const [snapshotCountRows, commentCountRows, extractionRows, tagRows] =
      await Promise.all([
        db
          .select({
            count: sql<number>`count(*)`,
            itemId: rawSnapshotsTable.itemId,
          })
          .from(rawSnapshotsTable)
          .where(inArray(rawSnapshotsTable.itemId, itemIds))
          .groupBy(rawSnapshotsTable.itemId),
        db
          .select({
            count: sql<number>`count(*)`,
            itemId: commentsTable.itemId,
          })
          .from(commentsTable)
          .where(inArray(commentsTable.itemId, itemIds))
          .groupBy(commentsTable.itemId),
        db
          .select({
            extractedAt: extractionsTable.extractedAt,
            itemId: extractionsTable.itemId,
            status: extractionsTable.status,
          })
          .from(extractionsTable)
          .where(inArray(extractionsTable.itemId, itemIds))
          .orderBy(desc(extractionsTable.extractedAt)),
        db
          .select({
            itemId: itemTagsTable.itemId,
            tagId: tagsTable.id,
            tagName: tagsTable.name,
          })
          .from(itemTagsTable)
          .innerJoin(tagsTable, eq(itemTagsTable.tagId, tagsTable.id))
          .where(inArray(itemTagsTable.itemId, itemIds)),
      ]);

    const snapshotCountByItem = new Map(
      snapshotCountRows.map((row) => [row.itemId, Number(row.count)]),
    );
    const commentCountByItem = new Map(
      commentCountRows.map((row) => [row.itemId, Number(row.count)]),
    );
    const latestExtractionByItem = new Map<number, ExtractionStatus>();
    for (const row of extractionRows) {
      if (row.itemId && !latestExtractionByItem.has(row.itemId)) {
        latestExtractionByItem.set(row.itemId, row.status as ExtractionStatus);
      }
    }
    const tagsByItem = new Map<number, Array<{ id: number; name: string }>>();
    for (const row of tagRows) {
      const existing = tagsByItem.get(row.itemId) ?? [];
      existing.push({ id: row.tagId, name: row.tagName });
      tagsByItem.set(row.itemId, existing);
    }

    return rows.map((row) => ({
      ...toSummary(row, {
        commentCount: commentCountByItem.get(row.id) ?? 0,
        latestExtractionStatus: latestExtractionByItem.get(row.id) ?? null,
        snapshotCount: snapshotCountByItem.get(row.id) ?? 0,
      }),
      tags: tagsByItem.get(row.id) ?? [],
    }));
  }

  private async ensureItem(
    db: Database,
    identity: ItemIdentity & { subjectItemId: number | null },
  ) {
    const existing = await db
      .select({ id: itemsTable.id })
      .from(itemsTable)
      .where(
        and(
          eq(itemsTable.sourceType, identity.sourceType),
          eq(itemsTable.externalId, identity.externalId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const updates: Partial<typeof itemsTable.$inferInsert> = {
        sourceUrl: identity.sourceUrl,
      };
      if (identity.subjectItemId !== null) {
        updates.subjectItemId = identity.subjectItemId;
      }
      await db
        .update(itemsTable)
        .set(updates)
        .where(eq(itemsTable.id, existing[0].id));

      return {
        created: false,
        itemId: existing[0].id,
      };
    }

    const [item] = await db
      .insert(itemsTable)
      .values({
        externalId: identity.externalId,
        metadata: {},
        sourceType: identity.sourceType,
        sourceUrl: identity.sourceUrl,
        subjectItemId: identity.subjectItemId,
      })
      .returning({ id: itemsTable.id });

    return {
      created: true,
      itemId: item.id,
    };
  }

  private async applyExtraction(
    db: Database,
    input: {
      extraction: ExtractionAttempt;
      extraMetadata?: Record<string, unknown>;
      fallbackIdentity: ItemIdentity;
      itemId: number;
    },
  ) {
    const metadata: Record<string, unknown> = {
      ...(input.extraction.metadata ?? {}),
      ...(input.extraMetadata ?? {}),
    };

    await db
      .update(itemsTable)
      .set({
        author: input.extraction.author ?? null,
        contentMarkdown: input.extraction.contentMarkdown ?? null,
        contentText: input.extraction.contentText ?? null,
        externalId:
          input.extraction.externalId ?? input.fallbackIdentity.externalId,
        metadata,
        sourceCreatedAt: input.extraction.sourceCreatedAt
          ? new Date(input.extraction.sourceCreatedAt)
          : null,
        sourceType:
          input.extraction.sourceType ?? input.fallbackIdentity.sourceType,
        sourceUrl:
          input.extraction.sourceUrl ?? input.fallbackIdentity.sourceUrl,
        title: input.extraction.title ?? null,
      })
      .where(eq(itemsTable.id, input.itemId));

    await db
      .delete(commentsTable)
      .where(eq(commentsTable.itemId, input.itemId));

    if (!input.extraction.comments?.length) {
      return;
    }

    await db.insert(commentsTable).values(
      input.extraction.comments.map((comment) => ({
        author: comment.author ?? null,
        contentMarkdown: comment.contentMarkdown ?? null,
        contentText: comment.contentText,
        externalId: comment.externalId ?? null,
        itemId: input.itemId,
        metadata: comment.metadata ?? {},
        parentExternalId: comment.parentExternalId ?? null,
        path: comment.path,
        sourceCreatedAt: comment.sourceCreatedAt
          ? new Date(comment.sourceCreatedAt)
          : null,
      })),
    );
  }
}
