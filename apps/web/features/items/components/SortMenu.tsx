"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/features/shared/components/Icon";
import {
  directionLabel,
  SORT_FIELDS,
  type SortField,
  type SortSpec,
  sortFieldMeta,
} from "../utils/item-sort";

const controlStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  fontFamily: "var(--mono-font)",
  fontSize: 11,
  lineHeight: 1,
  border: "1px solid var(--rule)",
  background: "var(--bg)",
  color: "var(--ink-2)",
} as const;

export function SortMenu({
  sort,
  setSort,
}: {
  sort: SortSpec;
  setSort: (next: SortSpec) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = sortFieldMeta(sort.field);

  // Picking a field resets to that field's natural direction: coming from
  // "Newest first", a jump to Title wants A→Z, not Z→A.
  const pickField = (field: SortField) => {
    setSort({ field, direction: sortFieldMeta(field).defaultDirection });
    setOpen(false);
  };

  const flip = () =>
    setSort({
      field: sort.field,
      direction: sort.direction === "asc" ? "desc" : "asc",
    });

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", display: "flex", gap: 6 }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Choose what to sort by"
        style={{
          ...controlStyle,
          borderColor: open ? "var(--ink)" : "var(--rule)",
          color: open ? "var(--ink)" : "var(--ink-2)",
        }}
      >
        <Icon name="sort" size={12} />
        <span>{active.label}</span>
        <Icon name="chevron-down" size={10} />
      </button>

      <button
        type="button"
        onClick={flip}
        title={`${directionLabel(sort)} — click to reverse`}
        aria-label={`Sort direction: ${directionLabel(sort)}`}
        style={controlStyle}
      >
        <Icon
          name={sort.direction === "asc" ? "arrow-up" : "arrow-down"}
          size={12}
        />
        <span>{directionLabel(sort)}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Sort by"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: 230,
            background: "var(--bg)",
            border: "1px solid var(--ink)",
            boxShadow: "4px 4px 0 var(--ink)",
            zIndex: 200,
            padding: 4,
          }}
        >
          {SORT_FIELDS.map((field) => {
            const selected = field.id === sort.field;
            return (
              <button
                type="button"
                key={field.id}
                role="option"
                aria-selected={selected}
                onClick={() => pickField(field.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 9px",
                  border: 0,
                  background: selected ? "var(--ink)" : "transparent",
                  color: selected ? "var(--bg)" : "var(--ink)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontFamily: "var(--mono-font)",
                    fontSize: 11,
                    lineHeight: 1.2,
                  }}
                >
                  <span>{field.label}</span>
                  {selected && <Icon name="check" size={11} />}
                </div>
                <div
                  style={{
                    fontFamily: "var(--mono-font)",
                    fontSize: 9,
                    lineHeight: 1.4,
                    marginTop: 3,
                    color: selected ? "var(--bg)" : "var(--ink-4)",
                  }}
                >
                  {field.hint}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
