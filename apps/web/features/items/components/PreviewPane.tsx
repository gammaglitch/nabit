"use client";

import type { MouseEvent } from "react";
import {
  sourceColor,
  sourceLabel,
} from "@/features/shared/utils/source";
import type { DisplayItem, ItemDetail } from "../utils/item-helpers";
import { RemovableTag } from "./RemovableTag";
import type { TagPickerAnchor } from "./TagPicker";

type PreviewPaneProps = {
  item: DisplayItem | null;
  detail: ItemDetail | null;
  starred: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
  onOpenTagPicker: (anchor: TagPickerAnchor) => void;
  onRemoveTag: (tagId: number) => void;
};

export function PreviewPane({
  item,
  detail,
  starred,
  onOpen,
  onToggleStar,
  onOpenTagPicker,
  onRemoveTag,
}: PreviewPaneProps) {
  if (!item) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--mono-font)",
          fontSize: 12,
          color: "var(--ink-4)",
          background: "var(--bg-alt)",
        }}
      >
        ∅ Select an item
      </div>
    );
  }

  const srcCol = sourceColor(item.source);
  const isThread = item.source === "hn" || item.source === "reddit";
  const previewComments = detail?.comments.slice(0, 3) ?? [];
  const paragraphs = (item.contentText ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3);
  const hasMoreParagraphs =
    (item.contentText ?? "").split(/\n{2,}/).filter((p) => p.trim()).length > 3;

  return (
    <div
      style={{
        overflow: "auto",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          borderBottom: "1px solid var(--rule)",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          position: "sticky",
          top: 0,
          background: "var(--bg)",
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 6px",
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
            fontSize: 11,
            color: "var(--ink-3)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.source === "reddit" ? item.subreddit : item.domain}
          {item.sourceCreatedAt && ` · ${item.sourceCreatedAt}`}
        </span>
        <button
          type="button"
          onClick={onToggleStar}
          style={{
            marginLeft: "auto",
            fontFamily: "var(--mono-font)",
            fontSize: 10,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "4px 8px",
            border: "1px solid var(--rule)",
            background: "transparent",
            color: starred ? "var(--accent)" : "var(--ink-2)",
          }}
        >
          {starred ? "◆ Shiny" : "◇ Mark"}
        </button>
        <button
          type="button"
          onClick={onOpen}
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 10,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "4px 10px",
            border: "1px solid var(--ink)",
            background: "var(--ink)",
            color: "var(--bg)",
          }}
        >
          Open →
        </button>
      </div>

      <div style={{ padding: "24px 32px 40px", maxWidth: 680 }}>
        <h2
          style={{
            fontFamily: "var(--read-font)",
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            marginBottom: 10,
            textWrap: "balance",
            color: "var(--ink)",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            hyphens: "auto",
          }}
        >
          {item.title}
        </h2>
        {item.author && (
          <div
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              color: "var(--ink-3)",
              marginBottom: 20,
            }}
          >
            {item.author}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          {item.tags.map((t) => (
            <RemovableTag
              key={t.id}
              tag={t.name}
              onRemove={() => onRemoveTag(t.id)}
              size="md"
            />
          ))}
          <button
            type="button"
            onClick={(e: MouseEvent<HTMLButtonElement>) => {
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
            }}
          >
            + tag
          </button>
        </div>

        <div
          style={{
            fontFamily: "var(--read-font)",
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--ink-2)",
          }}
        >
          {isThread ? (
            <>
              <div
                style={{
                  borderLeft: "3px solid var(--accent)",
                  padding: "10px 14px",
                  background: "var(--bg-alt)",
                  marginBottom: 16,
                }}
              >
                {item.excerpt ||
                  "Original post captured. Open to read the full thread."}
              </div>
              {previewComments.map((c) => (
                <div
                  key={c.id}
                  style={{
                    marginBottom: 14,
                    paddingBottom: 14,
                    borderBottom: "1px solid var(--rule-soft)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--mono-font)",
                      fontSize: 11,
                      color: "var(--ink-3)",
                      marginBottom: 4,
                    }}
                  >
                    <strong style={{ color: "var(--ink)" }}>
                      {c.author ?? "anon"}
                    </strong>
                    {typeof c.metadata.points === "number" &&
                      ` · ↑ ${c.metadata.points}`}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                    {c.contentText.slice(0, 240)}
                    {c.contentText.length > 240 ? "…" : ""}
                  </div>
                </div>
              ))}
              {detail && detail.comments.length > 3 && (
                <div
                  style={{
                    fontFamily: "var(--mono-font)",
                    fontSize: 11,
                    color: "var(--ink-3)",
                    marginTop: 8,
                  }}
                >
                  + {detail.comments.length - 3} more · Open to see the full
                  thread
                </div>
              )}
            </>
          ) : paragraphs.length > 0 ? (
            <>
              {paragraphs.map((p) => (
                <p key={p} style={{ marginBottom: 12 }}>
                  {p}
                </p>
              ))}
              {hasMoreParagraphs && (
                <div
                  style={{
                    fontFamily: "var(--mono-font)",
                    fontSize: 11,
                    color: "var(--ink-3)",
                    marginTop: 12,
                  }}
                >
                  … Open to read the rest
                </div>
              )}
            </>
          ) : (
            <p>{item.excerpt || "No extracted content yet."}</p>
          )}
        </div>
      </div>
    </div>
  );
}
