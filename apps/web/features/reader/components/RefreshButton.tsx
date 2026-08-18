"use client";

import type { CSSProperties } from "react";
import type { RefreshStatus } from "@/features/items/hooks/useRefreshSource";

type RefreshButtonProps = {
  disabled?: boolean;
  onRefresh: () => void;
  status: RefreshStatus;
  style?: CSSProperties;
};

const LABELS: Record<RefreshStatus, string> = {
  done: "Re-fetched",
  error: "Re-fetch failed",
  idle: "Re-fetch",
  queued: "Queued…",
  working: "Re-fetching…",
};

const TITLES: Record<RefreshStatus, string> = {
  done: "Fetched the source again; new comments were added to the archived ones",
  error: "The capture failed, so this item is unchanged",
  idle: "Fetch the source again for anything posted since it was archived. Comments are added, never removed.",
  queued: "Waiting for the ingest worker to pick up the capture…",
  working: "Fetching the source…",
};

const GLYPHS: Record<RefreshStatus, string> = {
  done: "✓",
  error: "⚠",
  idle: "⇣",
  queued: "⇣",
  working: "⇣",
};

/**
 * Sits next to Re-extract and does the opposite half of the job: Re-extract
 * replays the current extractor over bytes we already hold, this goes back to
 * the source for bytes we do not.
 *
 * Worth its own button rather than a mode on Re-extract because the cost is
 * different — this one hits the site, runs on the worker, and can fail.
 */
export function RefreshButton({
  disabled = false,
  onRefresh,
  status,
  style,
}: RefreshButtonProps) {
  const busy = status === "queued" || status === "working" || disabled;

  return (
    <button
      type="button"
      aria-label={LABELS[status]}
      title={TITLES[status]}
      disabled={busy}
      onClick={onRefresh}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: 0,
        background: "transparent",
        border: 0,
        cursor: busy ? "default" : "pointer",
        fontFamily: "var(--mono-font)",
        fontSize: 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: status === "idle" ? "var(--ink-3)" : "var(--accent)",
        opacity: busy ? 0.4 : 1,
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>
        {GLYPHS[status]}
      </span>
      <span>{LABELS[status]}</span>
    </button>
  );
}
