"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export type ReextractOutcome = { applied: boolean };

type ReextractButtonProps = {
  disabled?: boolean;
  onReextract: () => Promise<ReextractOutcome>;
  style?: CSSProperties;
};

type State = "idle" | "pending" | "applied" | "empty" | "error";

/** How long the outcome stays on the button before it returns to idle. */
const RESULT_VISIBLE_MS = 4000;

const LABELS: Record<State, string> = {
  applied: "Re-extracted",
  empty: "Nothing extracted",
  error: "Re-extract failed",
  idle: "Re-extract",
  pending: "Re-extracting…",
};

const TITLES: Record<State, string> = {
  applied: "Rebuilt this item's content from its archived snapshot",
  empty: "No snapshot extracted cleanly, so the existing content was kept",
  error: "Re-extract failed, so the existing content was kept",
  idle: "Rebuild this item's content from its archived snapshot. Does not refetch the source.",
  pending: "Re-extracting from the archived snapshot…",
};

const GLYPHS: Record<State, string> = {
  applied: "✓",
  empty: "⚠",
  error: "⚠",
  idle: "⟳",
  pending: "⟳",
};

/**
 * Re-runs extraction over what we already archived for this item. Worth a
 * button because an extractor fix is invisible otherwise: the item keeps
 * whatever markdown the extractor produced on the day it was captured.
 *
 * Reports the outcome on the button itself rather than a toast — the app has
 * no toast primitive, and the result matters mainly in the moment.
 */
export function ReextractButton({
  disabled = false,
  onReextract,
  style,
}: ReextractButtonProps) {
  const [state, setState] = useState<State>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const run = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setState("pending");
    try {
      const result = await onReextract();
      setState(result.applied ? "applied" : "empty");
    } catch {
      setState("error");
    }

    timerRef.current = setTimeout(() => setState("idle"), RESULT_VISIBLE_MS);
  }, [onReextract]);

  const busy = state === "pending" || disabled;

  return (
    <button
      type="button"
      aria-label={LABELS[state]}
      title={TITLES[state]}
      disabled={busy}
      onClick={() => void run()}
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
        color: state === "idle" ? "var(--ink-3)" : "var(--accent)",
        opacity: busy ? 0.4 : 1,
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>
        {GLYPHS[state]}
      </span>
      <span>{LABELS[state]}</span>
    </button>
  );
}
