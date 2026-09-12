"use client";

import { type CSSProperties, useCallback, useState } from "react";

type BulkActionBarProps = {
  allSelected: boolean;
  busy: boolean;
  count: number;
  onClear: () => void;
  onDelete: () => Promise<unknown>;
  onSelectAll: () => void;
  onTag: () => void;
};

/**
 * Sits where the view picker sits, while select mode is on.
 *
 * Delete arms on the first click and runs on the second, the same two-step the
 * reader's `DeleteItemButton` uses — the app has no confirm primitive, and a
 * bulk delete is the last place to invent one. The arming resets whenever the
 * selection changes, so a count the user has not looked at since arming can
 * never be the one that goes.
 */
export function BulkActionBar({
  allSelected,
  busy,
  count,
  onClear,
  onDelete,
  onSelectAll,
  onTag,
}: BulkActionBarProps) {
  // Stores the count the delete was armed for rather than a plain boolean, so
  // arming expires on its own the moment the selection changes size. The armed
  // button names a count, and that has to be the count the user read before
  // clicking — no effect needed to chase it.
  const [armedFor, setArmedFor] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const armed = armedFor !== null && armedFor === count;

  const none = count === 0;

  const run = useCallback(async () => {
    setFailed(false);
    try {
      await onDelete();
      setArmedFor(null);
    } catch {
      setFailed(true);
    }
  }, [onDelete]);

  const base: CSSProperties = {
    background: "transparent",
    border: "1px solid var(--rule)",
    fontFamily: "var(--mono-font)",
    fontSize: 10,
    letterSpacing: "0.08em",
    lineHeight: 1,
    padding: "4px 10px",
    textTransform: "uppercase",
  };

  return (
    <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
      <span
        style={{
          color: count > 0 ? "var(--ink)" : "var(--ink-3)",
          fontFamily: "var(--mono-font)",
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {count} selected
      </span>

      <button
        onClick={allSelected ? onClear : onSelectAll}
        style={{ ...base, color: "var(--ink-2)" }}
        type="button"
      >
        {allSelected ? "Clear" : "All"}
      </button>

      <button
        disabled={none || busy}
        onClick={onTag}
        style={{
          ...base,
          color: none ? "var(--ink-4)" : "var(--ink-2)",
          opacity: none || busy ? 0.4 : 1,
        }}
        title="Apply a tag to everything selected"
        type="button"
      >
        Tag
      </button>

      {armed ? (
        <span style={{ alignItems: "center", display: "flex", gap: 6 }}>
          <button
            disabled={busy}
            onClick={() => void run()}
            style={{
              ...base,
              borderColor: "var(--accent)",
              color: "var(--accent)",
              opacity: busy ? 0.4 : 1,
            }}
            type="button"
          >
            {busy
              ? "Deleting…"
              : failed
                ? "Failed — retry?"
                : `Delete ${count} for good`}
          </button>
          <button
            disabled={busy}
            onClick={() => {
              setArmedFor(null);
              setFailed(false);
            }}
            style={{ ...base, border: 0, color: "var(--ink-3)" }}
            type="button"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          disabled={none || busy}
          onClick={() => setArmedFor(count)}
          style={{
            ...base,
            color: none ? "var(--ink-4)" : "var(--ink-2)",
            opacity: none || busy ? 0.4 : 1,
          }}
          title="Delete everything selected. Cannot be undone."
          type="button"
        >
          Delete
        </button>
      )}
    </div>
  );
}
