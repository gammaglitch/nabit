import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents = {
  h1: (props: ComponentPropsWithoutRef<"h1">) => (
    <h1
      style={{
        fontFamily: "var(--read-font)",
        fontSize: 32,
        fontWeight: 700,
        lineHeight: 1.15,
        letterSpacing: "-0.02em",
        margin: "32px 0 16px",
        color: "var(--ink)",
      }}
      {...props}
    />
  ),
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2
      style={{
        fontFamily: "var(--read-font)",
        fontSize: 24,
        fontWeight: 700,
        lineHeight: 1.25,
        letterSpacing: "-0.015em",
        margin: "32px 0 12px",
        color: "var(--ink)",
      }}
      {...props}
    />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3
      style={{
        fontFamily: "var(--read-font)",
        fontSize: 19,
        fontWeight: 600,
        lineHeight: 1.3,
        margin: "24px 0 10px",
        color: "var(--ink)",
      }}
      {...props}
    />
  ),
  h4: (props: ComponentPropsWithoutRef<"h4">) => (
    <h4
      style={{
        fontFamily: "var(--read-font)",
        fontSize: 17,
        fontWeight: 600,
        lineHeight: 1.3,
        margin: "20px 0 8px",
        color: "var(--ink)",
      }}
      {...props}
    />
  ),
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p
      style={{
        fontFamily: "var(--read-font)",
        fontSize: 17,
        lineHeight: 1.6,
        color: "var(--ink)",
        marginBottom: 20,
      }}
      {...props}
    />
  ),
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a
      style={{
        color: "var(--accent)",
        textDecorationColor: "var(--accent)",
        textUnderlineOffset: 2,
      }}
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul
      style={{
        fontFamily: "var(--read-font)",
        fontSize: 17,
        lineHeight: 1.7,
        color: "var(--ink)",
        marginBottom: 20,
        paddingLeft: 24,
        listStyle: "disc",
      }}
      {...props}
    />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol
      style={{
        fontFamily: "var(--read-font)",
        fontSize: 17,
        lineHeight: 1.7,
        color: "var(--ink)",
        marginBottom: 20,
        paddingLeft: 24,
        listStyle: "decimal",
      }}
      {...props}
    />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => (
    <li style={{ lineHeight: 1.6, marginBottom: 6 }} {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      style={{
        margin: "20px 0",
        paddingLeft: 16,
        borderLeft: "2px solid var(--rule)",
        fontStyle: "italic",
        color: "var(--ink-2)",
      }}
      {...props}
    />
  ),
  hr: (props: ComponentPropsWithoutRef<"hr">) => (
    <hr
      style={{
        margin: "32px 0",
        border: 0,
        borderTop: "1px solid var(--rule-soft)",
      }}
      {...props}
    />
  ),
  pre: (props: ComponentPropsWithoutRef<"pre">) => (
    <pre
      style={{
        margin: "20px 0",
        padding: 16,
        overflow: "auto",
        border: "1px solid var(--rule-soft)",
        background: "var(--bg-alt)",
        fontFamily: "var(--mono-font)",
        fontSize: 13,
        lineHeight: 1.6,
        color: "var(--ink)",
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
          padding: "1px 5px",
          border: "1px solid var(--rule-soft)",
          background: "var(--bg-alt)",
          fontFamily: "var(--mono-font)",
          fontSize: 13,
          color: "var(--ink)",
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
  img: ({ alt, ...props }: ComponentPropsWithoutRef<"img">) => (
    // biome-ignore lint/performance/noImgElement: markdown image, not part of next/image flow
    <img
      alt={alt ?? ""}
      style={{
        margin: "20px 0",
        maxWidth: "100%",
        border: "1px solid var(--rule-soft)",
      }}
      {...props}
    />
  ),
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div style={{ margin: "20px 0", overflow: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 15,
          color: "var(--ink)",
        }}
        {...props}
      />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th
      style={{
        border: "1px solid var(--rule-soft)",
        background: "var(--bg-alt)",
        padding: "8px 12px",
        textAlign: "left",
        fontWeight: 600,
      }}
      {...props}
    />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td
      style={{
        border: "1px solid var(--rule-soft)",
        padding: "8px 12px",
      }}
      {...props}
    />
  ),
};

export function MarkdownArticle({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {markdown}
    </ReactMarkdown>
  );
}
