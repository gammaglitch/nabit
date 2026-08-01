import type { ExportComment, ExportFrontmatter } from "./markdown";

export type ExportOrder = "asc" | "desc";
export type ExportFormat = "markdown" | "json";

export interface ExportListQuery {
  since?: string;
  limit?: number;
  cursor?: string;
  sourceType?: string;
  order?: ExportOrder;
}

export interface ExportArticleSummary {
  id: number;
  sourceType: string;
  title: string | null;
  sourceUrl: string | null;
  ingestedAt: string;
  sourceCreatedAt: string | null;
  contentUpdatedAt: string;
  commentCount: number;
  contentHash: string;
  slug: string;
}

export interface ExportListResult {
  articles: ExportArticleSummary[];
  nextCursor: string | null;
  total: number;
}

// Structured representation of a single article, returned by the service and
// either rendered to a Markdown document or serialized as JSON by the route.
export interface ExportArticleData {
  frontmatter: ExportFrontmatter;
  title: string | null;
  contentMarkdown: string | null;
  contentText: string | null;
  comments: ExportComment[];
}
