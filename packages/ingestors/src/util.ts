import TurndownService from "turndown";

const turndown = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  headingStyle: "atx",
  linkStyle: "inlined",
});

const EMBED_TAGS: (keyof HTMLElementTagNameMap)[] = [
  "audio",
  "embed",
  "iframe",
  "object",
  "video",
];

const VIDEO_HOSTS = new Set([
  "dailymotion.com",
  "player.twitch.tv",
  "player.vimeo.com",
  "twitch.tv",
  "v.qq.com",
  "videopress.com",
  "vimeo.com",
  "youtu.be",
  "youtube-nocookie.com",
  "youtube.com",
]);

function embedSource(node: HTMLElement) {
  const direct =
    node.getAttribute("src") ?? node.getAttribute("data") ?? undefined;
  if (direct) {
    return direct;
  }

  return node.querySelector?.("source[src]")?.getAttribute("src") ?? null;
}

/**
 * Turn a player URL into something a reader can actually open. Embed URLs
 * work in an iframe but are unhelpful as plain links.
 */
function canonicalEmbedUrl(url: URL) {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id = url.pathname.match(/^\/embed\/([^/?#]+)/)?.[1];
    if (id) {
      return new URL(`https://www.youtube.com/watch?v=${id}`);
    }
  }

  if (host === "player.vimeo.com") {
    const id = url.pathname.match(/^\/video\/([^/?#]+)/)?.[1];
    if (id) {
      return new URL(`https://vimeo.com/${id}`);
    }
  }

  return url;
}

function embedLabel(node: HTMLElement, host: string) {
  const title = node.getAttribute("title")?.trim();
  if (title) {
    return title;
  }

  const tag = node.nodeName.toLowerCase();
  if (tag === "audio") {
    return `Audio (${host})`;
  }
  if (tag === "video" || VIDEO_HOSTS.has(host)) {
    return `Video (${host})`;
  }

  return `Embedded content (${host})`;
}

/**
 * Turndown has no rule for embed elements, and since they carry no text
 * children the default rule renders them as an empty string — silently
 * deleting every video from an archived article. Keep the destination as a
 * plain link instead so the reference survives the capture.
 */
turndown.addRule("embeds", {
  filter: EMBED_TAGS,
  replacement(_content, node) {
    const element = node as unknown as HTMLElement;
    const source = embedSource(element);
    if (!source) {
      return "";
    }

    // Only absolute sources: Readability rewrites relative URIs before we get
    // here, and Turndown's DOM has no usable base URI to resolve against.
    let url: URL;
    try {
      url = new URL(source);
    } catch {
      return "";
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    const canonical = canonicalEmbedUrl(url);
    const host = canonical.hostname.replace(/^www\./, "");
    return `\n\n[${embedLabel(element, host)}](${canonical.toString()})\n\n`;
  },
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
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
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
