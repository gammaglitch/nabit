import { z } from "zod";

export const CrawlScopeMode = z.enum(["host", "path"]);

export const CrawlStatus = z.enum([
  "queued",
  "running",
  "paused",
  "done",
  "failed",
  "cancelled",
]);

export const CrawlPageStatus = z.enum([
  "queued",
  "running",
  "done",
  "failed",
  "skipped",
]);

// Bounds mirror the clamps in CrawlService so an out-of-range request is a
// validation error rather than a silently different crawl.
export const StartCrawlInput = z.object({
  url: z.string().url(),
  // 'host' stays on the exact hostname; 'path' additionally keeps to the
  // root's directory.
  scope: CrawlScopeMode.default("host"),
  // Off-scope pages are archived but never expanded, so this stays one hop.
  followExternal: z.boolean().default(false),
  maxDepth: z.number().int().min(0).max(10).default(3),
  maxPages: z.number().int().min(1).max(5000).default(200),
  includePattern: z.string().max(500).nullish(),
  excludePattern: z.string().max(500).nullish(),
  label: z.string().max(200).nullish(),
});

export const CrawlOutput = z.object({
  id: z.number(),
  rootUrl: z.string(),
  rootItemId: z.number().nullable(),
  label: z.string().nullable(),
  scope: CrawlScopeMode,
  pathPrefix: z.string().nullable(),
  followExternal: z.boolean(),
  includePattern: z.string().nullable(),
  excludePattern: z.string().nullable(),
  maxDepth: z.number(),
  maxPages: z.number(),
  status: CrawlStatus,
  errorMessage: z.string().nullable(),
  pagesDone: z.number(),
  pagesFailed: z.number(),
  pagesQueued: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
});

export const StartCrawlOutput = z.object({
  crawl: CrawlOutput,
  rootPageId: z.number(),
});

export const CrawlPageOutput = z.object({
  id: z.number(),
  itemId: z.number().nullable(),
  url: z.string(),
  title: z.string().nullable(),
  depth: z.number(),
  // Null for the root. Every other page names the page that linked to it,
  // which is what the site browser builds its tree from.
  parentPageId: z.number().nullable(),
  discoveryIndex: z.number(),
  isRoot: z.boolean(),
  isLeaf: z.boolean(),
  isExternal: z.boolean(),
  status: CrawlPageStatus,
  errorMessage: z.string().nullable(),
  sourceType: z.string().nullable(),
});

export const GetCrawlInput = z.object({
  id: z.number(),
});

export const GetCrawlOutput = z.object({
  crawl: CrawlOutput,
  // Ordered parents-before-children, so the tree can be assembled in one pass.
  pages: z.array(CrawlPageOutput),
});

export const ListCrawlsInput = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
  })
  .optional();

export const ListCrawlsOutput = z.object({
  crawls: z.array(CrawlOutput),
});

export const CancelCrawlInput = z.object({
  id: z.number(),
});

export const DeleteCrawlInput = z.object({
  id: z.number(),
  // Off by default: dropping the archived pages is a separate, louder decision
  // than removing the crawl that collected them.
  deleteItems: z.boolean().default(false),
});

export const DeleteCrawlOutput = z.object({
  id: z.number(),
  deletedItems: z.number(),
});

export type CrawlScopeModeDTO = z.infer<typeof CrawlScopeMode>;
export type CrawlStatusDTO = z.infer<typeof CrawlStatus>;
export type CrawlPageStatusDTO = z.infer<typeof CrawlPageStatus>;
export type StartCrawlInputDTO = z.infer<typeof StartCrawlInput>;
export type StartCrawlOutputDTO = z.infer<typeof StartCrawlOutput>;
export type CrawlOutputDTO = z.infer<typeof CrawlOutput>;
export type CrawlPageOutputDTO = z.infer<typeof CrawlPageOutput>;
export type GetCrawlInputDTO = z.infer<typeof GetCrawlInput>;
export type GetCrawlOutputDTO = z.infer<typeof GetCrawlOutput>;
export type ListCrawlsInputDTO = z.infer<typeof ListCrawlsInput>;
export type ListCrawlsOutputDTO = z.infer<typeof ListCrawlsOutput>;
export type CancelCrawlInputDTO = z.infer<typeof CancelCrawlInput>;
export type DeleteCrawlInputDTO = z.infer<typeof DeleteCrawlInput>;
export type DeleteCrawlOutputDTO = z.infer<typeof DeleteCrawlOutput>;
