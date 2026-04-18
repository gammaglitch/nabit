export type NormalizedSource = "article" | "hn" | "reddit" | "x";

export function normalizeSource(sourceType: string): NormalizedSource {
  if (sourceType.startsWith("hacker_news")) return "hn";
  if (sourceType.startsWith("reddit")) return "reddit";
  if (sourceType === "tweet" || sourceType.startsWith("twitter"))
    return "x";
  return "article";
}

export function sourceLabel(source: NormalizedSource): string {
  return { article: "ART", hn: "HN", reddit: "RDT", x: "X" }[source];
}

export function sourceColor(source: NormalizedSource): string {
  return {
    article: "var(--src-art)",
    hn: "var(--src-hn)",
    reddit: "var(--src-rd)",
    x: "var(--src-x)",
  }[source];
}

export function sourceDescription(source: NormalizedSource): string {
  return {
    article: "Articles",
    hn: "Hacker News",
    reddit: "Reddit",
    x: "X / Twitter",
  }[source];
}

export function hostname(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

export function subredditFromMetadata(
  metadata: Record<string, unknown>,
): string | null {
  const sub = metadata.subreddit;
  return typeof sub === "string" ? `r/${sub}` : null;
}

export function scoreFromMetadata(
  metadata: Record<string, unknown>,
  source: NormalizedSource,
): number | null {
  if (source === "hn" && typeof metadata.points === "number") {
    return metadata.points;
  }
  if (source === "reddit" && typeof metadata.score === "number") {
    return metadata.score;
  }
  if (source === "x" && typeof metadata.favorite_count === "number") {
    return metadata.favorite_count;
  }
  return null;
}

export function timeAgo(iso: string | number | null): string {
  if (iso === null) return "";
  const ts = typeof iso === "string" ? new Date(iso).getTime() : iso;
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400 / 7)}w`;
  return `${Math.floor(diff / 86400 / 30)}mo`;
}
