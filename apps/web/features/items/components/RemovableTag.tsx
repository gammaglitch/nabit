"use client";

import type { MouseEvent } from "react";
import { useState } from "react";

type Size = "sm" | "md";

type RemovableTagProps = {
  tag: string;
  onRemove: (event?: MouseEvent) => void;
  size?: Size;
};

export function RemovableTag({ tag, onRemove, size = "sm" }: RemovableTagProps) {
  const [hover, setHover] = useState(false);
  const fontSize = size === "md" ? 11 : 10;
  const padY = size === "md" ? 3 : 2;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRemove(e);
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Remove tag"
      style={{
        fontFamily: "var(--mono-font)",
        fontSize,
        color: hover ? "var(--accent)" : "var(--ink-3)",
        padding: `${padY}px 6px`,
        border: hover
          ? "1px solid var(--accent)"
          : "1px solid var(--rule-soft)",
        background: "transparent",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        lineHeight: 1.2,
        transition: "color 90ms, border-color 90ms",
      }}
    >
      <span>#{tag}</span>
      <span
        style={{
          display: "inline-block",
          width: hover ? 10 : 0,
          overflow: "hidden",
          transition: "width 120ms ease",
          textAlign: "center",
          fontSize: fontSize - 1,
          lineHeight: 1,
        }}
      >
        ×
      </span>
    </button>
  );
}
