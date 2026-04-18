"use client";

import type { CSSProperties } from "react";

type StarButtonProps = {
  starred: boolean;
  onToggle: () => void;
  style?: CSSProperties;
};

export function StarButton({ starred, onToggle, style }: StarButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={starred ? "Unstar" : "Mark shiny"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        background: "transparent",
        border: 0,
        fontSize: 14,
        color: starred ? "var(--accent)" : "var(--ink-4)",
        ...style,
      }}
    >
      {starred ? "◆" : "◇"}
    </button>
  );
}
