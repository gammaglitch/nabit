/**
 * Reddit thread capture.
 *
 * Reddit answers `.json` with its "You've been blocked by network security"
 * page for every unauthenticated client — a residential IP gets the same 403 as
 * the ingest worker's egress, so the Gluetun overlay does not help and neither
 * would rotating exits. What still works is the user's own logged-in session,
 * which is what this module borrows.
 *
 * The fetch runs **in the thread's tab**, not in this worker. A fetch issued
 * from the background is cross-site relative to reddit.com, so `SameSite=Lax`
 * session cookies — reddit's included — are withheld and we would get the block
 * page back while the same URL works in the address bar. Injected into the tab
 * it is a same-origin request from reddit.com itself, carrying exactly the
 * cookies and challenge clearance the user's normal browsing has.
 *
 * The response body is forwarded to the API verbatim. The API owns parsing (see
 * `redditIngestor` in `@repo/ingestors`) so that the stored snapshot is the raw
 * artifact and `reextract` can replay a better extractor over it later. These
 * bytes pass through the browser once and can never be re-fetched server-side,
 * so fidelity here is not a nicety.
 */

/**
 * Origin pattern for `permissions.request()`.
 *
 * `*.reddit.com` also matches the bare apex, so this covers `reddit.com`,
 * `www.` and `old.`. The scheme is spelled out rather than wildcarded because a
 * requested pattern has to be covered by `optional_host_permissions`, and that
 * declares the http and https wildcards as two separate patterns — reddit is
 * HSTS-only anyway, so https is the only one that matters.
 */
export const REDDIT_HOST_PERMISSION = "https://*.reddit.com/*";

/** `/r/<sub>/comments/<id>` plus an optional slug; anything deeper is a permalink. */
const THREAD_PATH = /^\/r\/([^/]+)\/comments\/([^/]+)(?:\/([^/]+))?/;

export interface RedditThread {
  postId: string;
  subreddit: string;
  /** Canonical thread URL — permalink suffix and query string removed. */
  url: string;
}

/**
 * Returns the thread a URL points at, or null when it is not a reddit thread.
 *
 * A comment permalink is deliberately truncated back to the thread root:
 * requesting `.json` on a permalink returns only that comment's subtree, so
 * archiving it as-is would silently capture a fragment of the discussion and
 * look like a complete one.
 */
export function parseRedditThreadUrl(
  rawUrl: string | undefined | null,
): RedditThread | null {
  if (!rawUrl) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!/(^|\.)reddit\.com$/i.test(url.hostname)) {
    return null;
  }

  const match = url.pathname.match(THREAD_PATH);
  if (!match) {
    return null;
  }

  return {
    postId: match[2],
    subreddit: match[1],
    url: `${url.origin}${match[0]}`,
  };
}

/**
 * Keep in sync with `buildRedditJsonUrl()` in
 * `packages/ingestors/src/ingestors.ts` — a client capture and a server capture
 * are only interchangeable if both ask reddit for the same representation.
 */
export function buildThreadJsonUrl(threadUrl: string): string {
  const jsonUrl = new URL(threadUrl);
  jsonUrl.pathname = `${jsonUrl.pathname.replace(/\/+$/, "")}.json`;
  jsonUrl.search = "";
  jsonUrl.searchParams.set("limit", "500");
  jsonUrl.searchParams.set("raw_json", "1");
  return jsonUrl.toString();
}

interface TabFetchResult {
  ok: boolean;
  status: number;
  contentType: string;
  text: string;
}

/**
 * Runs in the page, so it has to be self-contained — it is serialized and
 * injected, and closes over nothing from this module.
 */
async function fetchInPage(url: string): Promise<TabFetchResult> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  return {
    contentType: response.headers.get("content-type") ?? "",
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
}

/**
 * Rejects anything that is not the listing pair for `postId`.
 *
 * Worth doing client-side even though the API re-validates: a stale session
 * makes reddit answer **200 with an HTML login page**, observed on
 * `old.reddit.com`. Caught here the user gets told to reload the thread; passed
 * on, the archive gains an item that looks captured and holds a login form.
 */
function assertThreadListing(
  text: string,
  contentType: string,
  postId: string,
) {
  if (contentType && !/\bjson\b/i.test(contentType)) {
    throw new Error(
      "Reddit returned a page instead of JSON — reload the thread and retry",
    );
  }

  let listing: unknown;
  try {
    listing = JSON.parse(text);
  } catch {
    throw new Error(
      "Reddit returned a non-JSON response — your session may have expired",
    );
  }

  if (!Array.isArray(listing) || listing.length === 0) {
    throw new Error("Reddit returned an unexpected response shape");
  }

  const [first] = listing as {
    data?: { children?: { data?: { id?: unknown; name?: unknown } }[] };
  }[];
  const post = first?.data?.children?.[0]?.data;
  const id: unknown = post?.id ?? post?.name;
  if (typeof id !== "string" || !id) {
    throw new Error("Reddit response contained no post listing");
  }

  const captured = id.replace(/^t3_/, "").toLowerCase();
  if (captured !== postId.toLowerCase()) {
    throw new Error(
      `Reddit returned post ${captured} but the tab is post ${postId}`,
    );
  }
}

/**
 * Fetches a thread's listing from inside `tabId` and returns the raw body.
 *
 * Requires host permission for reddit.com; request it with
 * `REDDIT_HOST_PERMISSION` from a user gesture before calling.
 */
export async function fetchThreadJsonFromTab(
  tabId: number,
  thread: RedditThread,
): Promise<string> {
  let results: { result?: TabFetchResult | null }[];
  try {
    results = await browser.scripting.executeScript({
      args: [buildThreadJsonUrl(thread.url)],
      func: fetchInPage,
      target: { tabId },
    });
  } catch (error) {
    // Injection itself failed: permission not granted, or the tab navigated to
    // somewhere scripts cannot run. Neither is the user's fault to decipher.
    throw new Error(
      `Could not read the thread from its tab (${
        error instanceof Error ? error.message : "unknown error"
      })`,
    );
  }

  const result = results[0]?.result;
  if (!result) {
    throw new Error("Could not read the thread from its tab (no response)");
  }

  if (!result.ok) {
    throw new Error(
      result.status === 403
        ? "Reddit refused the request (403) — are you logged in to reddit in this browser?"
        : `Reddit responded ${result.status}`,
    );
  }

  assertThreadListing(result.text, result.contentType, thread.postId);
  return result.text;
}
