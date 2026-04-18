"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
  sourceColor,
  sourceLabel,
  timeAgo,
} from "@/features/shared/utils/source";
import type { DisplayItem } from "../utils/item-helpers";
import { RemovableTag } from "./RemovableTag";
import { StarButton } from "./StarButton";

type CompactRowProps = {
  item: DisplayItem;
  starred: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
  onRemoveTag: (tagId: number) => void;
  renderTitle: (title: string) => ReactNode;
};

export function CompactRow({
  item,
  starred,
  onOpen,
  onToggleStar,
  onRemoveTag,
  renderTitle,
}: CompactRowProps) {
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
        gridTemplateColumns: "28px 44px 1fr 150px 70px",
        padding: "6px 24px",
        borderBottom: "1px solid var(--rule-soft)",
        alignItems: "center",
        background: hover ? "var(--bg-alt)" : "var(--bg)",
        fontSize: 13,
        gap: 12,
        width: "100%",
        textAlign: "left",
        color: "inherit",
        border: 0,
        borderBottomWidth: 1,
        borderBottomStyle: "solid",
        borderBottomColor: "var(--rule-soft)",
      }}
    >
      <StarButton
        starred={starred}
        onToggle={onToggleStar}
        style={{ fontSize: 12 }}
      />

      <span
        style={{
          fontFamily: "var(--mono-font)",
          fontSize: 9,
          fontWeight: 700,
          padding: "2px 5px",
          border: "1px solid currentColor",
          color: srcCol,
          lineHeight: 1,
          width: "fit-content",
        }}
      >
        {sourceLabel(item.source)}
      </span>

      <div
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {renderTitle(item.title)}
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          overflow: "hidden",
          whiteSpace: "nowrap",
          alignItems: "center",
        }}
      >
        {item.tags.map((t) => (
          <RemovableTag
            key={t.id}
            tag={t.name}
            onRemove={() => onRemoveTag(t.id)}
          />
        ))}
      </div>

      <div
        style={{
          fontFamily: "var(--mono-font)",
          fontSize: 10,
          color: "var(--ink-3)",
          textAlign: "right",
        }}
      >
        {timeAgo(item.savedAt)}
      </div>
    </button>
  );
}
