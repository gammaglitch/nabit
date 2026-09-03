export type IngestorName = "tweet" | "reddit" | "hacker_news" | "generic";
export type ExtractionStatus = "success" | "partial" | "failed";

export type SnapshotArtifact = {
  body: string;
  contentType: string;
};

export type ItemIdentity = {
  externalId: string;
  sourceType: string;
  /**
   * Every `source_type` this ingestor may store the item under, including
   * `sourceType` itself. Defaults to just `sourceType`.
   *
   * An item is looked up by `(source_type, external_id)`, so an ingestor
   * whose `identify` and `extract` can disagree needs to declare both: the
   * generic ingestor calls a page `webpage` before it has read it, then
   * reclassifies it to `article` once extraction finds enough prose. On a
   * re-archive, matching on `webpage` alone misses the `article` row the
   * first archive left behind, inserts a second row, and then collides on
   * `uq_items_source_external` the moment extraction updates it.
   *
   * Widening the lookup to `external_id` alone would not be safe: ids are
   * only unique per ingestor, and a tweet id and a Hacker News item id are
   * both bare integers.
   */
  sourceTypeCandidates?: string[];
  sourceUrl: string;
};

export type ExtractedComment = {
  author?: string | null;
  contentMarkdown?: string | null;
  contentText: string;
  externalId?: string | null;
  metadata?: Record<string, unknown>;
  parentExternalId?: string | null;
  path: string;
  sourceCreatedAt?: string | null;
};

export type ExtractionAttempt = {
  author?: string | null;
  comments?: ExtractedComment[];
  contentMarkdown?: string | null;
  contentText?: string | null;
  errorMessage?: string | null;
  externalId?: string | null;
  extractor: string;
  extractorVersion?: string | null;
  linkedUrls?: string[];
  /**
   * Every link on the page, in document order, for a crawl to walk.
   *
   * Distinct from `linkedUrls`, which keeps its narrow meaning: the single
   * off-site article a discussion thread points at. These are unfiltered —
   * scoping is the crawl's job (see modules/crawl/scope.ts), not the
   * extractor's — and are present even on extractions that graded `failed`,
   * because a table-of-contents page is exactly that: no prose, all links.
   */
  outboundLinks?: string[];
  metadata?: Record<string, unknown>;
  sourceCreatedAt?: string | null;
  sourceType?: string;
  sourceUrl?: string | null;
  status: ExtractionStatus;
  title?: string | null;
};

export type CaptureInput = {
  payload?: unknown;
  url: string;
  /** Server-side ingestors may pass additional context (e.g. env config). */
  [key: string]: unknown;
};

export type CaptureResult = {
  normalizedUrl?: string;
  snapshots: SnapshotArtifact[];
};

export type IdentifyInput = {
  payload?: unknown;
  snapshots: SnapshotArtifact[];
  url: string;
};

export type ExtractInput = {
  payload?: unknown;
  snapshot: SnapshotArtifact;
  url: string;
};

export interface Ingestor {
  capture(input: CaptureInput): Promise<CaptureResult>;
  extract(input: ExtractInput): Promise<ExtractionAttempt>;
  identify(input: IdentifyInput): ItemIdentity;
  matches(url: URL): boolean;
  name: IngestorName;
}
