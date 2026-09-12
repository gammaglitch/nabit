import type { Browser } from "wxt/browser";
import { getApiToken, getApiUrl } from "./config";

export interface IngestItem {
  url: string;
  payload?: unknown;
  ingestor?: "tweet" | "reddit" | "hacker_news" | "generic";
}

interface IngestJob {
  id: number;
  status: "queued" | "processing" | "success" | "failed";
  url: string;
}

interface EnqueueResult {
  job: IngestJob;
  reused: boolean;
}

export interface BatchResult {
  results: EnqueueResult[];
}

/**
 * Posts a batch to the ingest API. Runs in the background worker — the popup
 * reaches it via `sendIngestMessage()` so a closing popup can't kill the
 * request mid-flight.
 */
export async function ingestBatch(items: IngestItem[]): Promise<BatchResult> {
  const apiUrl = await getApiUrl();
  const token = await getApiToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${apiUrl}/ingest/batch`, {
    body: JSON.stringify({ items }),
    headers,
    method: "POST",
  });

  if (response.status === 401) {
    throw new Error(
      token
        ? "Rejected (401) — the API token was not accepted"
        : "Rejected (401) — set an API token in config",
    );
  }

  if (!response.ok) {
    throw new Error(`Ingest failed: ${response.status}`);
  }

  return response.json();
}

/**
 * The API resolves an ingestor from the URL itself (`resolveIngestorName` in
 * `@repo/ingestors`), so we normally omit the field and let it choose — that's
 * what gets reddit and hacker_news threads their comment trees instead of a
 * flat Readability pass over the rendered page.
 *
 * X/Twitter is the one exception. Its `tweet` ingestor has no server-side
 * fetch path and throws unless the caller supplies the GraphQL payload, which
 * the popup can't produce from `tabs.query()` alone — that needs a content
 * script, the way `scripts/tampermonkey/x-bookmarks-exporter.user.js` does it.
 * Pin those to `generic` so the job degrades instead of failing outright.
 */
function ingestorFor(url: string): IngestItem["ingestor"] {
  try {
    const parsed = new URL(url);
    if (
      /^(x|twitter)\.com$/i.test(parsed.hostname) &&
      /\/status\/\d+/.test(parsed.pathname)
    ) {
      return "generic";
    }
  } catch {
    // Callers filter to http(s) before this runs; let the server judge anyway.
  }

  return undefined;
}

export function tabsToItems(tabs: Browser.tabs.Tab[]): IngestItem[] {
  return tabs
    .filter(
      (tab): tab is Browser.tabs.Tab & { id: number; url: string } =>
        typeof tab.id === "number" && typeof tab.url === "string",
    )
    .map((tab) => ({
      ingestor: ingestorFor(tab.url),
      payload: {
        faviconUrl: tab.favIconUrl,
        id: tab.id,
        title: tab.title,
        url: tab.url,
      },
      url: tab.url,
    }));
}

export function bookmarksToItems(
  bookmarks: Browser.bookmarks.BookmarkTreeNode[],
): IngestItem[] {
  return bookmarks
    .filter(
      (bm): bm is Browser.bookmarks.BookmarkTreeNode & { url: string } =>
        typeof bm.url === "string",
    )
    .map((bm) => ({
      ingestor: ingestorFor(bm.url),
      payload: {
        dateAdded: bm.dateAdded ?? null,
        id: bm.id,
        parentId: bm.parentId ?? null,
        title: bm.title ?? null,
        url: bm.url,
      },
      url: bm.url,
    }));
}
