"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Tag } from "../hooks/useTagOperations";

export type TagPickerAnchor = { top: number; left: number } | "center";

type Item = {
  id: number;
  title: string | null;
  tags: Tag[];
};

type TagPickerProps = {
  item: Item;
  allTags: Tag[];
  onAddTag: (itemId: number, tagName: string) => void | Promise<void>;
  onRemoveTag: (itemId: number, tagId: number) => void | Promise<void>;
  onClose: () => void;
  anchor: TagPickerAnchor;
};

type Row =
  | { kind: "create"; label: string }
  | { kind: "tag"; label: string; tagId: number; active: boolean };

export function TagPicker({
  item,
  allTags,
  onAddTag,
  onRemoveTag,
  onClose,
  anchor,
}: TagPickerProps) {
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
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const itemTagIds = useMemo(
    () => new Set(item.tags.map((t) => t.id)),
    [item.tags],
  );

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

  const rows: Row[] = useMemo(
    () => [
      ...(canCreate ? [{ kind: "create" as const, label: q }] : []),
      ...suggestions.map(
        (t): Row => ({
          kind: "tag",
          label: t.name,
          tagId: t.id,
          active: itemTagIds.has(t.id),
        }),
      ),
    ],
    [canCreate, q, suggestions, itemTagIds],
  );

  const activate = (row: Row) => {
    if (row.kind === "create") {
      onAddTag(item.id, row.label);
      setQuery("");
      setCursor(0);
    } else if (row.active) {
      onRemoveTag(item.id, row.tagId);
    } else {
      onAddTag(item.id, row.label);
    }
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
      if (row) activate(row);
    }
  };

  const positionStyle =
    anchor === "center"
      ? { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
      : {
          top: anchor.top,
          left:
            typeof window !== "undefined"
              ? Math.min(anchor.left, window.innerWidth - 300)
              : anchor.left,
        };

  const title = item.title ?? "untitled";

  return (
    <div
      ref={rootRef}
      style={{
        position: "fixed",
        zIndex: 300,
        width: 280,
        background: "var(--bg)",
        border: "1px solid var(--ink)",
        boxShadow: "4px 4px 0 var(--ink)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--ui-font)",
        ...positionStyle,
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--rule)",
          background: "var(--ink)",
          color: "var(--bg)",
          fontFamily: "var(--mono-font)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>
          Tag · {title.slice(0, 28)}
          {title.length > 28 ? "…" : ""}
        </span>
        <span style={{ fontSize: 9 }}>ESC</span>
      </div>

      {item.tags.length > 0 && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--rule-soft)",
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
          }}
        >
          {item.tags.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => onRemoveTag(item.id, t.id)}
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 10,
                padding: "2px 4px 2px 6px",
                background: "var(--ink)",
                color: "var(--bg)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                lineHeight: 1.3,
                border: 0,
              }}
              title="Remove tag"
            >
              #{t.name}
              <span style={{ opacity: 0.7 }}>×</span>
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--rule-soft)",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={onInputKey}
          placeholder="Search or create tag…"
          style={{
            width: "100%",
            fontFamily: "var(--ui-font)",
            fontSize: 13,
            color: "var(--ink)",
            background: "transparent",
            border: 0,
            outline: "none",
          }}
        />
      </div>

      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        {rows.length === 0 && (
          <div
            style={{
              padding: 12,
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              color: "var(--ink-3)",
              textAlign: "center",
            }}
          >
            No tags yet — type to create.
          </div>
        )}
        {rows.map((row, i) => (
          <button
            type="button"
            key={`${row.kind}:${row.label}`}
            onMouseEnter={() => setCursor(i)}
            onClick={() => activate(row)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "7px 12px",
              background: cursor === i ? "var(--bg-alt)" : "transparent",
              fontFamily: "var(--mono-font)",
              fontSize: 12,
              color: "var(--ink)",
              textAlign: "left",
              borderLeft:
                cursor === i
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
              border: 0,
              borderRadius: 0,
            }}
          >
            <span
              style={{
                width: 14,
                fontSize: 10,
                color:
                  row.kind === "create"
                    ? "var(--accent)"
                    : row.active
                      ? "var(--accent)"
                      : "var(--ink-4)",
              }}
            >
              {row.kind === "create" ? "+" : row.active ? "✓" : "·"}
            </span>
            <span style={{ flex: 1 }}>
              {row.kind === "create" ? (
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
          padding: "8px 12px",
          borderTop: "1px solid var(--rule-soft)",
          fontFamily: "var(--mono-font)",
          fontSize: 9,
          color: "var(--ink-3)",
          letterSpacing: "0.08em",
        }}
      >
        ↵ toggle · ↑↓ move · esc close
      </div>
    </div>
  );
}
