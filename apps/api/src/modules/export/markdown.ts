import { createHash } from "node:crypto";

// Pure, dependency-free rendering helpers for the export module. No DB or
// Fastify access here so they can be unit-tested in isolation.

export interface ExportFrontmatter {
  nabitId: number;
  sourceType: string;
  title: string | null;
  author: string | null;
  sourceUrl: string | null;
  externalId: string | null;
  sourceCreatedAt: string | null;
  ingestedAt: string;
  contentUpdatedAt: string;
  commentCount: number;
  tags: string[];
  contentHash: string;
}

export interface ExportComment {
  author: string | null;
  path: string;
  sourceCreatedAt: string | null;
  contentMarkdown: string | null;
  contentText: string | null;
}

export interface ExportArticle {
  frontmatter: ExportFrontmatter;
  title: string | null;
  contentMarkdown: string | null;
  contentText: string | null;
  comments: ExportComment[];
}

export interface RenderOptions {
  /** Absolute base URL used to rewrite root-relative /assets/<sha> image URLs. */
  assetBaseUrl?: string;
  /** Include the "## Comments" section. */
  comments?: boolean;
  /** Cap the number of rendered comments (applied after path ordering). */
  maxComments?: number;
}

// ISO timestamps (e.g. 2026-05-29T18:30:00.000Z) and numbers are safe as plain
// YAML scalars; everything else is emitted as a JSON-escaped double-quoted
// scalar, which is also a valid YAML flow scalar and sidesteps every quoting
// edge case (colons, hashes, leading dashes, newlines, reserved words).
function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

export function renderFrontmatter(meta: ExportFrontmatter): string {
  const lines: string[] = ["---"];

  lines.push(`nabit_id: ${meta.nabitId}`);
  lines.push(`source_type: ${yamlScalar(meta.sourceType)}`);
  if (meta.title) lines.push(`title: ${yamlScalar(meta.title)}`);
  if (meta.author) lines.push(`author: ${yamlScalar(meta.author)}`);
  if (meta.sourceUrl) lines.push(`source_url: ${yamlScalar(meta.sourceUrl)}`);
  if (meta.externalId) {
    lines.push(`external_id: ${yamlScalar(meta.externalId)}`);
  }
  if (meta.sourceCreatedAt) {
    lines.push(`source_created_at: ${meta.sourceCreatedAt}`);
  }
  lines.push(`ingested_at: ${meta.ingestedAt}`);
  lines.push(`content_updated_at: ${meta.contentUpdatedAt}`);
  lines.push(`comment_count: ${meta.commentCount}`);
  if (meta.tags.length > 0) {
    lines.push("tags:");
    for (const tag of meta.tags) {
      lines.push(`  - ${yamlScalar(tag)}`);
    }
  }
  lines.push(`content_hash: ${meta.contentHash}`);

  lines.push("---");

  return lines.join("\n");
}

function indentBlock(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? indent + line : line))
    .join("\n");
}

export function renderComments(
  comments: ExportComment[],
  options: { maxComments?: number } = {},
): string {
  const selected =
    options.maxComments !== undefined
      ? comments.slice(0, Math.max(0, options.maxComments))
      : comments;

  if (selected.length === 0) {
    return "";
  }

  const blocks: string[] = [];
  for (const comment of selected) {
    // ltree path "1.2.3" → nesting depth 2 → 4 spaces of indent.
    const depth = Math.max(0, comment.path.split(".").length - 1);
    const indent = "  ".repeat(depth);
    const author = comment.author?.trim() || "anonymous";
    const when = comment.sourceCreatedAt ? ` · ${comment.sourceCreatedAt}` : "";
    const body = (comment.contentMarkdown ?? comment.contentText ?? "").trim();

    let block = `${indent}- **${author}**${when}`;
    if (body) {
      block += `\n\n${indentBlock(body, `${indent}  `)}`;
    }
    blocks.push(block);
  }

  return `## Comments\n\n${blocks.join("\n\n")}`;
}

// Rewrites the root-relative asset URLs produced at ingest time
// (![alt](/assets/<sha>)) into absolute URLs so external readers like Obsidian
// can resolve the images. External URLs are left untouched.
export function rewriteAssetUrls(
  markdown: string,
  assetBaseUrl?: string,
): string {
  if (!assetBaseUrl) {
    return markdown;
  }
  const base = assetBaseUrl.replace(/\/$/, "");
  return markdown.replace(/\]\(\/assets\//g, `](${base}/assets/`);
}

// Stable change-detection hash. Computed over fields available on the item row
// plus the comment count so the value is identical whether produced by the
// index endpoint (which does not render the full document) or the per-article
// endpoint. content_updated_at already moves on any body/comment change.
export function computeContentHash(input: {
  contentMarkdown: string | null;
  contentUpdatedAt: string;
  commentCount: number;
}): string {
  return createHash("sha256")
    .update(
      `${input.contentUpdatedAt}\n${input.commentCount}\n${input.contentMarkdown ?? ""}`,
    )
    .digest("hex");
}

export function slugify(id: number, title: string | null): string {
  const base = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base ? `${id}-${base}` : `${id}`;
}

export function renderArticleDocument(
  article: ExportArticle,
  options: RenderOptions = {},
): string {
  const includeComments = options.comments ?? true;
  const rawBody = article.contentMarkdown ?? article.contentText ?? "";
  const body = rewriteAssetUrls(rawBody, options.assetBaseUrl).trim();

  const sections: string[] = [renderFrontmatter(article.frontmatter)];
  if (article.title) {
    sections.push(`# ${article.title}`);
  }
  if (body) {
    sections.push(body);
  }
  if (includeComments) {
    const commentsSection = renderComments(article.comments, {
      maxComments: options.maxComments,
    });
    if (commentsSection) {
      sections.push(commentsSection);
    }
  }

  return `${sections.join("\n\n")}\n`;
}
