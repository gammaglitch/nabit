/**
 * Resolving a link inside archived prose to the archived copy of the page it
 * points at.
 *
 * nabit is deliberately not a mirror (see docs/features/crawl.md, "Why not
 * httrack"): stored markdown keeps the hrefs the page actually shipped, so the
 * archive stays a faithful record of what was published. Rewriting therefore
 * happens at render time, wherever a crawled page is displayed — the reader
 * and the site browser both — because "the pages this crawl archived" is a
 * question with an answer on either.
 *
 * Matching is done once, here; the two surfaces differ only in the URL they
 * build from a hit, and `useArchiveLinks` owns that. A reader that resolved
 * links differently from the site browser is the bug this shape exists to
 * prevent: the same link pointing at the live web on one screen and at the
 * archive on the other.
 *
 * Matching deliberately does *not* try to agree with `normalizeSourceUrl` in
 * @repo/ingestors. Both sides of every comparison — the stored page URL and the
 * href from the markdown — go through `canonicalize` below, so only internal
 * consistency matters, never parity with the server. That keeps this free of a
 * cross-package dependency whose drift would be silent, and the failure mode is
 * benign either way: a link that does not match is left exactly as it is today,
 * pointing at the live web.
 */

/**
 * A comparison key for a URL. Returns null for anything that cannot be a link
 * to an archived page: unparseable, or a non-web protocol like mailto:.
 *
 * Intentionally more aggressive than the server's normalizer — `www.` is
 * stripped, so a page linking to itself across that boundary still matches.
 * Query strings are kept as-is and never reordered: two archived pages that
 * differ only in parameter order are different rows, and collapsing them here
 * would point a link at the wrong copy.
 */
export function canonicalize(href: string, base?: string): string | null {
  let url: URL;
  try {
    url = base ? new URL(href, base) : new URL(href);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  url.hash = "";

  let host = url.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);

  const port =
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
      ? ""
      : url.port;

  // The scheme is left out of the key on purpose. A page served over https
  // that links to its own http:// URL is linking to itself, and treating those
  // as different would strand the link on the live web.
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");

  return `${host}${port ? `:${port}` : ""}${path}${url.search}`;
}

export type ArchivedPageRef = {
  id: number;
  itemId: number | null;
  status: string;
  url: string;
};

/**
 * What a matched link points at. Both ids travel together because the two
 * surfaces address the same page differently: the site browser by its crawl
 * page (`/sites/<id>?page=`), the reader by the item it archived into
 * (`/read/<itemId>`). Only pages that are `done` with an item are indexed, so
 * `itemId` is known to be present here.
 */
export type ArchivedTarget = { pageId: number; itemId: number };

/**
 * Index of canonical URL to archived page, for the pages this crawl can
 * actually display. A page still queued, failed or skipped has nothing to show,
 * so it is left out and links to it stay external rather than landing on a
 * blank pane.
 *
 * First occurrence wins. `crawl.get` returns rows parents-before-children, so
 * when two pages collapse to the same key the shallower one — the one nearer
 * the root, and the one a reader more likely means — is kept.
 */
export function buildArchiveIndex(
  pages: readonly ArchivedPageRef[],
): Map<string, ArchivedTarget> {
  const index = new Map<string, ArchivedTarget>();
  for (const page of pages) {
    if (page.status !== "done" || page.itemId === null) continue;
    const key = canonicalize(page.url);
    if (key && !index.has(key)) {
      index.set(key, { itemId: page.itemId, pageId: page.id });
    }
  }
  return index;
}

/**
 * The archived page an href points at, or null to leave the link alone.
 * `base` is the URL of the page being read, so relative hrefs resolve against
 * where they were found rather than against the app's own origin.
 */
export function resolveArchivedPage(
  index: ReadonlyMap<string, ArchivedTarget>,
  href: string | undefined,
  base: string,
): ArchivedTarget | null {
  if (!href) return null;
  const key = canonicalize(href, base);
  if (!key) return null;

  // A link to the page already on screen resolves to nowhere new. A bare
  // `#section` anchor is the common case: it resolves against `base` and then
  // loses its hash, landing on this page's own key. Claiming those as internal
  // links would swallow the click and navigate to the URL already in the bar,
  // so they are left alone for the browser to deal with.
  if (key === canonicalize(base)) return null;

  return index.get(key) ?? null;
}
