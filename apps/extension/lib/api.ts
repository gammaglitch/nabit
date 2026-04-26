const DEFAULT_API_URL = "http://localhost:3001";

async function getApiUrl(): Promise<string> {
  const result = await storage.getItem<string>("local:apiUrl");
  return result ?? DEFAULT_API_URL;
}

export async function setApiUrl(url: string): Promise<void> {
  await storage.setItem("local:apiUrl", url);
}

interface IngestItem {
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

interface BatchResult {
  results: EnqueueResult[];
}

export async function ingestBatch(items: IngestItem[]): Promise<BatchResult> {
  const apiUrl = await getApiUrl();

  const response = await fetch(`${apiUrl}/ingest/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });

  if (!response.ok) {
    throw new Error(`Ingest failed: ${response.status}`);
  }

  return response.json();
}

export async function ingestTabs(
  tabs: chrome.tabs.Tab[],
): Promise<BatchResult> {
  const items: IngestItem[] = tabs
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

  return ingestBatch(items);
}

export async function ingestBookmarks(
  bookmarks: chrome.bookmarks.BookmarkTreeNode[],
): Promise<BatchResult> {
  const items: IngestItem[] = bookmarks
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

  return ingestBatch(items);
}
