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

type ListRowProps = {
  item: DisplayItem;
  starred: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
  onOpenTagPicker: (anchor: TagPickerAnchor) => void;
  onRemoveTag: (tagId: number) => void;
  renderTitle: (title: string) => ReactNode;
};

export function ListRow({
  item,
  starred,
  onOpen,
  onToggleStar,
  onOpenTagPicker,
  onRemoveTag,
  renderTitle,
}: ListRowProps) {
  const [hover, setHover] = useState(false);
  const srcCol = sourceColor(item.source);

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "36px 52px 1fr 200px 90px",
        padding: "14px 24px",
        borderBottom: "1px solid var(--rule-soft)",
        alignItems: "center",
        background: hover ? "var(--bg-alt)" : "var(--bg)",
        transition: "background 80ms",
        width: "100%",
        textAlign: "left",
        color: "inherit",
        border: 0,
        borderTop: 0,
        borderLeft: 0,
        borderRight: 0,
      }}
    >
      <StarButton starred={starred} onToggle={onToggleStar} />


      <span>
        <span
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
            padding: "3px 6px",
            border: "1px solid currentColor",
            display: "inline-block",
            lineHeight: 1,
            color: srcCol,
          }}
        >
          {sourceLabel(item.source)}
        </span>
      </span>

      <div style={{ overflow: "hidden" }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {renderTitle(item.title)}
        </div>
        <div
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 11,
            color: "var(--ink-3)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          <span>{item.source === "reddit" ? item.subreddit : item.domain}</span>
          {item.commentCount > 0 && (
            <>
              <span style={{ margin: "0 6px", color: "var(--ink-4)" }}>·</span>
              <span>{item.commentCount} cmts</span>
            </>
          )}
          {item.score !== null && (
            <>
              <span style={{ margin: "0 6px", color: "var(--ink-4)" }}>·</span>
              <span>↑ {item.score}</span>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, overflow: "hidden" }}>
        {item.tags.slice(0, 3).map((t) => (
          <RemovableTag
            key={t.id}
            tag={t.name}
            onRemove={() => onRemoveTag(t.id)}
          />
        ))}
        {hover && (
          <button
            type="button"
            onClick={(e: MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              onOpenTagPicker({ top: r.bottom + 4, left: r.left });
            }}
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 10,
              color: "var(--ink-3)",
              padding: "2px 6px",
              border: "1px dashed var(--rule)",
              background: "transparent",
              lineHeight: 1.2,
            }}
          >
            + tag
          </button>
        )}
      </div>

      <div
        style={{
          fontFamily: "var(--mono-font)",
          fontSize: 11,
          color: "var(--ink-3)",
          textAlign: "right",
        }}
      >
        {timeAgo(item.savedAt)}
      </div>
    </button>
  );
}
