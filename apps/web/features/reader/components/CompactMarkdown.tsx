import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Markdown styling for the reader's narrow side rail — comments and chat
// replies. Deliberately tighter and smaller than MarkdownArticle, which is
// tuned for the wide article column.
const compactMarkdownComponents = {
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

export function CompactMarkdown({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={compactMarkdownComponents}
    >
      {markdown}
    </ReactMarkdown>
  );
}
