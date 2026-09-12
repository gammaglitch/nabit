import type { AppRouter, inferRouterOutputs } from "@repo/trpc/types";
import {
  hostname,
  type NormalizedSource,
  normalizeSource,
  scoreFromMetadata,
  subredditFromMetadata,
} from "@/features/shared/utils/source";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type ItemSummary = RouterOutputs["ingest"]["list"]["items"][number];
export type ItemDetail = RouterOutputs["ingest"]["get"]["item"];

export type DisplayItem = {
  id: number;
  title: string;
  source: NormalizedSource;
  sourceUrl: string | null;
  domain: string;
  subreddit: string | null;
  score: number | null;
  author: string | null;
  excerpt: string;
  tags: Array<{ id: number; name: string }>;
  commentCount: number;
  savedAt: number;
  // Parsed once here rather than in the sort comparator, which would otherwise
  // re-parse the same strings on every comparison. Null covers both a source
  // that carried no date and one whose date does not parse — including a web
  // build talking to an API old enough to not send `contentUpdatedAt` yet,
  // which sinks those items in that one sort rather than scrambling it.
  updatedAt: number | null;
  publishedAt: number | null;
  sourceCreatedAt: string | null;
  contentText: string | null;
};

function parseDate(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function toDisplayItem(item: ItemSummary | ItemDetail): DisplayItem {
  const source = normalizeSource(item.sourceType);
  const domain = hostname(item.sourceUrl);
  const subreddit = subredditFromMetadata(item.metadata);
  const score = scoreFromMetadata(item.metadata, source);
  const body = item.contentText ?? item.contentMarkdown ?? "";
  const excerpt = body.replace(/\s+/g, " ").trim().slice(0, 220);

  return {
    id: item.id,
    title: item.title ?? item.sourceUrl ?? "Untitled",
    source,
    sourceUrl: item.sourceUrl,
    domain: subreddit ? `reddit.com/${subreddit}` : domain,
    subreddit,
    score,
    author: item.author,
    excerpt,
    tags: item.tags,
    commentCount: item.commentCount,
    savedAt: new Date(item.ingestedAt).getTime(),
    updatedAt: parseDate(item.contentUpdatedAt),
    publishedAt: parseDate(item.sourceCreatedAt),
    sourceCreatedAt: item.sourceCreatedAt,
    contentText: body || null,
  };
}

export function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, "ig");
  const parts = text.split(re);
  return parts.map((part, i) => {
    if (re.test(part)) {
      return (
        <mark
          // biome-ignore lint/suspicious/noArrayIndexKey: parts array is stable for this render
          key={i}
          style={{
            background: "var(--hl)",
            color: "#111",
            padding: "0 1px",
          }}
        >
          {part}
        </mark>
      );
    }
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts array is stable for this render
      <span key={i}>{part}</span>
    );
  });
}
