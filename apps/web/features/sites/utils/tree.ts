import type { AppRouter, inferRouterOutputs } from "@repo/trpc/types";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type CrawlPage = RouterOutputs["crawl"]["get"]["pages"][number];
export type Crawl = RouterOutputs["crawl"]["get"]["crawl"];

export type SiteTreeNode = CrawlPage & { children: SiteTreeNode[] };

/**
 * Rebuild the page tree from the flat rows the API returns.
 *
 * The tree follows *discovery* — who linked to whom — rather than URL nesting,
 * because that is the order the site's own author put the pages in. For a
 * table of contents, the tree is the table of contents.
 *
 * Rows arrive parents-before-children, so one pass is enough. A page whose
 * parent is missing is still shown, at the root, rather than dropped: losing a
 * page from the view would be worse than showing it in the wrong place.
 */
export function buildSiteTree(pages: CrawlPage[]): SiteTreeNode[] {
  const nodes = new Map<number, SiteTreeNode>();
  for (const page of pages) {
    nodes.set(page.id, { ...page, children: [] });
  }

  const roots: SiteTreeNode[] = [];
  for (const page of pages) {
    const node = nodes.get(page.id);
    if (!node) continue;
    const parent =
      page.parentPageId === null ? null : nodes.get(page.parentPageId);
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

/**
 * The tree flattened to the rows currently on screen, in visual order, so
 * keyboard navigation can move by one row without caring about nesting.
 */
export function flattenVisible(
  nodes: SiteTreeNode[],
  isExpanded: (id: number) => boolean,
): SiteTreeNode[] {
  const out: SiteTreeNode[] = [];
  const walk = (level: SiteTreeNode[]) => {
    for (const node of level) {
      out.push(node);
      if (node.children.length > 0 && isExpanded(node.id)) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * A readable label for a page, falling back through what is actually known:
 * the extracted title, then the last meaningful path segment, then the URL.
 * A queued page has no title yet, and an empty row would make the tree look
 * broken while a crawl is still running.
 */
export function pageLabel(page: Pick<CrawlPage, "title" | "url">): string {
  if (page.title?.trim()) return page.title.trim();
  try {
    const { hostname, pathname } = new URL(page.url);
    const segments = pathname.split("/").filter(Boolean);
    const last = segments.at(-1);
    if (!last) return hostname;
    return decodeURIComponent(last).replace(/[-_]+/g, " ");
  } catch {
    return page.url;
  }
}

/** Pages that were archived, and so have something to read. */
export function isReadable(page: CrawlPage): boolean {
  return page.status === "done" && page.itemId !== null;
}

export function countPages(pages: CrawlPage[]) {
  let done = 0;
  let pending = 0;
  let failed = 0;
  let skipped = 0;
  for (const page of pages) {
    if (page.status === "done") done += 1;
    else if (page.status === "failed") failed += 1;
    else if (page.status === "skipped") skipped += 1;
    else pending += 1;
  }
  return { done, failed, pending, skipped, total: pages.length };
}
