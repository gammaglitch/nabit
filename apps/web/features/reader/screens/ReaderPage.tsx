"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/features/shared/components/Icon";
import { useStarred } from "@/features/shared/hooks/useStarred";
import {
  hostname,
  sourceColor,
  sourceLabel,
  timeAgo,
} from "@/features/shared/utils/source";
import { RemovableTag } from "@/features/items/components/RemovableTag";
import {
  TagPicker,
  type TagPickerAnchor,
} from "@/features/items/components/TagPicker";
import { useTagOperations } from "@/features/items/hooks/useTagOperations";
import { toDisplayItem } from "@/features/items/utils/item-helpers";
import { trpc } from "@/lib/trpc/react";
import { CommentTree } from "../components/CommentTree";
import { MarkdownArticle } from "../components/MarkdownArticle";

export default function ReaderPage({ id }: { id: number }) {
  const router = useRouter();
  const tagBtnRef = useRef<HTMLButtonElement | null>(null);
  const [tagAnchor, setTagAnchor] = useState<TagPickerAnchor | null>(null);
  const { isStarred, toggleStarred } = useStarred();
  const { addTag, removeTag } = useTagOperations();

  const detailQuery = trpc.ingest.get.useQuery(
    { id },
    { enabled: Number.isFinite(id) && id > 0 },
  );
  const tagsQuery = trpc.tags.list.useQuery();

  const subjectItemId = detailQuery.data?.item.subjectItemId ?? null;
  useEffect(() => {
    if (subjectItemId !== null) {
      router.replace(`/read/${subjectItemId}`);
    }
  }, [subjectItemId, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !tagAnchor) {
        router.push("/items");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, tagAnchor]);

  if (!Number.isFinite(id) || id <= 0) {
    return <FullMessage tone="error" text="[INVALID ITEM ID]" />;
  }
  if (detailQuery.isLoading) {
    return <FullMessage tone="muted" text="[LOADING ARTICLE…]" />;
  }
  if (detailQuery.error) {
    return (
      <FullMessage
        tone="error"
        text={`[ERROR: ${detailQuery.error.message}]`}
      />
    );
  }
  if (!detailQuery.data) return null;
  if (subjectItemId !== null) {
    return <FullMessage tone="muted" text="[LOADING ARTICLE…]" />;
  }

  const raw = detailQuery.data.item;
  const item = toDisplayItem(raw);
  const isThread = item.source === "hn" || item.source === "reddit";
  const linkedItem = raw.linkedItem;
  const hasLinkedArticle = isThread && linkedItem !== null;
  // Threads without a linked article show the post text in an "Original post"
  // blockquote (excerpt), so the main markdown slot is only used for the
  // attached article (threads) or the item's own extracted body (articles).
  const markdown = hasLinkedArticle
    ? (linkedItem.contentMarkdown ?? linkedItem.contentText ?? "")
    : isThread
      ? ""
      : (raw.contentMarkdown ?? raw.contentText ?? "");
  const srcCol = sourceColor(item.source);
  const starred = isStarred(item.id);
  const comments = raw.comments;
  const hasOwnComments = comments.length > 0;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "56px 1fr",
        height: "100%",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          borderBottom: "1px solid var(--rule)",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "var(--bg)",
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/items")}
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
            border: "1px solid var(--rule)",
            padding: "5px 10px",
            background: "transparent",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ← Hoard
        </button>
        <div
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 11,
            color: "var(--ink-3)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          <span
            style={{
              color: srcCol,
              fontWeight: 700,
              letterSpacing: "0.06em",
            }}
          >
            {sourceLabel(item.source).padEnd(3, "_")}
          </span>
          <span>/</span>
          <span>{item.source === "reddit" ? item.subreddit : item.domain}</span>
          <span>/</span>
          <span style={{ color: "var(--ink-2)" }}>
            nabbed {timeAgo(item.savedAt)} ago
          </span>
        </div>
        <button
          type="button"
          onClick={() => toggleStarred(item.id)}
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: starred ? "var(--accent)" : "var(--ink-2)",
            padding: "5px 10px",
            background: "transparent",
            border: "1px solid transparent",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {starred ? "◆ Shiny" : "◇ Mark shiny"}
        </button>
        <button
          type="button"
          ref={tagBtnRef}
          onClick={() => {
            if (tagAnchor) {
              setTagAnchor(null);
              return;
            }
            if (!tagBtnRef.current) return;
            const r = tagBtnRef.current.getBoundingClientRect();
            setTagAnchor({ top: r.bottom + 4, left: r.left });
          }}
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            background: tagAnchor ? "var(--ink)" : "transparent",
            color: tagAnchor ? "var(--bg)" : "var(--ink-2)",
            border: tagAnchor ? "1px solid var(--ink)" : "1px solid transparent",
            padding: "5px 10px",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="tag" size={12} /> Tag
        </button>
        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ink-2)",
              padding: "5px 10px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
              border: "1px solid transparent",
            }}
          >
            <Icon name="external" size={12} /> Source
          </a>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: hasOwnComments
            ? "minmax(0,1fr) minmax(0, 440px)"
            : "minmax(0,1fr)",
          height: "100%",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            borderRight: hasOwnComments ? "1px solid var(--rule)" : "none",
            overflow: "auto",
            background: "var(--bg)",
          }}
        >
          <div
            style={{
              maxWidth: 680,
              margin: "0 auto",
              padding: "48px 56px 120px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                display: "flex",
                gap: 16,
                marginBottom: 24,
                flexWrap: "wrap",
              }}
            >
              <span>{sourceLabel(item.source)}</span>
              {item.sourceCreatedAt && (
                <>
                  <span>·</span>
                  <span>{item.sourceCreatedAt}</span>
                </>
              )}
              {item.score !== null && (
                <>
                  <span>·</span>
                  <span>↑ {item.score}</span>
                </>
              )}
            </div>

            <h1
              style={{
                fontFamily: "var(--read-font)",
                fontSize: 44,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
                marginBottom: 20,
                textWrap: "balance",
                color: "var(--ink)",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                hyphens: "auto",
              }}
            >
              {item.title}
            </h1>

            <div
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 12,
                color: "var(--ink-3)",
                paddingBottom: 24,
                borderBottom: "1px solid var(--rule)",
                marginBottom: 32,
              }}
            >
              {item.author && <>{item.author} · </>}
              {item.source === "reddit" ? item.subreddit : item.domain}
              <span
                style={{
                  marginLeft: 12,
                  display: "inline-flex",
                  gap: 4,
                  flexWrap: "wrap",
                  verticalAlign: "middle",
                }}
              >
                {item.tags.map((t) => (
                  <RemovableTag
                    key={t.id}
                    tag={t.name}
                    onRemove={() => void removeTag(item.id, t.id)}
                  />
                ))}
              </span>
            </div>

            {isThread && !hasLinkedArticle && item.excerpt && (
              <div
                style={{
                  borderLeft: "3px solid var(--accent)",
                  padding: "16px 20px",
                  background: "var(--bg-alt)",
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--mono-font)",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--ink-3)",
                    marginBottom: 8,
                  }}
                >
                  Original post
                  {item.author ? ` · ${item.author}` : null}
                </div>
                <div
                  style={{
                    fontFamily: "var(--read-font)",
                    fontSize: 16,
                    lineHeight: 1.55,
                    color: "var(--ink)",
                  }}
                >
                  {item.excerpt}
                </div>
              </div>
            )}

            {hasLinkedArticle && linkedItem && (
              <div
                style={{
                  borderLeft: "3px solid var(--accent)",
                  padding: "10px 16px",
                  background: "var(--bg-alt)",
                  marginBottom: 24,
                  fontFamily: "var(--mono-font)",
                  fontSize: 11,
                  color: "var(--ink-3)",
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  Linked article
                </span>
                <span style={{ color: "var(--ink-2)" }}>
                  {linkedItem.title ?? linkedItem.sourceUrl ?? "Untitled"}
                </span>
                {linkedItem.sourceUrl && (
                  <span>· {hostname(linkedItem.sourceUrl)}</span>
                )}
              </div>
            )}

            {markdown.trim().length > 0 ? (
              <MarkdownArticle markdown={markdown} />
            ) : !isThread ? (
              <p
                style={{
                  fontFamily: "var(--mono-font)",
                  color: "var(--ink-3)",
                }}
              >
                [NO ARTICLE CONTENT EXTRACTED]
              </p>
            ) : null}

            {item.sourceUrl && (
              <div
                style={{
                  marginTop: 40,
                  padding: "16px 20px",
                  border: "1px solid var(--rule)",
                  fontFamily: "var(--mono-font)",
                  fontSize: 11,
                  color: "var(--ink-3)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div>
                  <strong style={{ color: "var(--ink-2)" }}>snapshot_id</strong>{" "}
                  &nbsp; rs_{item.id.toString().padStart(6, "0")}
                </div>
                <div>
                  <strong style={{ color: "var(--ink-2)" }}>captured_at</strong>{" "}
                  &nbsp; {new Date(item.savedAt).toISOString()}
                </div>
                <div>
                  <strong style={{ color: "var(--ink-2)" }}>source_url</strong>{" "}
                  &nbsp; {item.sourceUrl}
                </div>
              </div>
            )}
          </div>
        </div>

        {hasOwnComments && (
          <div
            style={{
              overflow: "auto",
              background: "var(--bg-alt)",
            }}
          >
            <div
              style={{
                position: "sticky",
                top: 0,
                background: "var(--bg-alt)",
                borderBottom: "1px solid var(--rule)",
                padding: "14px 20px",
                fontFamily: "var(--mono-font)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                zIndex: 1,
              }}
            >
              <span>Comments · {raw.commentCount || comments.length}</span>
              <span style={{ color: "var(--ink-4)" }}>archived</span>
            </div>
            <CommentTree comments={comments} />
          </div>
        )}
      </div>

      {tagAnchor && (
        <TagPicker
          item={item}
          allTags={tagsQuery.data?.tags ?? []}
          onAddTag={(itemId, name) =>
            void addTag(itemId, name, tagsQuery.data?.tags ?? [])
          }
          onRemoveTag={(itemId, tagId) => void removeTag(itemId, tagId)}
          onClose={() => setTagAnchor(null)}
          anchor={tagAnchor}
        />
      )}
    </div>
  );
}

function FullMessage({
  tone,
  text,
}: {
  tone: "error" | "muted";
  text: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--mono-font)",
          fontSize: 13,
          color: tone === "error" ? "var(--accent)" : "var(--ink-3)",
        }}
      >
        {text}
      </p>
    </div>
  );
}
