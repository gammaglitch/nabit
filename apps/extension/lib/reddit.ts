/**
 * Reddit thread capture.
 *
 * The API's `reddit` ingestor can fetch `.json` itself, but reddit 403s
 * unauthenticated requests from datacenter ranges, which is what the Gluetun
 * egress overlay works around. Fetching from the user's own browser sidesteps
 * that entirely: residential IP, and the user's session if the browser attaches
 * cookies. We send the response through verbatim so the stored snapshot is
 * byte-identical to a server-side capture.
 */

/** `/r/<sub>/comments/<id>` plus an optional slug; anything deeper is a comment permalink. */
const THREAD_PATH = /^\/r\/([^/]+)\/comments\/([^/]+)(?:\/([^/]+))?/;

export interface RedditThread {
  postId: string;
  subreddit: string;
  /** Canonical thread URL — comment permalink suffix and query string removed. */
  url: string;
}

/**
 * Returns the thread a URL points at, or null if it is not a reddit thread.
 *
 * A comment permalink is deliberately truncated back to the thread root:
 * requesting `.json` on a permalink returns only that subtree, so archiving it
 * as-is would silently capture a fragment of the discussion.
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

  if (!/(^|\.)reddit\.com$/.test(url.hostname)) {
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
 * Keep in sync with `buildRedditJsonUrl` in `packages/ingestors/src/ingestors.ts`.
 * `raw_json=1` stops reddit HTML-escaping `&<>` in post and comment bodies;
 * `limit=500` widens the comment page beyond the default handful.
 */
export function buildThreadJsonUrl(threadUrl: string): string {
  const jsonUrl = new URL(threadUrl);
  jsonUrl.pathname = `${jsonUrl.pathname.replace(/\/+$/, "")}.json`;
  jsonUrl.search = "";
  jsonUrl.searchParams.set("limit", "500");
  jsonUrl.searchParams.set("raw_json", "1");
  return jsonUrl.toString();
}

/**
 * Fetches the thread listing. Requires `host_permissions` for reddit.com so the
 * extension origin is allowed to read the response.
 *
 * `User-Agent` is deliberately not set — it is a forbidden header for `fetch`,
 * and the browser's own value is exactly what we want reddit to see anyway.
 */
export async function fetchRedditThread(threadUrl: string): Promise<unknown[]> {
  const response = await fetch(buildThreadJsonUrl(threadUrl), {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Reddit responded ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // A 200 that isn't JSON means an interstitial (gated / quarantined sub, or
    // a block page) rather than the listing we asked for.
    throw new Error("Reddit returned a non-JSON response");
  }

  // The listing pair is [post, comments]. The API re-validates this, but
  // failing here keeps a junk capture out of the ingest queue entirely.
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error("Reddit returned an unexpected response shape");
  }

  return payload;
}
