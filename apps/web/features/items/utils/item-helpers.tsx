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
  sourceCreatedAt: string | null;
  contentText: string | null;
};

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
