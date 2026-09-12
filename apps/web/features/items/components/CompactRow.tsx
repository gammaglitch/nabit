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
import { SiteBadge } from "./SiteBadge";
import { StarButton } from "./StarButton";

type CompactRowProps = {
  item: DisplayItem;
  starred: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
  onRemoveTag: (tagId: number) => void;
  renderTitle: (title: string) => ReactNode;
  /** Select mode is on: clicking the row picks it instead of opening it. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (extend: boolean) => void;
};

export function CompactRow({
  item,
  starred,
  onOpen,
  onToggleStar,
  onRemoveTag,
  renderTitle,
  selectable = false,
  selected = false,
  onToggleSelect,
}: CompactRowProps) {
  const [hover, setHover] = useState(false);
  const srcCol = sourceColor(item.source);

  return (
    <button
      type="button"
      aria-pressed={selectable ? selected : undefined}
      onClick={(e) => {
        if (selectable) {
          onToggleSelect?.(e.shiftKey);
          return;
        }
        onOpen();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "28px 44px 1fr 150px 70px",
        padding: "6px 24px",
        borderBottom: "1px solid var(--rule-soft)",
        alignItems: "center",
        background: selected || hover ? "var(--bg-alt)" : "var(--bg)",
        boxShadow: selected ? "inset 2px 0 0 var(--accent)" : undefined,
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
      {selectable ? (
        <span
          aria-hidden="true"
          style={{
            alignItems: "center",
            border: `1px solid ${selected ? "var(--accent)" : "var(--ink-4)"}`,
            background: selected ? "var(--accent)" : "transparent",
            color: "var(--bg)",
            display: "inline-flex",
            fontSize: 9,
            height: 13,
            justifyContent: "center",
            lineHeight: 1,
            width: 13,
          }}
        >
          {selected ? "✓" : ""}
        </span>
      ) : (
        <StarButton
          starred={starred}
          onToggle={onToggleStar}
          style={{ fontSize: 12 }}
        />
      )}

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
        {item.crawl && (
          <>
            <SiteBadge crawl={item.crawl} size="sm" />{" "}
          </>
        )}
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
        {/* In select mode the chips go static. RemovableTag stops propagation,
            so leaving them live means a click near a tag silently strips it
            instead of selecting the row the user was aiming at. */}
        {item.tags.map((t) =>
          selectable ? (
            <span
              key={t.id}
              style={{
                border: "1px solid var(--rule-soft)",
                color: "var(--ink-3)",
                fontFamily: "var(--mono-font)",
                fontSize: 10,
                lineHeight: 1.2,
                padding: "2px 6px",
              }}
            >
              #{t.name}
            </span>
          ) : (
            <RemovableTag
              key={t.id}
              tag={t.name}
              onRemove={() => onRemoveTag(t.id)}
            />
          ),
        )}
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
