import { Readability } from "@mozilla/readability";
import {
  INGESTORS as BROWSER_INGESTORS,
  type ExtractionStatus,
  fetchText,
  getIngestor as getIngestorByName,
  htmlToMarkdown,
  type Ingestor,
  type IngestorName,
  normalizeSourceUrl,
  type SnapshotArtifact,
} from "@repo/ingestors";
import { JSDOM } from "jsdom";
import type { AppEnv } from "../../lib/config/env";
import { countWords, firstString, normalizeIsoDate } from "./ingestor-util";

// Re-export everything consumers need
export {
  type ExtractedComment,
  type ExtractionAttempt,
  type ExtractionStatus,
  type Ingestor,
  type IngestorName,
  type ItemIdentity,
  normalizeSourceUrl,
  type SnapshotArtifact,
} from "@repo/ingestors";

const EXTRACTOR_VERSION = "0.1.0";
const ARTICLE_MIN_WORDS = 20;
const ARTICLE_PARTIAL_WORDS = 100;

function findPublishedAt(document: Document) {
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[name="article:published_time"]',
    'meta[property="og:published_time"]',
    'meta[name="date"]',
    'meta[name="pubdate"]',
    "time[datetime]",
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!element) {
      continue;
    }

    const value =
      element.getAttribute("content") ?? element.getAttribute("datetime");
    const normalized = normalizeIsoDate(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function needsBrowserCapture(html: string) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped.length < 200) {
    return true;
  }

  return /id="__next"|id="root"|data-reactroot|window\.__INITIAL_STATE__/i.test(
    html,
  );
}

async function captureRenderedHtml(url: string, env: AppEnv) {
  const captureUrl = env.headlessBrowser.captureUrl;
  if (!captureUrl) {
    return null;
  }

  const response = await fetch(captureUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      modes: ["html"],
      url,
    }),
  });

  if (!response.ok) {
    throw new Error(`Browser capture failed for ${url}: ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, any>;
  const html = firstString(
    payload.html,
    payload.body,
    payload.artifacts?.find?.(
      (artifact: Record<string, any>) =>
        artifact?.mode === "html" || artifact?.contentType === "text/html",
    )?.body,
    payload.artifacts?.find?.(
      (artifact: Record<string, any>) =>
        artifact?.mode === "html" || artifact?.contentType === "text/html",
    )?.content,
  );

  if (!html) {
    return null;
  }

  return {
    body: html,
    contentType: "text/html",
  } satisfies SnapshotArtifact;
}

type GenericCaptureInput = {
  env: AppEnv;
  payload?: unknown;
  url: string;
};

// Hard cap on links carried out of one page. A crawl is bounded by maxPages
// anyway, so the only thing an unbounded list would buy is a pathological
// link-farm page holding tens of thousands of strings in memory.
const MAX_OUTBOUND_LINKS = 2000;

/**
 * Collect every link on the page, in document order.
 *
 * Deliberately reads the *whole* document rather than Readability's output.
 * Readability's job is to throw away nav, sidebars and link lists — which on a
 * table-of-contents page is the entire point of the page. Harvesting from the
 * parsed article would return nothing for exactly the pages a crawl exists to
 * walk.
 *
 * Uses `anchor.href` rather than resolving getAttribute("href") by hand so
 * that a document's own `<base href>` is honoured.
 *
 * Fragments are dropped before deduplicating. They address a position on the
 * page, not another page, so `#install` and `#config` are one URL to a crawl —
 * and counting them separately would let a long reference page's own
 * in-page contents list fill the cap and crowd out its real links, on exactly
 * the kind of index page this exists to walk.
 */
function harvestOutboundLinks(document: Document): string[] {
  const seen = new Set<string>();
  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = (anchor as HTMLAnchorElement).href?.trim();
    if (!href) continue;

    let deduped = href;
    try {
      const url = new URL(href);
      url.hash = "";
      deduped = url.toString();
    } catch {
      // Not a URL the platform can parse (`javascript:` and friends). Keep it
      // as-is; the crawl's own classifier rejects it by protocol.
    }

    seen.add(deduped);
    if (seen.size >= MAX_OUTBOUND_LINKS) break;
  }
  return [...seen];
}

const genericIngestor = {
  name: "generic" as const,
  matches() {
    return true;
  },
  async capture({ env, url }: GenericCaptureInput) {
    const response = await fetchText(url, {
      headers: {
        "User-Agent": "nabit/0.1",
      },
      redirect: "follow",
    });

    const snapshots: SnapshotArtifact[] = [
      {
        body: response.text,
        contentType: response.contentType,
      },
    ];

    if (env.headlessBrowser.enabled && needsBrowserCapture(response.text)) {
      const rendered = await captureRenderedHtml(response.url || url, env);
      if (rendered && rendered.body !== response.text) {
        snapshots.push(rendered);
      }
    }

    return {
      normalizedUrl: normalizeSourceUrl(response.url || url),
      snapshots,
    };
  },
  identify({ url }: { url: string }) {
    return {
      externalId: url,
      sourceType: "webpage",
      sourceUrl: url,
    };
  },
  async extract({
    snapshot,
    url,
  }: {
    snapshot: SnapshotArtifact;
    url: string;
  }) {
    if (!/^(text\/html|application\/xhtml\+xml)/i.test(snapshot.contentType)) {
      return {
        errorMessage: `Unsupported content type for article extraction: ${snapshot.contentType}`,
        extractor: "readability",
        extractorVersion: EXTRACTOR_VERSION,
        metadata: { contentType: snapshot.contentType },
        sourceType: "webpage",
        sourceUrl: url,
        status: "failed" as ExtractionStatus,
      };
    }

    const dom = new JSDOM(snapshot.body, { url });
    const document = dom.window.document;
    // Harvested before Readability runs, and carried on the failure paths
    // below too: a table-of-contents page has no prose to extract and is
    // precisely the page a crawl needs the links from.
    const outboundLinks = harvestOutboundLinks(document);
    const parsed = new Readability(document).parse();

    if (!parsed?.textContent?.trim()) {
      return {
        errorMessage: "Readability could not extract article content",
        extractor: "readability",
        extractorVersion: EXTRACTOR_VERSION,
        metadata: { contentType: snapshot.contentType },
        outboundLinks,
        sourceType: "webpage",
        sourceUrl: url,
        status: "failed" as ExtractionStatus,
      };
    }

    const contentText = parsed.textContent.trim();
    const contentMarkdown = htmlToMarkdown(parsed.content);
    const wordCount = countWords(contentText);
    const author = firstString(
      parsed.byline,
      document.querySelector('meta[name="author"]')?.getAttribute("content"),
    );
    const title = firstString(parsed.title, document.title);
    const sourceCreatedAt = findPublishedAt(document);

    if (wordCount < ARTICLE_MIN_WORDS) {
      return {
        errorMessage: `Extracted content is too short to be an article (${wordCount} words)`,
        extractor: "readability",
        extractorVersion: EXTRACTOR_VERSION,
        metadata: {
          contentType: snapshot.contentType,
          wordCount,
        },
        outboundLinks,
        sourceType: "webpage",
        sourceUrl: url,
        status: "failed" as ExtractionStatus,
        title,
      };
    }

    const status: ExtractionStatus =
      wordCount >= ARTICLE_PARTIAL_WORDS ? "success" : "partial";

    return {
      author,
      contentMarkdown,
      contentText,
      extractor: "readability",
      extractorVersion: EXTRACTOR_VERSION,
      metadata: {
        contentType: snapshot.contentType,
        excerpt: firstString(parsed.excerpt),
        language: firstString(document.documentElement.lang),
        siteName: firstString(parsed.siteName),
        wordCount,
      },
      outboundLinks,
      sourceCreatedAt,
      sourceType: "article",
      sourceUrl: url,
      status,
      title,
    };
  },
};

/**
 * All ingestors: browser-safe ones from @repo/ingestors plus the
 * Node-only generic ingestor defined here.
 */
const ALL_INGESTORS: Ingestor[] = [
  ...BROWSER_INGESTORS,
  genericIngestor as unknown as Ingestor,
];

export function resolveIngestorName(url: string, forced?: IngestorName | null) {
  if (forced) {
    return forced;
  }

  const normalized = new URL(url);
  const match = ALL_INGESTORS.find((ingestor) => ingestor.matches(normalized));
  return match?.name ?? "generic";
}

export function getIngestor(name: IngestorName): Ingestor {
  if (name === "generic") {
    return genericIngestor as unknown as Ingestor;
  }
  return getIngestorByName(name);
}
