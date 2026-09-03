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
    // Bumped whenever the article body or its comments change (see
    // applyExtraction in modules/ingest/service.ts). Drives incremental
    // `since` polling on the /export endpoints — unlike ingestedAt, which is
    // only set once, this moves when comments arrive after the article.
    contentUpdatedAt: t
      .timestamp("content_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadata: t.jsonb("metadata").notNull().default({}),
    // Opt-in for LLM summarization and the weekly digest. Summarizing costs
    // money per item, so nothing is enrolled unless someone asked for it:
    // every ingest path that does not explicitly set this gets `false`.
    //
    // A column rather than a `metadata` key on purpose — applyExtraction
    // (see modules/ingest/service.ts) replaces `metadata` wholesale, so a
    // user-set key there would be wiped by the next re-ingest.
    digestOptIn: t.boolean("digest_opt_in").notNull().default(false),
    searchVector: tsvector("search_vector"),
  }),
  (table) => [
    unique("uq_items_source_external").on(table.sourceType, table.externalId),
    index("idx_items_source_type").on(table.sourceType),
    index("idx_items_ingested_at").on(table.ingestedAt),
    index("idx_items_content_updated_at").on(table.contentUpdatedAt),
    index("idx_items_metadata").using("gin", table.metadata),
    index("idx_items_search_vector").using("gin", table.searchVector),
    index("idx_items_subject_item_id").on(table.subjectItemId),
    // Partial: the digest only ever scans opted-in items in a date window,
    // and those are a small minority of the archive.
    index("idx_items_digest_window")
      .on(table.ingestedAt)
      .where(sql`${table.digestOptIn}`),
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

// A crawl archives a site by walking its links, instead of archiving the one
// URL it was handed: point it at a documentation index and it fans out to the
// pages that index links to. The root page is an ordinary item; what makes the
// result a browsable *site* rather than 200 loose rows is `crawl_pages`, which
// records how the pages found each other.
export const crawlsTable = schema.table(
  "crawls",
  (t) => ({
    id: t.bigserial({ mode: "number" }).primaryKey(),
    rootUrl: t.text("root_url").notNull(),
    rootItemId: t
      .bigint("root_item_id", { mode: "number" })
      .references(() => itemsTable.id, { onDelete: "set null" }),
    label: t.text("label"),
    // 'host' keeps to the exact hostname; 'path' additionally requires the URL
    // to sit under the root's directory. Registrable-domain scope (so that
    // api.site.com counts as the same site) would need a public-suffix list,
    // so it is deliberately not an option yet.
    scope: t.text("scope").notNull().default("host"),
    // Only meaningful for scope='path': the directory every in-scope URL must
    // sit under, with its trailing slash. Stored rather than derived, because
    // normalizeSourceUrl trims the trailing slash that is the only thing
    // distinguishing the directory '/guide/' from the page '/guide'.
    pathPrefix: t.text("path_prefix"),
    // Off-scope links, when followed, are archived but never expanded — see
    // classifyLink in modules/crawl/scope.ts. Without that rule, "follow
    // external links" quietly means "crawl the open web".
    followExternal: t.boolean("follow_external").notNull().default(false),
    includePattern: t.text("include_pattern"),
    excludePattern: t.text("exclude_pattern"),
    maxDepth: t.integer("max_depth").notNull().default(3),
    maxPages: t.integer("max_pages").notNull().default(200),
    status: t.text("status").notNull().default("queued"),
    errorMessage: t.text("error_message"),
    // Denormalized counters. The authoritative numbers are always a count over
    // crawl_pages; these exist so the list view can render progress for every
    // crawl without a per-crawl aggregate.
    pagesDone: t.integer("pages_done").notNull().default(0),
    pagesFailed: t.integer("pages_failed").notNull().default(0),
    pagesQueued: t.integer("pages_queued").notNull().default(0),
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
    index("idx_crawls_status").on(table.status),
    index("idx_crawls_created_at").on(table.createdAt),
    index("idx_crawls_root_item_id").on(table.rootItemId),
    check("crawls_scope_check", sql`${table.scope} in ('host', 'path')`),
    check(
      "crawls_status_check",
      sql`${table.status} in ('queued', 'running', 'paused', 'done', 'failed', 'cancelled')`,
    ),
  ],
);

// The frontier, the visited set, and the page tree, in one table.
//
// `unique(crawl_id, url)` is what makes it the visited set: expansion inserts
// with ON CONFLICT DO NOTHING, so a page linked from twenty siblings is
// fetched once. `parent_page_id` + `discovery_index` reconstruct the tree in
// the order the source linked things, which is what the site browser renders —
// for a table-of-contents page that is the author's own ordering.
export const crawlPagesTable = schema.table(
  "crawl_pages",
  (t) => ({
    id: t.bigserial({ mode: "number" }).primaryKey(),
    crawlId: t
      .bigint("crawl_id", { mode: "number" })
      .notNull()
      .references(() => crawlsTable.id, { onDelete: "cascade" }),
    // Null until the page has actually been ingested, and again if the item is
    // later deleted — the row stays so the tree keeps its shape.
    itemId: t
      .bigint("item_id", { mode: "number" })
      .references(() => itemsTable.id, { onDelete: "set null" }),
    url: t.text("url").notNull(),
    depth: t.integer("depth").notNull().default(0),
    parentPageId: t.bigint("parent_page_id", { mode: "number" }),
    discoveryIndex: t.integer("discovery_index").notNull().default(0),
    isRoot: t.boolean("is_root").notNull().default(false),
    // Archived, but its own links are never harvested: off-scope pages reached
    // because followExternal is on, and in-scope pages that landed on maxDepth.
    isLeaf: t.boolean("is_leaf").notNull().default(false),
    isExternal: t.boolean("is_external").notNull().default(false),
    status: t.text("status").notNull().default("queued"),
    errorMessage: t.text("error_message"),
    // Denormalized so the tree renders without joining every item.
    title: t.text("title"),
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: t
      .timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [
    unique("uq_crawl_pages_crawl_url").on(table.crawlId, table.url),
    index("idx_crawl_pages_crawl_status").on(table.crawlId, table.status),
    index("idx_crawl_pages_item_id").on(table.itemId),
    index("idx_crawl_pages_parent_page_id").on(table.parentPageId),
    foreignKey({
      columns: [table.parentPageId],
      foreignColumns: [table.id],
      name: "fk_crawl_pages_parent_page_id",
    }).onDelete("set null"),
    check(
      "crawl_pages_status_check",
      sql`${table.status} in ('queued', 'running', 'done', 'failed', 'skipped')`,
    ),
  ],
);

export const ingestJobsTable = schema.table(
  "ingest_jobs",
  (t) => ({
    id: t.bigserial({ mode: "number" }).primaryKey(),
    status: t.text("status").notNull().default("queued"),
    url: t.text("url").notNull(),
    ingestor: t.text("ingestor"),
    payload: t.jsonb("payload"),
    // Carries the capture-time digest choice through to item creation, where
    // ensureItem applies it on insert only. Defaults false so the headless
    // ingest paths (REST, extension, Discord bot, userscript) never enroll.
    digestOptIn: t.boolean("digest_opt_in").notNull().default(false),
    // Set only for jobs a crawl queued. Their presence is what tells
    // processNextJob to hand the page's outbound links to CrawlService.expand
    // once the ingest lands; an ordinary ingest has both null and expands
    // nothing.
    crawlId: t
      .bigint("crawl_id", { mode: "number" })
      .references(() => crawlsTable.id, { onDelete: "cascade" }),
    crawlPageId: t
      .bigint("crawl_page_id", { mode: "number" })
      .references(() => crawlPagesTable.id, { onDelete: "cascade" }),
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
    index("idx_ingest_jobs_crawl_id").on(table.crawlId),
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

export const assetsTable = schema.table(
  "assets",
  (t) => ({
    id: t.bigserial({ mode: "number" }).primaryKey(),
    sha256: t.text("sha256").notNull().unique(),
    contentType: t.text("content_type").notNull(),
    byteSize: t.bigint("byte_size", { mode: "number" }).notNull(),
    sourceUrl: t.text("source_url").notNull(),
    storagePath: t.text("storage_path").notNull(),
    fetchedAt: t
      .timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [index("idx_assets_sha256").on(table.sha256)],
);

export const itemAssetsTable = schema.table(
  "item_assets",
  (t) => ({
    itemId: t
      .bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => itemsTable.id, { onDelete: "cascade" }),
    assetId: t
      .bigint("asset_id", { mode: "number" })
      .notNull()
      .references(() => assetsTable.id, { onDelete: "cascade" }),
  }),
  (table) => [
    primaryKey({ columns: [table.itemId, table.assetId] }),
    index("idx_item_assets_asset_id").on(table.assetId),
  ],
);

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

// One LLM-generated TL;DR per item, generated lazily by the digest job for
// items opted in via items.digest_opt_in.
//
// Stored rather than computed inline so a failed digest run resumes instead of
// re-paying for every article it already summarized, and so the summaries can
// be surfaced in the reader later without a second model call.
export const articleSummariesTable = schema.table(
  "article_summaries",
  (t) => ({
    id: t.bigserial({ mode: "number" }).primaryKey(),
    itemId: t
      .bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => itemsTable.id, { onDelete: "cascade" }),
    status: t.text("status").notNull().default("pending"),
    summaryText: t.text("summary_text"),
    model: t.text("model"),
    // Bumped when the prompt changes, so existing summaries can be identified
    // as having been written to a different brief.
    promptVersion: t.integer("prompt_version").notNull().default(1),
    // sha256 of the exact text handed to the model. This is the staleness
    // check rather than items.content_updated_at, which also moves when
    // comments arrive and would invalidate body-only summaries constantly.
    sourceSha256: t.text("source_sha256"),
    inputChars: t.integer("input_chars"),
    errorMessage: t.text("error_message"),
    attempts: t.integer("attempts").notNull().default(0),
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: t
      .timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }),
  (table) => [
    unique("uq_article_summaries_item").on(table.itemId),
    index("idx_article_summaries_status").on(table.status),
    check(
      "article_summaries_status_check",
      sql`${table.status} in ('pending', 'success', 'failed')`,
    ),
  ],
);

// One row per digest period. The unique constraint on period_start is the
// exactly-once guard: materializing a due period is an
// `insert ... on conflict do nothing`, which is idempotent, safe to run on
// every worker tick, and safe if the worker is ever scaled past one replica.
// No leader election required.
export const digestsTable = schema.table(
  "digests",
  (t) => ({
    id: t.bigserial({ mode: "number" }).primaryKey(),
    periodStart: t.timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: t.timestamp("period_end", { withTimezone: true }).notNull(),
    status: t.text("status").notNull().default("pending"),
    itemCount: t.integer("item_count").notNull().default(0),
    // Items in the window that are not represented in the digest — summaries
    // that failed, articles with no extracted body, and anything past the
    // maxItems cap. Recorded so a digest never silently reads as complete.
    omittedCount: t.integer("omitted_count").notNull().default(0),
    summaryMarkdown: t.text("summary_markdown"),
    model: t.text("model"),
    errorMessage: t.text("error_message"),
    attempts: t.integer("attempts").notNull().default(0),
    maxAttempts: t.integer("max_attempts").notNull().default(3),
    // Backoff between attempts, same idea as ingest_jobs.run_after. Without it
    // a failing digest is re-claimed on the very next tick and burns all three
    // attempts in seconds — which is exactly the wrong response to a rate
    // limit or a transient 5xx from the model provider.
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
    unique("uq_digests_period_start").on(table.periodStart),
    index("idx_digests_status_run_after").on(table.status, table.runAfter),
    index("idx_digests_period_start").on(table.periodStart),
    check(
      "digests_status_check",
      sql`${table.status} in ('pending', 'processing', 'success', 'failed', 'empty')`,
    ),
  ],
);

// Instance-wide runtime configuration, editable from the web settings menu.
// Deliberately key/value rather than one column per setting: these are a
// handful of operator knobs that change shape as features land, and a typed
// resolver in the service layer (see modules/settings) gives the safety a
// wide table would, without a migration per knob.
//
// Secrets do not belong here — OPENROUTER_API_KEY stays an env var so a live
// billing credential never lands in the database or its backups.
export const settingsTable = schema.table("settings", (t) => ({
  key: t.text().primaryKey(),
  value: t.text().notNull(),
  updatedAt: t
    .timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}));
