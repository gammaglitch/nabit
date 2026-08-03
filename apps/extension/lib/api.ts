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

export function tabsToItems(tabs: chrome.tabs.Tab[]): IngestItem[] {
  return tabs
    .filter(
      (tab): tab is chrome.tabs.Tab & { id: number; url: string } =>
        typeof tab.id === "number" && typeof tab.url === "string",
    )
    .map((tab) => ({
      ingestor: "generic",
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
  bookmarks: chrome.bookmarks.BookmarkTreeNode[],
): IngestItem[] {
  return bookmarks
    .filter(
      (bm): bm is chrome.bookmarks.BookmarkTreeNode & { url: string } =>
        typeof bm.url === "string",
    )
    .map((bm) => ({
      ingestor: "generic",
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
