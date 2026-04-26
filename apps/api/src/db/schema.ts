import { sql } from "drizzle-orm";
import {
  check,
  customType,
  foreignKey,
  index,
  pgSchema,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";

export const schema = pgSchema("nabit");

const ltree = customType<{ data: string }>({
  dataType() {
    return "ltree";
  },
});

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const usersTable = schema.table("users", (t) => ({
  id: t.bigserial({ mode: "number" }).primaryKey(),
  email: t.text().notNull().unique(),
  name: t.text().notNull(),
}));

export const itemsTable = schema.table(
  "items",
  (t) => ({
    id: t.bigserial({ mode: "number" }).primaryKey(),
    sourceType: t.text("source_type").notNull(),
    sourceUrl: t.text("source_url"),
    externalId: t.text("external_id"),
    subjectItemId: t.bigint("subject_item_id", { mode: "number" }),
    author: t.text("author"),
    contentText: t.text("content_text"),
    contentMarkdown: t.text("content_markdown"),
    title: t.text("title"),
    sourceCreatedAt: t.timestamp("source_created_at", { withTimezone: true }),
    ingestedAt: t
      .timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadata: t.jsonb("metadata").notNull().default({}),
    searchVector: tsvector("search_vector"),
  }),
  (table) => [
    unique("uq_items_source_external").on(table.sourceType, table.externalId),
    index("idx_items_source_type").on(table.sourceType),
    index("idx_items_ingested_at").on(table.ingestedAt),
    index("idx_items_metadata").using("gin", table.metadata),
    index("idx_items_search_vector").using("gin", table.searchVector),
    index("idx_items_subject_item_id").on(table.subjectItemId),
    foreignKey({
      columns: [table.subjectItemId],
      foreignColumns: [table.id],
      name: "fk_items_subject_item_id",
    }).onDelete("set null"),
  ],
);

export const rawSnapshotsTable = schema.table(
  "raw_snapshots",
  (t) => ({
    id: t.bigserial({ mode: "number" }).primaryKey(),
    itemId: t
      .bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => itemsTable.id, { onDelete: "cascade" }),
    contentType: t.text("content_type").notNull(),
    body: t.text("body").notNull(),
    capturedAt: t
      .timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [index("idx_raw_snapshots_item_id").on(table.itemId)],
);

export const ingestJobsTable = schema.table(
  "ingest_jobs",
  (t) => ({
    id: t.bigserial({ mode: "number" }).primaryKey(),
    status: t.text("status").notNull().default("queued"),
    url: t.text("url").notNull(),
    ingestor: t.text("ingestor"),
    payload: t.jsonb("payload"),
    itemId: t
      .bigint("item_id", { mode: "number" })
      .references(() => itemsTable.id, { onDelete: "set null" }),
    result: t.jsonb("result"),
    errorMessage: t.text("error_message"),
    attempts: t.integer("attempts").notNull().default(0),
    maxAttempts: t.integer("max_attempts").notNull().default(3),
    runAfter: t
      .timestamp("run_after", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedBy: t.text("locked_by"),
    lockedAt: t.timestamp("locked_at", { withTimezone: true }),
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: t
      .timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: t.timestamp("finished_at", { withTimezone: true }),
  }),
  (table) => [
    index("idx_ingest_jobs_status_run_after").on(table.status, table.runAfter),
    index("idx_ingest_jobs_created_at").on(table.createdAt),
    index("idx_ingest_jobs_item_id").on(table.itemId),
    check(
      "ingest_jobs_status_check",
      sql`${table.status} in ('queued', 'processing', 'success', 'failed')`,
    ),
  ],
);

export const extractionsTable = schema.table(
  "extractions",
  (t) => ({
    id: t.bigserial({ mode: "number" }).primaryKey(),
    snapshotId: t
      .bigint("snapshot_id", { mode: "number" })
      .notNull()
      .references(() => rawSnapshotsTable.id, { onDelete: "cascade" }),
    itemId: t
      .bigint("item_id", { mode: "number" })
      .references(() => itemsTable.id, { onDelete: "set null" }),
    extractor: t.text("extractor").notNull(),
    extractorVersion: t.text("extractor_version"),
    status: t.text("status").notNull().default("success"),
    errorMessage: t.text("error_message"),
    extractedAt: t
      .timestamp("extracted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [
    index("idx_extractions_snapshot_id").on(table.snapshotId),
    index("idx_extractions_item_id").on(table.itemId),
  ],
);

export const commentsTable = schema.table(
  "comments",
  (t) => ({
    id: t.bigserial({ mode: "number" }).primaryKey(),
    itemId: t
      .bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => itemsTable.id, { onDelete: "cascade" }),
    externalId: t.text("external_id"),
    parentExternalId: t.text("parent_external_id"),
    path: ltree("path").notNull(),
    author: t.text("author"),
    contentText: t.text("content_text").notNull(),
    contentMarkdown: t.text("content_markdown"),
    sourceCreatedAt: t.timestamp("source_created_at", { withTimezone: true }),
    metadata: t.jsonb("metadata").notNull().default({}),
  }),
  (table) => [
    unique("uq_comments_item_external").on(table.itemId, table.externalId),
    index("idx_comments_item_id").on(table.itemId),
    index("idx_comments_path").using("gist", table.path),
  ],
);

export const tagsTable = schema.table("tags", (t) => ({
  id: t.bigserial({ mode: "number" }).primaryKey(),
  name: t.text("name").notNull().unique(),
}));

export const itemTagsTable = schema.table(
  "item_tags",
  (t) => ({
    itemId: t
      .bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => itemsTable.id, { onDelete: "cascade" }),
    tagId: t
      .bigint("tag_id", { mode: "number" })
      .notNull()
      .references(() => tagsTable.id, { onDelete: "cascade" }),
  }),
  (table) => [primaryKey({ columns: [table.itemId, table.tagId] })],
);

export const commentTagsTable = schema.table(
  "comment_tags",
  (t) => ({
    commentId: t
      .bigint("comment_id", { mode: "number" })
      .notNull()
      .references(() => commentsTable.id, { onDelete: "cascade" }),
    tagId: t
      .bigint("tag_id", { mode: "number" })
      .notNull()
      .references(() => tagsTable.id, { onDelete: "cascade" }),
  }),
  (table) => [primaryKey({ columns: [table.commentId, table.tagId] })],
);
