"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Tag } from "../hooks/useTagOperations";

type BulkTagPickerProps = {
  allTags: Tag[];
  count: number;
  onApply: (tagName: string) => void | Promise<void>;
  onClose: () => void;
};

/**
 * Picks one tag to apply across a selection.
 *
 * Deliberately not `TagPicker` with a nullable item: that component toggles —
 * a row is checked when the item already carries the tag, and clicking it
 * again removes it. Across a mixed selection there is no honest checked state
 * to draw, and "click to remove" on a tag that only half the selection has is
 * a trap. This one only ever adds, and says so.
 */
export function BulkTagPicker({
  allTags,
  count,
  onApply,
  onClose,
}: BulkTagPickerProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        // Stop the library's own Escape handler from leaving select mode as
        // well: dismissing this picker should not also drop the selection.
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const q = query.trim().toLowerCase();

  const suggestions = useMemo(
    () =>
      allTags
        .filter((t) => !q || t.name.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allTags, q],
  );

  const canCreate =
    q.length > 0 && !allTags.some((t) => t.name.toLowerCase() === q);

  const rows = useMemo(
    () => [
      ...(canCreate ? [{ create: true, label: q }] : []),
      ...suggestions.map((t) => ({ create: false, label: t.name })),
    ],
    [canCreate, q, suggestions],
  );

  const activate = (label: string) => {
    void onApply(label);
    onClose();
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, rows.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[cursor];
      if (row) activate(row.label);
    }
  };

  return (
    <div
      ref={rootRef}
      style={{
        background: "var(--bg)",
        border: "1px solid var(--ink)",
        boxShadow: "4px 4px 0 var(--ink)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--ui-font)",
        left: "50%",
        position: "fixed",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: 280,
        zIndex: 300,
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: "var(--ink)",
          borderBottom: "1px solid var(--rule)",
          color: "var(--bg)",
          display: "flex",
          fontFamily: "var(--mono-font)",
          fontSize: 10,
          justifyContent: "space-between",
          letterSpacing: "0.12em",
          padding: "10px 12px",
          textTransform: "uppercase",
        }}
      >
        <span>
          Tag {count} {count === 1 ? "item" : "items"}
        </span>
        <span style={{ fontSize: 9 }}>ESC</span>
      </div>

      <div
        style={{
          borderBottom: "1px solid var(--rule-soft)",
          padding: "10px 12px",
        }}
      >
        <input
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={onInputKey}
          placeholder="Search or create tag…"
          ref={inputRef}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--ink)",
            fontFamily: "var(--ui-font)",
            fontSize: 13,
            outline: "none",
            width: "100%",
          }}
          value={query}
        />
      </div>

      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        {rows.length === 0 && (
          <div
            style={{
              color: "var(--ink-3)",
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              padding: 12,
              textAlign: "center",
            }}
          >
            No tags yet — type to create.
          </div>
        )}
        {rows.map((row, i) => (
          <button
            key={`${row.create ? "create" : "tag"}:${row.label}`}
            onClick={() => activate(row.label)}
            onMouseEnter={() => setCursor(i)}
            style={{
              alignItems: "center",
              background: cursor === i ? "var(--bg-alt)" : "transparent",
              border: 0,
              borderLeft:
                cursor === i
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
              borderRadius: 0,
              color: "var(--ink)",
              display: "flex",
              fontFamily: "var(--mono-font)",
              fontSize: 12,
              gap: 8,
              padding: "7px 12px",
              textAlign: "left",
              width: "100%",
            }}
            type="button"
          >
            <span
              style={{
                color: row.create ? "var(--accent)" : "var(--ink-4)",
                fontSize: 10,
                width: 14,
              }}
            >
              {row.create ? "+" : "·"}
            </span>
            <span style={{ flex: 1 }}>
              {row.create ? (
                <>
                  Create{" "}
                  <strong style={{ color: "var(--accent)" }}>
                    #{row.label}
                  </strong>
                </>
              ) : (
                <>#{row.label}</>
              )}
            </span>
          </button>
        ))}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--rule-soft)",
          color: "var(--ink-3)",
          fontFamily: "var(--mono-font)",
          fontSize: 9,
          letterSpacing: "0.08em",
          padding: "8px 12px",
        }}
      >
        ↵ apply · ↑↓ move · esc close
      </div>
    </div>
  );
}
