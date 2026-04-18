import { timeAgo } from "@/features/shared/utils/source";

const MAX_DEPTH = 8;

function commentDepth(path: string) {
  return Math.min(path.split(".").length - 1, MAX_DEPTH);
}

export type CommentNode = {
  author: string | null;
  contentText: string;
  externalId: string | null;
  id: number;
  metadata: Record<string, unknown>;
  parentExternalId: string | null;
  path: string;
  sourceCreatedAt: string | null;
};

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
            </div>
            <div
              style={{
                fontFamily: "var(--read-font)",
                fontSize: 14,
                lineHeight: 1.55,
                color: "var(--ink-2)",
                whiteSpace: "pre-wrap",
              }}
            >
              {c.contentText}
            </div>
          </div>
        );
      })}
    </div>
  );
}
