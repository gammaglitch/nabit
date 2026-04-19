import { z } from "zod";

export const IngestorName = z.enum([
  "tweet",
  "reddit",
  "hacker_news",
  "generic",
]);

export const ExtractionStatus = z.enum(["success", "partial", "failed"]);

const MetadataRecord = z.record(z.string(), z.unknown());

export const IngestItem = z.object({
  url: z.string().url(),
  payload: z.unknown().optional(),
  ingestor: IngestorName.nullish(),
});

export const IngestInput = IngestItem;

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

export const ItemListInput = z
  .object({
    sourceType: z.string().optional(),
    tagIds: z.array(z.number()).optional(),
    search: z.string().optional(),
  })
  .optional();

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
  snapshotCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  latestExtractionStatus: ExtractionStatus.nullable(),
  tags: z.array(z.object({ id: z.number(), name: z.string() })),
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
