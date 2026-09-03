// Deciding what a crawl does with the links it just found, as pure functions.
//
// The database work around this is thin — insert some rows, queue some jobs —
// but the decisions are not: budgets, robots.txt, per-page deduplication and
// leaf marking all have to agree, and getting one wrong either strands a crawl
// or lets it run away. Split out so the rules can be tested without a database,
// the same way normalizeClaimedDigest is.

import type { LinkVerdict } from "./scope";

export type CrawlPageStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "skipped";

/** A link that survived classification, before budget and robots are applied. */
export type Candidate = {
  depth: number;
  isExternal: boolean;
  isLeaf: boolean;
  url: string;
};

export type PlannedPage = Candidate & {
  discoveryIndex: number;
  errorMessage: string | null;
  status: Extract<CrawlPageStatus, "queued" | "skipped">;
};

/**
 * Classify a page's links, keeping the first occurrence of each URL.
 *
 * Deduplicating here matters: a nav block repeated in a header and a footer
 * would otherwise contend on the unique index once per link, and the order
 * decides `discovery_index` — which is the order the site browser renders.
 */
export function selectCandidates(input: {
  classify: (url: string, parentDepth: number) => LinkVerdict;
  links: string[];
  parentDepth: number;
}): Candidate[] {
  const seen = new Map<string, Candidate>();

  for (const link of input.links) {
    const verdict = input.classify(link, input.parentDepth);
    if (verdict.follow === "skip") continue;
    if (seen.has(verdict.url)) continue;
    seen.set(verdict.url, {
      depth: verdict.depth,
      isExternal: verdict.external,
      isLeaf: verdict.follow === "leaf",
      url: verdict.url,
    });
  }

  return [...seen.values()];
}

/**
 * Turn candidates into the rows to write.
 *
 * Nothing is dropped. A link excluded by robots.txt or by the page budget is
 * still recorded, as `skipped` with a reason, so the site view can say why it
 * stopped rather than just looking short. Only `queued` rows spend budget.
 */
export function planExpansion(input: {
  candidates: Candidate[];
  isAllowedByRobots: (url: string) => boolean;
  maxPages: number;
  /** Rows already counted against the budget — every non-skipped page. */
  pagesUsed: number;
}): PlannedPage[] {
  let budget = Math.max(0, input.maxPages - input.pagesUsed);

  return input.candidates.map((candidate, index) => {
    const base = { ...candidate, discoveryIndex: index };

    if (!input.isAllowedByRobots(candidate.url)) {
      return {
        ...base,
        errorMessage: "Disallowed by robots.txt",
        status: "skipped" as const,
      };
    }

    if (budget <= 0) {
      return {
        ...base,
        errorMessage: `Crawl page limit of ${input.maxPages} reached`,
        status: "skipped" as const,
      };
    }

    budget -= 1;
    return { ...base, errorMessage: null, status: "queued" as const };
  });
}
