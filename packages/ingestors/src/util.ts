import TurndownService from "turndown";

const turndown = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  headingStyle: "atx",
  linkStyle: "inlined",
});

export function htmlToMarkdown(html: string | null | undefined) {
  if (!html) {
    return null;
  }
  const converted = turndown.turndown(html).trim();
  return converted.length > 0 ? converted : null;
}

/**
 * Browser-safe HTML tag stripper. Replaces HTML tags with spaces,
 * collapses whitespace, and trims. Use this instead of JSDOM.fragment()
 * when running outside Node (e.g. in a Chrome extension).
 */
export function stripHtmlTags(html: string | null | undefined) {
  if (!html) {
    return null;
  }

  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n /g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text.length > 0 ? text : null;
}

export function normalizeIsoDate(
  value: Date | number | string | null | undefined,
) {
  if (value == null) {
    return null;
  }

  const date =
    typeof value === "number"
      ? new Date(value)
      : value instanceof Date
        ? value
        : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function fetchText(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status}`);
  }

  return {
    contentType: response.headers.get("content-type") ?? "text/plain",
    text: await response.text(),
    url: response.url || url,
  };
}

export function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

export function countWords(text: string | null | undefined) {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

const PATH_SEGMENT_WIDTH = 4;

function padPathSegment(index: number) {
  return String(index).padStart(PATH_SEGMENT_WIDTH, "0");
}

export function makePath(parentPath: string | null, index: number) {
  const segment = `n${padPathSegment(index)}`;
  return parentPath ? `${parentPath}.${segment}` : segment;
}
