"use client";

import type { CSSProperties } from "react";

type DigestToggleProps = {
  digestOptIn: boolean;
  onToggle: () => void;
  disabled?: boolean;
  style?: CSSProperties;
};

/**
 * Include/exclude an item from the weekly digest. Summarizing costs money per
 * item, so this is the consent control — nothing is enrolled without it.
 *
 * Shares the filled/hollow glyph idiom with StarButton rather than introducing
 * a checkbox primitive; the app has none and these screens do not use the
 * shadcn components under `components/ui`.
 */
export function DigestToggle({
  digestOptIn,
  onToggle,
  disabled = false,
  style,
}: DigestToggleProps) {
  const label = digestOptIn
    ? "Exclude from weekly digest"
    : "Include in weekly digest";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={digestOptIn}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        // In the capture modal this sits inside a cmdk list whose root key
        // handler nabs on Enter. Without this, activating the toggle by
        // keyboard would also submit the URL.
        if (event.key === "Enter" || event.key === " ") {
          event.stopPropagation();
        }
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: 0,
        background: "transparent",
        border: 0,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "var(--mono-font)",
        fontSize: 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: digestOptIn ? "var(--accent)" : "var(--ink-3)",
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>
        {digestOptIn ? "▣" : "▢"}
      </span>
      <span>Digest</span>
    </button>
  );
}
