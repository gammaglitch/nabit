"use client";

import type { CSSProperties } from "react";
import type { SemanticFind } from "../hooks/use-semantic-find";

const metaStyle: CSSProperties = {
  fontFamily: "var(--mono-font)",
  fontSize: 10,
  lineHeight: 1.5,
  color: "var(--ink-3)",
};

const stepButtonStyle: CSSProperties = {
  fontFamily: "var(--mono-font)",
  fontSize: 12,
  color: "var(--ink-2)",
  background: "transparent",
  border: "1px solid var(--rule)",
  width: 24,
  height: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

function findShortcutLabel(): string {
  const platform =
    typeof navigator === "undefined" ? "" : navigator.platform || "";
  return /mac|iphone|ipad/i.test(platform) ? "⌘F" : "Ctrl+F";
}

/**
 * The reader's cmd+f box. Matches by meaning rather than by spelling, so the
 * query can be a question or a paraphrase; the page itself is painted by
 * useSemanticFind.
 */
export function SemanticFindBar({ find }: { find: SemanticFind }) {
  if (!find.isOpen) return null;

  const total = find.results.length;
  const active = find.results[find.activeIndex];
  const stale =
    find.searchedQuery !== null && find.searchedQuery !== find.query.trim();

  let counter: string | null = null;
  if (find.status === "searching") counter = "searching…";
  else if (find.status === "done" && !stale)
    counter = total > 0 ? `${find.activeIndex + 1}/${total}` : "no matches";

  return (
    <search
      aria-label="Find in article by meaning"
      style={{
        position: "absolute",
        top: 12,
        right: 20,
        zIndex: 20,
        width: "min(420px, calc(100% - 40px))",
        background: "var(--bg)",
        border: "1px solid var(--ink)",
        boxShadow: "0 6px 24px rgba(0, 0, 0, 0.18)",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          ref={find.inputRef}
          aria-label="Find by meaning"
          placeholder="Find by meaning…"
          value={find.query}
          onChange={(event) => find.setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              find.submit(event.shiftKey);
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "var(--mono-font)",
            fontSize: 12,
            color: "var(--ink)",
            background: "var(--bg-alt)",
            border: "1px solid var(--rule)",
            padding: "6px 8px",
            outline: "none",
          }}
        />
        {counter && (
          <span
            aria-live="polite"
            style={{ ...metaStyle, fontSize: 11, whiteSpace: "nowrap" }}
          >
            {counter}
          </span>
        )}
        <button
          type="button"
          aria-label="Previous match"
          disabled={total === 0}
          onClick={find.previous}
          style={{ ...stepButtonStyle, opacity: total === 0 ? 0.4 : 1 }}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Next match"
          disabled={total === 0}
          onClick={find.next}
          style={{ ...stepButtonStyle, opacity: total === 0 ? 0.4 : 1 }}
        >
          ↓
        </button>
        <button
          type="button"
          aria-label="Close find"
          onClick={find.close}
          style={{ ...stepButtonStyle, border: "1px solid transparent" }}
        >
          ×
        </button>
      </div>

      {find.status === "error" && find.error && (
        <div style={{ ...metaStyle, color: "var(--accent)" }}>{find.error}</div>
      )}
      {active && !stale && (
        <div style={{ ...metaStyle, color: "var(--ink-2)" }}>
          {Math.round(active.confidence * 100)}% match
        </div>
      )}
      {find.truncated && !stale && (
        <div style={metaStyle}>
          Long article: only its first part was searched.
        </div>
      )}
      <div style={{ ...metaStyle, color: "var(--ink-4)" }}>
        ↵ search · ↵ again next · ⇧↵ previous · {findShortcutLabel()} again for
        exact find
      </div>
    </search>
  );
}
