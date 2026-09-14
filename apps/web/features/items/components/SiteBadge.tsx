"use client";

import type { DisplayItem } from "../utils/item-helpers";

/**
 * Marks a library row as a whole archived site rather than one saved page.
 *
 * A crawl's sub-pages are hidden from the library — one row stands for all of
 * them — so without this the megathread's 87 archived pages look exactly like
 * a single nabbed article, and nothing suggests there is a tree behind it.
 *
 * Rendered beside the source badge in every layout, so the two read as one
 * pair: what kind of thing this is, and how much of it there is.
 */
export function SiteBadge({
  crawl,
  size = "md",
}: {
  crawl: DisplayItem["crawl"];
  size?: "sm" | "md";
}) {
  if (!crawl) return null;

  const busy = crawl.status === "running" || crawl.status === "queued";

  return (
    <span
      title={
        busy
          ? `Archiving — ${crawl.pageCount} pages so far, ${crawl.pagesQueued} to go`
          : `An archived site of ${crawl.pageCount} pages`
      }
      style={{
        fontFamily: "var(--mono-font)",
        fontSize: size === "sm" ? 9 : 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        padding: size === "sm" ? "2px 5px" : "3px 6px",
        border: "1px solid currentColor",
        display: "inline-block",
        lineHeight: 1,
        whiteSpace: "nowrap",
        color: "var(--accent)",
      }}
    >
      {/* The count, not just the word: "how much is in here" is the thing a
          reader wants before deciding to open it. */}
      {busy ? `SITE ${crawl.pageCount}+` : `SITE ${crawl.pageCount}`}
    </span>
  );
}
