"use client";

import { useCallback, useMemo } from "react";
import {
  type ArchivedPageRef,
  buildArchiveIndex,
  resolveArchivedPage,
} from "../utils/archive-links";

/**
 * Which surface the caller is rendering on, and so which URL a matched link
 * should carry.
 *
 * Both exist because a crawled page is readable in two places and following a
 * link should keep you where you are: in the reader you keep the chat rail and
 * the item's own actions, in the site browser you keep the reading pane. What
 * must *not* differ is which links match at all — that is decided once, in
 * archive-links.ts, and this hook only spells the hit as a URL.
 */
export type ArchiveLinkTarget = "reader" | "site";

type Options = {
  /** Null on the reader until the crawl summary has loaded. */
  crawlId: number | null;
  /** Every page of the crawl, as `crawl.get` returns them. */
  pages: readonly ArchivedPageRef[];
  /**
   * The URL of the page being rendered — the base relative hrefs resolve
   * against, and the page a self-link is recognised by. Null while loading.
   */
  currentUrl: string | null;
  target: ArchiveLinkTarget;
};

/**
 * Maps an href out of archived prose to an in-app URL, or null to leave the
 * link pointing at the live web. Feed the result to `MarkdownArticle`'s
 * `resolveInternalHref`.
 */
export function useArchiveLinks({
  crawlId,
  currentUrl,
  pages,
  target,
}: Options): (href: string | undefined) => string | null {
  const index = useMemo(() => buildArchiveIndex(pages), [pages]);

  return useCallback(
    (href: string | undefined) => {
      if (!currentUrl) return null;
      const hit = resolveArchivedPage(index, href, currentUrl);
      if (!hit) return null;
      if (target === "reader") return `/read/${hit.itemId}`;
      // The site browser addresses a page by its crawl row, and cannot build
      // that URL without knowing which crawl it is showing.
      return crawlId === null ? null : `/sites/${crawlId}?page=${hit.pageId}`;
    },
    [crawlId, currentUrl, index, target],
  );
}
