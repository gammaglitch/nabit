import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { timeAgo } from "@/features/shared/utils/source";

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

const commentMarkdownComponents = {
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p style={{ margin: "0 0 8px" }} {...props} />
  ),
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a
      style={{
        color: "var(--accent)",
        textDecorationColor: "var(--accent)",
        textUnderlineOffset: 2,
        wordBreak: "break-word",
      }}
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul
      style={{
        margin: "0 0 8px",
        paddingLeft: 20,
        listStyle: "disc",
      }}
      {...props}
    />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol
      style={{
        margin: "0 0 8px",
        paddingLeft: 20,
        listStyle: "decimal",
      }}
      {...props}
    />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => (
    <li style={{ margin: "0 0 2px" }} {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      style={{
        margin: "0 0 8px",
        paddingLeft: 12,
        borderLeft: "2px solid var(--rule)",
        color: "var(--ink-3)",
      }}
      {...props}
    />
  ),
  pre: (props: ComponentPropsWithoutRef<"pre">) => (
    <pre
      style={{
        margin: "0 0 8px",
        padding: 10,
        overflow: "auto",
        border: "1px solid var(--rule-soft)",
        background: "var(--bg-alt)",
        fontFamily: "var(--mono-font)",
        fontSize: 12,
        lineHeight: 1.5,
      }}
      {...props}
    />
  ),
  code: ({
    className,
    children,
    ...props
  }: ComponentPropsWithoutRef<"code">) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code
          className={className}
          style={{ fontFamily: "var(--mono-font)" }}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        style={{
          padding: "1px 4px",
          border: "1px solid var(--rule-soft)",
          background: "var(--bg-alt)",
          fontFamily: "var(--mono-font)",
          fontSize: 12,
        }}
        {...props}
      >
        {children}
      </code>
    );
  },
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong style={{ fontWeight: 600, color: "var(--ink)" }} {...props} />
  ),
  em: (props: ComponentPropsWithoutRef<"em">) => (
    <em style={{ fontStyle: "italic" }} {...props} />
  ),
};

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
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={commentMarkdownComponents}
        >
          {comment.contentMarkdown}
        </ReactMarkdown>
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
            </div>
            <CommentBody comment={c} />
          </div>
        );
      })}
    </div>
  );
}
