import { Readability } from "@mozilla/readability";
import {
  INGESTORS as BROWSER_INGESTORS,
  type ExtractionStatus,
  fetchText,
  getIngestor as getIngestorByName,
  type Ingestor,
  type IngestorName,
  normalizeSourceUrl,
  type SnapshotArtifact,
} from "@repo/ingestors";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
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

const turndown = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  headingStyle: "atx",
  linkStyle: "inlined",
});

function htmlToMarkdown(html: string | null | undefined) {
  if (!html) {
    return null;
  }
  const converted = turndown.turndown(html).trim();
  return converted.length > 0 ? converted : null;
}

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
    const parsed = new Readability(document).parse();

    if (!parsed?.textContent?.trim()) {
      return {
        errorMessage: "Readability could not extract article content",
        extractor: "readability",
        extractorVersion: EXTRACTOR_VERSION,
        metadata: { contentType: snapshot.contentType },
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
