"use client";

import { type CSSProperties, useCallback, useState } from "react";

type DeleteItemButtonProps = {
  disabled?: boolean;
  onDelete: () => Promise<unknown>;
  style?: CSSProperties;
};

/**
 * Deletes the item being read.
 *
 * Confirmation is a second click on the button itself rather than a modal,
 * matching how a crawl is deleted on /sites. The app has no confirm primitive,
 * and the two-step inline form keeps the destructive click a deliberate one
 * without a dialog to dismiss.
 *
 * The confirm state does not time out. A half-armed delete sitting in the
 * toolbar is visible and harmless; a delete that re-arms itself silently while
 * someone is reading is not.
 */
export function DeleteItemButton({
  disabled = false,
  onDelete,
  style,
}: DeleteItemButtonProps) {
  const [armed, setArmed] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = useCallback(async () => {
    setFailed(false);
    try {
      await onDelete();
    } catch {
      // Stay armed on failure: the item is still there, and the next click
      // should retry the delete rather than re-arm it.
      setFailed(true);
    }
  }, [onDelete]);

  const base: CSSProperties = {
    alignItems: "center",
    background: "transparent",
    border: 0,
    cursor: disabled ? "default" : "pointer",
    display: "inline-flex",
    fontFamily: "var(--mono-font)",
    fontSize: 10,
    gap: 6,
    letterSpacing: "0.1em",
    opacity: disabled ? 0.4 : 1,
    padding: 0,
    textTransform: "uppercase",
    ...style,
  };

  if (!armed) {
    return (
      <button
        disabled={disabled}
        onClick={() => setArmed(true)}
        style={{ ...base, color: "var(--ink-3)" }}
        title="Delete this item and everything archived for it. Cannot be undone."
        type="button"
      >
        <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>
          ✕
        </span>
        <span>Delete</span>
      </button>
    );
  }

  return (
    <span style={{ alignItems: "center", display: "inline-flex", gap: 10 }}>
      <button
        disabled={disabled}
        onClick={() => void run()}
        // --accent is what the app already uses to mark a destructive choice;
        // see SmallButton's `danger` on /sites. There is no separate token.
        style={{ ...base, color: "var(--accent)" }}
        title="Delete permanently"
        type="button"
      >
        <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>
          ✕
        </span>
        <span>{failed ? "Failed — retry?" : "Delete for good"}</span>
      </button>
      <button
        disabled={disabled}
        onClick={() => {
          setArmed(false);
          setFailed(false);
        }}
        style={{ ...base, color: "var(--ink-3)" }}
        type="button"
      >
        Cancel
      </button>
    </span>
  );
}
