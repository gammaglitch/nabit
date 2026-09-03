import { z } from "zod";

export const IngestorName = z.enum([
  "tweet",
  "reddit",
  "hacker_news",
  "generic",
]);

export const ExtractionStatus = z.enum(["success", "partial", "failed"]);
export const IngestJobStatus = z.enum([
  "queued",
  "processing",
  "success",
  "failed",
]);

const MetadataRecord = z.record(z.string(), z.unknown());

export const IngestItem = z.object({
  url: z.string().url(),
  payload: z.unknown().optional(),
  ingestor: IngestorName.nullish(),
  // Enroll this item for LLM summarization and the weekly digest. Optional
  // rather than defaulted here so the one default lives in the service and
  // covers the REST paths too, which never pass through this schema.
  digestOptIn: z.boolean().optional(),
});

export const IngestInput = IngestItem;
export const EnqueueIngestInput = IngestItem;

const IngestOutputBase = z.object({
  itemId: z.number(),
  created: z.boolean(),
  sourceType: z.string(),
  normalizedUrl: z.string().url(),
  ingestor: IngestorName,
  snapshotId: z.number(),
  extractionId: z.number().nullable(),
  status: ExtractionStatus,
  subjectItemId: z.number().nullable(),
});

type IngestOutputShape = z.infer<typeof IngestOutputBase> & {
  sourceItem: IngestOutputShape | null;
};

export const IngestOutput: z.ZodType<IngestOutputShape> =
  IngestOutputBase.extend({
    sourceItem: z.lazy(() => IngestOutput.nullable()),
  });

export const IngestBatchInput = z.object({
  items: z.array(IngestItem).min(1).max(500),
});

export const IngestBatchOutput = z.object({
  results: z.array(IngestOutput),
});

export const IngestJobOutput = z.object({
  id: z.number(),
  status: IngestJobStatus,
  url: z.string().url(),
  ingestor: IngestorName.nullable(),
  itemId: z.number().nullable(),
  // `.catch(null)` keeps historical jobs decodable when `IngestOutput` evolves
  // — old result blobs that no longer match the current schema fall back to
  // null instead of breaking the entire job list.
  result: IngestOutput.nullable().catch(null),
  errorMessage: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  runAfter: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
});

export const EnqueueIngestOutput = z.object({
  job: IngestJobOutput,
  // True when an in-flight job for the same URL already existed; clients
  // can use this to distinguish "newly queued" from "piggybacking on an
  // existing capture" without poking at attempts/status.
  reused: z.boolean(),
});

export const GetIngestJobInput = z.object({
  id: z.number(),
});

export const ListIngestJobsInput = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
  })
  .optional();

export const ListIngestJobsOutput = z.object({
  jobs: z.array(IngestJobOutput),
});

export const ItemListInput = z
  .object({
    sourceType: z.string().optional(),
    tagIds: z.array(z.number()).optional(),
    search: z.string().optional(),
    // Sub-pages collected by a crawl are hidden by default: the library shows
    // one row for the site, and the pages are browsed in the site view.
    includeCrawledPages: z.boolean().optional(),
  })
  .optional();

// Present only on an item that is the root of a crawl, and what lets the
// library render "a site of N pages" instead of a lone index page.
export const ItemCrawlSummary = z.object({
  id: z.number(),
  label: z.string().nullable(),
  pageCount: z.number().int().nonnegative(),
  // This item's own page within the crawl, so the reader can link straight to
  // its place in the site tree.
  pageId: z.number(),
  pagesQueued: z.number().int().nonnegative(),
  status: z.string(),
});

export const ItemSummaryOutput = z.object({
  id: z.number(),
  sourceType: z.string(),
  sourceUrl: z.string().nullable(),
  externalId: z.string().nullable(),
  subjectItemId: z.number().nullable(),
  author: z.string().nullable(),
  contentMarkdown: z.string().nullable(),
  contentText: z.string().nullable(),
  title: z.string().nullable(),
  sourceCreatedAt: z.string().nullable(),
  ingestedAt: z.string(),
  metadata: MetadataRecord,
  digestOptIn: z.boolean(),
  snapshotCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  latestExtractionStatus: ExtractionStatus.nullable(),
  tags: z.array(z.object({ id: z.number(), name: z.string() })),
  crawl: ItemCrawlSummary.nullable(),
});

export const ItemListOutput = z.object({
  items: z.array(ItemSummaryOutput),
  total: z.number(),
});

export const RawSnapshotOutput = z.object({
  id: z.number(),
  contentType: z.string(),
  body: z.string(),
  capturedAt: z.string(),
});

export const ExtractionOutput = z.object({
  id: z.number(),
  snapshotId: z.number(),
  extractor: z.string(),
  extractorVersion: z.string().nullable(),
  status: ExtractionStatus,
  errorMessage: z.string().nullable(),
  extractedAt: z.string(),
});

export const CommentOutput = z.object({
  id: z.number(),
  externalId: z.string().nullable(),
  parentExternalId: z.string().nullable(),
  path: z.string(),
  author: z.string().nullable(),
  contentText: z.string(),
  contentMarkdown: z.string().nullable(),
  sourceCreatedAt: z.string().nullable(),
  metadata: MetadataRecord,
});

export const ItemDetailOutput = z.object({
  item: ItemSummaryOutput.extend({
    snapshots: z.array(RawSnapshotOutput),
    extractions: z.array(ExtractionOutput),
    comments: z.array(CommentOutput),
    linkedItem: ItemSummaryOutput.nullable(),
  }),
});

export type IngestItemDTO = z.infer<typeof IngestItem>;
export type IngestInputDTO = z.infer<typeof IngestInput>;
export type IngestOutputDTO = z.infer<typeof IngestOutput>;
export type IngestBatchInputDTO = z.infer<typeof IngestBatchInput>;
export type IngestBatchOutputDTO = z.infer<typeof IngestBatchOutput>;
export type EnqueueIngestInputDTO = z.infer<typeof EnqueueIngestInput>;
export type EnqueueIngestOutputDTO = z.infer<typeof EnqueueIngestOutput>;
export type GetIngestJobInputDTO = z.infer<typeof GetIngestJobInput>;
export type IngestJobOutputDTO = z.infer<typeof IngestJobOutput>;
export type IngestJobStatusDTO = z.infer<typeof IngestJobStatus>;
export type ListIngestJobsInputDTO = z.infer<typeof ListIngestJobsInput>;
export type ListIngestJobsOutputDTO = z.infer<typeof ListIngestJobsOutput>;
export type IngestorNameDTO = z.infer<typeof IngestorName>;
export type ExtractionStatusDTO = z.infer<typeof ExtractionStatus>;

export const DeleteInput = z.object({
  id: z.number(),
});

export const DeleteOutput = z.object({
  deleted: z.boolean(),
});

export const GetItemInput = z.object({
  id: z.number(),
});

export const ReextractInput = z.object({
  id: z.number(),
  // Override the ingestor the URL would normally resolve to. Mirrors `ingest`,
  // and lets a mis-routed item be re-extracted correctly without re-capturing.
  ingestor: IngestorName.nullish(),
});

export const ReextractOutput = z.object({
  itemId: z.number(),
  ingestor: IngestorName,
  // The snapshot whose extraction won, not the newest one — with a rendered
  // browser capture alongside the raw fetch, either may be the better source.
  snapshotId: z.number().nullable(),
  snapshotsExtracted: z.number().int().positive(),
  extractionId: z.number().nullable(),
  status: ExtractionStatus,
  // False when every attempt failed, in which case the item keeps the content
  // from whichever earlier run succeeded.
  applied: z.boolean(),
});

export const SetDigestOptInInput = z.object({
  id: z.number(),
  digestOptIn: z.boolean(),
});

export const SetDigestOptInOutput = z.object({
  id: z.number(),
  digestOptIn: z.boolean(),
});

export type ItemListInputDTO = z.infer<typeof ItemListInput>;
export type ItemSummaryOutputDTO = z.infer<typeof ItemSummaryOutput>;
export type ItemListOutputDTO = z.infer<typeof ItemListOutput>;
export type RawSnapshotOutputDTO = z.infer<typeof RawSnapshotOutput>;
export type ExtractionOutputDTO = z.infer<typeof ExtractionOutput>;
export type CommentOutputDTO = z.infer<typeof CommentOutput>;
export type ItemDetailOutputDTO = z.infer<typeof ItemDetailOutput>;
export type DeleteInputDTO = z.infer<typeof DeleteInput>;
export type DeleteOutputDTO = z.infer<typeof DeleteOutput>;
export type GetItemInputDTO = z.infer<typeof GetItemInput>;
export type ReextractInputDTO = z.infer<typeof ReextractInput>;
export type ReextractOutputDTO = z.infer<typeof ReextractOutput>;
export type SetDigestOptInInputDTO = z.infer<typeof SetDigestOptInInput>;
export type SetDigestOptInOutputDTO = z.infer<typeof SetDigestOptInOutput>;
