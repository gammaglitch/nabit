/**
 * Reading a user's Hacker News favorites.
 *
 * There is no API for favorites — Algolia indexes items, not one user's
 * favorites list — so this scrapes `favorites?id=<user>`. Three things about
 * that page shape the code below:
 *
 * 1. It is **public**. Anyone's favorites render without a session, so we can
 *    fetch with `credentials: "omit"` and never touch the user's HN cookie.
 * 2. Pagination is a **cursor**, not a page number. The "More" link carries
 *    `next`/`n`/`time` params derived from the last row, so the only way
 *    forward is to follow that href verbatim.
 * 3. Parsing is string-based on purpose. An MV3 background service worker has
 *    no `DOMParser`, and this runs in the background so a closing popup can't
 *    kill a multi-page walk halfway.
 *
 * `test/hn-favorites.test.ts` pins the markup this expects. When HN changes
 * its HTML, that is the file that should fail first.
 */

export const HN_ORIGIN = "https://news.ycombinator.com";

/** Origin pattern for `permissions.request()`. */
export const HN_HOST_PERMISSION = `${HN_ORIGIN}/*`;

/** HN's entire response body for an unknown username. */
const NO_SUCH_USER = "No such user.";

/** ~30 rows a page, so this caps a walk at roughly 3000 favorites. */
const DEFAULT_MAX_PAGES = 100;

/** Courtesy gap between page fetches. HN throttles eager clients. */
const DEFAULT_PAGE_DELAY_MS = 500;

const COMMENT_SNIPPET_LENGTH = 160;

export type HnFavoriteKind = "submission" | "comment";

export interface HnFavorite {
  /** HN item id — the favorite's identity, and what `url` is built from. */
  id: string;
  kind: HnFavoriteKind;
  /**
   * The thread URL, which is what gets ingested. The API's `hacker_news`
   * ingestor pulls the whole thread from Algolia and separately ingests the
   * submission's outbound link as a child item, so sending the thread gets
   * the linked article too — sending the article instead would lose the
   * discussion and break that parent/child link.
   */
  url: string;
  /** Submission title, or the opening words of a favorited comment. */
  title: string;
  /** Submitter, or comment author. */
  by: string | null;
  /** ISO 8601 from the row's `age` tooltip, when HN provides one. */
  createdAt: string | null;
  /**
   * Display-only orientation: a submission's outbound link, or the title of
   * the story a favorited comment sits under. Null for self-posts.
   */
  context: string | null;
}

export interface HnFavoritesPage {
  favorites: HnFavorite[];
  /** Absolute URL from the "More" link, or null on the last page. */
  nextUrl: string | null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

/**
 * HN escapes aggressively (`&#x27;` for apostrophes, `&#x2F;` for slashes in
 * comment text), and without a DOM we have to undo it ourselves.
 */
export function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, body: string) => {
      if (!body.startsWith("#")) {
        return NAMED_ENTITIES[body.toLowerCase()] ?? match;
      }

      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);

      // Lone surrogates and out-of-range code points would throw.
      if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) {
        return match;
      }

      return String.fromCodePoint(code);
    },
  );
}

function toText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, limit: number): string {
  return value.length > limit
    ? `${value.slice(0, limit - 1).trimEnd()}…`
    : value;
}

function firstMatch(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html);
  return match?.[1] ?? null;
}

/**
 * The `age` tooltip is an ISO timestamp, though HN has at times appended a
 * unix epoch to it (`"2025-01-07T16:22:09 1736266929"`). Take the first token
 * and keep it only if it parses.
 */
function parseAge(row: string): string | null {
  const raw = firstMatch(row, /<span[^>]*\bclass="age"[^>]*\btitle="([^"]+)"/i);
  const iso = raw?.trim().split(/\s+/)[0];
  return iso && !Number.isNaN(Date.parse(iso)) ? iso : null;
}

function itemUrl(id: string): string {
  return `${HN_ORIGIN}/item?id=${id}`;
}

export function favoritesUrl(username: string, kind: HnFavoriteKind): string {
  const url = new URL("/favorites", HN_ORIGIN);
  url.searchParams.set("id", username);
  if (kind === "comment") {
    url.searchParams.set("comments", "t");
  }
  return url.toString();
}

/**
 * Splits the page into one chunk per favorite. A chunk runs from its `athing`
 * row to the start of the next one, which keeps the pieces HN puts in sibling
 * rows — a submission's subtext, a comment's body — with the row they belong
 * to. The trailing chunk picks up the page footer and is discarded by
 * `parseRow` for matching neither shape.
 */
function splitRows(html: string): Array<{ id: string; body: string }> {
  const rowTag = /<tr\b[^>]*\bclass="athing[^"]*"[^>]*>/gi;
  const starts: Array<{ id: string; index: number }> = [];

  let match = rowTag.exec(html);
  while (match !== null) {
    const id = firstMatch(match[0], /\bid="(\d+)"/i);
    if (id) {
      starts.push({ id, index: match.index });
    }
    match = rowTag.exec(html);
  }

  return starts.map((start, position) => ({
    body: html.slice(start.index, starts[position + 1]?.index ?? html.length),
    id: start.id,
  }));
}

/**
 * Classifies by what the row actually contains rather than by which page it
 * came from: a submission has a `titleline`, a comment has `commtext`. That
 * survives HN's periodic reshuffling of the `athing` class list.
 */
function parseRow(id: string, row: string): HnFavorite | null {
  const by = firstMatch(
    row,
    /<a[^>]*href="user\?id=([^"&]+)"[^>]*class="hnuser"/i,
  );
  const createdAt = parseAge(row);

  const titleLink =
    /<span[^>]*\bclass="titleline"[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(
      row,
    );

  if (titleLink) {
    const href = decodeEntities(titleLink[1]);
    return {
      by: by ? decodeEntities(by) : null,
      // Self-posts ("Ask HN:") point back at the item itself with a relative
      // href; only an absolute one is an outbound article.
      context: /^https?:\/\//i.test(href) ? href : null,
      createdAt,
      id,
      kind: "submission",
      title: toText(titleLink[2]) || itemUrl(id),
      url: itemUrl(id),
    };
  }

  const commentHtml = firstMatch(
    row,
    /<div[^>]*\bclass="commtext[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  );
  if (commentHtml === null) {
    return null;
  }

  // `onstory` names the thread the comment lives in. The anchor text is
  // truncated with an ellipsis, so prefer its `title` attribute.
  const onStory =
    /<span[^>]*\bclass="onstory"[^>]*>[\s\S]*?<a[^>]*href="item\?id=\d+"[^>]*?(?:\stitle="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/i.exec(
      row,
    );
  const storyTitle = onStory
    ? decodeEntities(onStory[1] ?? "") || toText(onStory[2])
    : "";
  const text = toText(commentHtml);

  return {
    by: by ? decodeEntities(by) : null,
    context: storyTitle || null,
    createdAt,
    id,
    kind: "comment",
    title: text ? truncate(text, COMMENT_SNIPPET_LENGTH) : `Comment ${id}`,
    url: itemUrl(id),
  };
}

/**
 * Pulls the "More" cursor. HN writes this anchor with single-quoted attributes
 * and `&amp;`-escaped params, and the page header holds other `favorites?…`
 * links, so match the anchor by its class and decode the href.
 */
function parseNextUrl(html: string): string | null {
  const anchor = /<a\b[^>]*\bclass=['"]morelink['"][^>]*>/i.exec(html)?.[0];
  const href = anchor ? firstMatch(anchor, /\bhref=['"]([^'"]+)['"]/i) : null;
  if (!href) {
    return null;
  }

  try {
    const next = new URL(decodeEntities(href), `${HN_ORIGIN}/`);
    return next.origin === HN_ORIGIN ? next.toString() : null;
  } catch {
    return null;
  }
}

export function parseFavoritesPage(html: string): HnFavoritesPage {
  const favorites: HnFavorite[] = [];

  for (const row of splitRows(html)) {
    const favorite = parseRow(row.id, row.body);
    if (favorite) {
      favorites.push(favorite);
    }
  }

  return { favorites, nextUrl: parseNextUrl(html) };
}

/** Thrown when HN says the username doesn't exist, so the UI can say so. */
export class UnknownHnUserError extends Error {
  constructor(username: string) {
    super(`No Hacker News user named "${username}"`);
    this.name = "UnknownHnUserError";
  }
}

/** Fetches one page's HTML. Injected in tests; throws on an HTTP error. */
export type HnPageFetcher = (url: string) => Promise<string>;

async function fetchPage(url: string): Promise<string> {
  // Favorites are public, so there is no reason to attach the user's HN
  // session cookie to this request.
  const response = await fetch(url, { credentials: "omit" });

  if (!response.ok) {
    throw new Error(`Hacker News returned ${response.status}`);
  }

  return response.text();
}

export interface FetchFavoritesOptions {
  username: string;
  kind: HnFavoriteKind;
  fetchPage?: HnPageFetcher;
  maxPages?: number;
  pageDelayMs?: number;
  onProgress?: (progress: { pages: number; favorites: number }) => void;
}

/**
 * Walks every page of one favorites list, following the "More" cursor.
 *
 * Returns an empty list for a user with no favorites — only an unknown
 * username is an error. The walk stops on a repeated cursor or a page that
 * adds nothing new, so a cursor that stalls can't spin forever.
 */
export async function fetchAllFavorites(
  options: FetchFavoritesOptions,
): Promise<HnFavorite[]> {
  const username = options.username.trim();
  if (!username) {
    throw new Error("Enter a Hacker News username");
  }

  const getPage = options.fetchPage ?? fetchPage;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const pageDelayMs = options.pageDelayMs ?? DEFAULT_PAGE_DELAY_MS;

  const favorites: HnFavorite[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();

  let nextUrl: string | null = favoritesUrl(username, options.kind);
  let pages = 0;

  while (nextUrl !== null && pages < maxPages) {
    if (seenUrls.has(nextUrl)) {
      break;
    }
    seenUrls.add(nextUrl);

    if (pages > 0 && pageDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pageDelayMs));
    }

    const html = await getPage(nextUrl);
    if (html.trim().startsWith(NO_SUCH_USER)) {
      throw new UnknownHnUserError(username);
    }

    const page = parseFavoritesPage(html);
    let added = 0;

    for (const favorite of page.favorites) {
      if (seenIds.has(favorite.id)) {
        continue;
      }
      seenIds.add(favorite.id);
      favorites.push(favorite);
      added += 1;
    }

    pages += 1;
    options.onProgress?.({ favorites: favorites.length, pages });

    nextUrl = added > 0 ? page.nextUrl : null;
  }

  return favorites;
}
