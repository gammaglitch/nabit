"use client";

import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";
import {
  sourceColor,
  sourceLabel,
  timeAgo,
} from "@/features/shared/utils/source";
import type { DisplayItem } from "../utils/item-helpers";
import { RemovableTag } from "./RemovableTag";
import { StarButton } from "./StarButton";
import type { TagPickerAnchor } from "./TagPicker";

type SplitRowProps = {
  item: DisplayItem;
  selected: boolean;
  starred: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onToggleStar: () => void;
  onOpenTagPicker: (anchor: TagPickerAnchor) => void;
  onRemoveTag: (tagId: number) => void;
  renderTitle: (title: string) => ReactNode;
};

export function SplitRow({
  item,
  selected,
  starred,
  onSelect,
  onOpen,
  onToggleStar,
  onOpenTagPicker,
  onRemoveTag,
  renderTitle,
}: SplitRowProps) {
  const [hover, setHover] = useState(false);
  const srcCol = sourceColor(item.source);
  const bg = selected || hover ? "var(--bg-alt)" : "var(--bg)";

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "12px 18px",
        paddingLeft: selected ? 15 : 18,
        borderBottom: "1px solid var(--rule-soft)",
        background: bg,
        borderLeft: selected
          ? "3px solid var(--accent)"
          : "3px solid transparent",
        width: "100%",
        textAlign: "left",
        color: "inherit",
        display: "block",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 5px",
            border: "1px solid currentColor",
            color: srcCol,
            lineHeight: 1,
          }}
        >
          {sourceLabel(item.source)}
        </span>
        <span
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 10,
            color: "var(--ink-3)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.source === "reddit" ? item.subreddit : item.domain}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--mono-font)",
            fontSize: 10,
            color: "var(--ink-3)",
          }}
        >
          {timeAgo(item.savedAt)}
        </span>
        <StarButton
          starred={starred}
          onToggle={onToggleStar}
          style={{ fontSize: 11 }}
        />
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: "-0.01em",
          color: "var(--ink)",
          lineHeight: 1.3,
          marginBottom: 4,
        }}
      >
        {renderTitle(item.title)}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {item.tags.slice(0, 4).map((t) => (
          <RemovableTag
            key={t.id}
            tag={t.name}
            onRemove={() => onRemoveTag(t.id)}
          />
        ))}
        {(hover || selected) && (
          <button
            type="button"
            onClick={(e: MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              onOpenTagPicker({ top: r.bottom + 4, left: r.left });
            }}
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 9,
              color: "var(--ink-3)",
              padding: "1px 5px",
              border: "1px dashed var(--rule)",
              background: "transparent",
            }}
          >
            + tag
          </button>
        )}
      </div>
    </button>
  );
}
