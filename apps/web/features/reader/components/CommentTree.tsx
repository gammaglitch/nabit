import { timeAgo } from "@/features/shared/utils/source";
import { CompactMarkdown } from "./CompactMarkdown";

const MAX_DEPTH = 8;

function commentDepth(path: string) {
  return Math.min(path.split(".").length - 1, MAX_DEPTH);
}

export type CommentNode = {
  author: string | null;
  contentMarkdown: string | null;
  contentText: string;
  externalId: string | null;
  id: number;
  metadata: Record<string, unknown>;
  parentExternalId: string | null;
  path: string;
  sourceCreatedAt: string | null;
};

/**
 * Set by the ingest merge when a re-fetch found the source reporting a comment
 * as deleted. The body next to it is the one we archived before that happened,
 * which is the whole reason the merge keeps it.
 */
function removedAtSource(comment: CommentNode) {
  return typeof comment.metadata.removedFromSourceAt === "string";
}

function CommentBody({ comment }: { comment: CommentNode }) {
  const baseStyle = {
    fontFamily: "var(--read-font)",
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--ink-2)",
  } as const;

  if (comment.contentMarkdown) {
    return (
      <div style={baseStyle}>
        <CompactMarkdown markdown={comment.contentMarkdown} />
      </div>
    );
  }

  return (
    <div style={{ ...baseStyle, whiteSpace: "pre-wrap" }}>
      {comment.contentText}
    </div>
  );
}

export function CommentTree({ comments }: { comments: CommentNode[] }) {
  if (comments.length === 0) {
    return (
      <div
        style={{
          padding: "40px 20px",
          fontFamily: "var(--mono-font)",
          fontSize: 12,
          color: "var(--ink-3)",
          lineHeight: 1.6,
        }}
      >
        No comments on this source.
      </div>
    );
  }

  return (
    <div>
      {comments.map((c) => {
        const depth = commentDepth(c.path);
        const points =
          typeof c.metadata.points === "number" ? c.metadata.points : null;
        return (
          <div
            key={c.id}
            style={{
              position: "relative",
              padding: "14px 20px",
              borderBottom: "1px solid var(--rule-soft)",
              paddingLeft: 20 + depth * 18,
              borderLeft: depth > 0 ? "1px solid var(--rule-soft)" : "none",
              marginLeft: depth > 0 ? depth * 4 : 0,
            }}
          >
            <div
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 11,
                color: "var(--ink-3)",
                marginBottom: 6,
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              {c.author && (
                <span style={{ color: "var(--ink)", fontWeight: 600 }}>
                  {c.author}
                </span>
              )}
              {points !== null && (
                <>
                  <span>·</span>
                  <span>↑ {points}</span>
                </>
              )}
              {c.sourceCreatedAt && (
                <>
                  <span>·</span>
                  <span>{timeAgo(c.sourceCreatedAt)}</span>
                </>
              )}
              {removedAtSource(c) && (
                <span
                  title="This comment has since been deleted at the source. What is shown is the archived copy."
                  style={{
                    border: "1px solid var(--rule-soft)",
                    borderRadius: 2,
                    fontSize: 9,
                    letterSpacing: "0.08em",
                    padding: "1px 4px",
                    textTransform: "uppercase",
                  }}
                >
                  deleted at source
                </span>
              )}
            </div>
            <CommentBody comment={c} />
          </div>
        );
      })}
    </div>
  );
}
