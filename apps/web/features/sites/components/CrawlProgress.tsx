"use client";

import type { AppRouter, inferRouterOutputs } from "@repo/trpc/types";

type Crawl = inferRouterOutputs<AppRouter>["crawl"]["list"]["crawls"][number];

/**
 * A bar plus a count of what the crawl has actually archived.
 *
 * The denominator is pages *known* so far, not maxPages: a crawl discovers its
 * own size as it goes, so measuring against the cap would show a 200-page
 * limit barely touched when the site only has twelve pages.
 */
export function CrawlProgress({ crawl }: { crawl: Crawl }) {
  const known = crawl.pagesDone + crawl.pagesFailed + crawl.pagesQueued;
  const settled = crawl.pagesDone + crawl.pagesFailed;
  const percent = known === 0 ? 0 : Math.round((settled / known) * 100);

  return (
    <div>
      <div
        aria-label={`${crawl.pagesDone} of ${known} pages archived`}
        role="progressbar"
        aria-valuemax={known}
        aria-valuemin={0}
        aria-valuenow={settled}
        style={{
          background: "var(--rule-soft)",
          height: 3,
          overflow: "hidden",
          width: "100%",
        }}
      >
        <div
          style={{
            background:
              crawl.pagesFailed > 0 ? "var(--accent)" : "var(--ink-2)",
            height: "100%",
            transition: "width 300ms ease",
            width: `${percent}%`,
          }}
        />
      </div>

      <div
        style={{
          color: "var(--ink-3)",
          display: "flex",
          fontFamily: "var(--mono-font)",
          fontSize: 11,
          gap: 12,
          marginTop: 6,
        }}
      >
        <span>{crawl.pagesDone} archived</span>
        {crawl.pagesQueued > 0 && <span>{crawl.pagesQueued} queued</span>}
        {crawl.pagesFailed > 0 && (
          <span style={{ color: "var(--accent)" }}>
            {crawl.pagesFailed} failed
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span>
          depth ≤ {crawl.maxDepth} · cap {crawl.maxPages}
        </span>
      </div>
    </div>
  );
}
