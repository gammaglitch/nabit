export type IngestorName = "tweet" | "reddit" | "hacker_news" | "generic";
export type ExtractionStatus = "success" | "partial" | "failed";

export type SnapshotArtifact = {
  body: string;
  contentType: string;
};

export type ItemIdentity = {
  externalId: string;
  sourceType: string;
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
  /**
   * Whether `capture` can fetch the source itself, with nothing but the URL.
   * False for ingestors that depend on a browser-side capturer handing them a
   * payload (`tweet`), which is what stops a refresh from queueing a job that
   * could only ever throw.
   */
  refetchable: boolean;
}
