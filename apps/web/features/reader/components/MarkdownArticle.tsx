"use client";

import {
  Children,
  type ComponentPropsWithoutRef,
  isValidElement,
  type ReactNode,
  useMemo,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getApiOrigin } from "@/lib/trpc/client";

function resolveAssetSrc(src: string | undefined) {
  if (!src) return src;
  if (src.startsWith("/assets/")) {
    return `${getApiOrigin()}${src}`;
  }
  return src;
}

function OutboundLink({ href, ...props }: ComponentPropsWithoutRef<"a">) {
  // A bare `#fragment` is not outbound — it points into the page already on
  // screen. Opening it in a new tab reloads the whole app at a URL that differs
  // only by its hash, which is never what a table of contents meant.
  const sameDocument = typeof href === "string" && href.startsWith("#");

  return (
    <a
      href={href}
      style={{
        color: "var(--accent)",
        textDecorationColor: "var(--accent)",
        textUnderlineOffset: 2,
      }}
      {...(sameDocument ? {} : { rel: "noreferrer", target: "_blank" })}
      {...props}
    />
  );
}

/**
 * The id a heading's own permalink anchor points at, if it has one.
 *
 * Rentry, MkDocs, Sphinx and GitHub all render a heading with a small
 * self-link beside it ("Permanent link", "¶"). Turndown keeps that as a link
 * with no text, and it is the only surviving record of the id the page's own
 * table of contents refers to: the visible heading text cannot be slugified
 * back to it once there is an emoji in the way — `📝 ➜ Table of Contents` is
 * `#table-of-contents`. A slugifying rehype plugin would miss for the same
 * reason, which is why there isn't one.
 *
 * Only an empty link counts. A heading that merely contains a normal link
 * ("See [the appendix](#appendix)") must not adopt that link's target as its
 * own id.
 */
function permalinkId(children: ReactNode): string | undefined {
  let id: string | undefined;

  Children.forEach(children, (child) => {
    if (id !== undefined || !isValidElement(child)) return;

    const props = child.props as { children?: ReactNode; href?: unknown };
    if (typeof props.href !== "string" || !props.href.startsWith("#")) return;

    // "Empty" covers both the truly textless anchor and the ¶/🔗 glyph some
    // renderers use, but never anything with words in it.
    const text = Children.toArray(props.children).join("").trim();
    if (text.length > 2 || /[\p{L}\p{N}]/u.test(text)) return;

    id = props.href.slice(1);
  });

  return id;
}

const markdownComponents = {
  h1: ({ children, ...props }: ComponentPropsWithoutRef<"h1">) => (
    <h1
      id={permalinkId(children)}
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
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: ComponentPropsWithoutRef<"h2">) => (
    <h2
      id={permalinkId(children)}
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
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: ComponentPropsWithoutRef<"h3">) => (
    <h3
      id={permalinkId(children)}
      style={{
        fontFamily: "var(--read-font)",
        fontSize: 19,
        fontWeight: 600,
        lineHeight: 1.3,
        margin: "24px 0 10px",
        color: "var(--ink)",
      }}
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }: ComponentPropsWithoutRef<"h4">) => (
    <h4
      id={permalinkId(children)}
      style={{
        fontFamily: "var(--read-font)",
        fontSize: 17,
        fontWeight: 600,
        lineHeight: 1.3,
        margin: "20px 0 8px",
        color: "var(--ink)",
      }}
      {...props}
    >
      {children}
    </h4>
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
  a: (props: ComponentPropsWithoutRef<"a">) => <OutboundLink {...props} />,
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
  img: ({ alt, src, ...props }: ComponentPropsWithoutRef<"img">) => (
    // biome-ignore lint/performance/noImgElement: markdown image, not part of next/image flow
    <img
      alt={alt ?? ""}
      src={resolveAssetSrc(src as string | undefined)}
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

/**
 * The two link props are a pair, and the type enforces it: the click handler
 * calls preventDefault() before delegating, so a resolver without a follower
 * would turn every matched link into a no-op.
 *
 * `resolveInternalHref` maps an href from the markdown to an in-app URL, or
 * null to leave the link pointing where the page pointed it. `onFollow...` is
 * called in place of a real navigation so the site browser can swap panes
 * rather than reload the app.
 *
 * Only the site browser passes these. Everywhere else an archived link stays
 * external, because "the archived copy of this URL" is only a question a crawl
 * can answer — see features/sites/utils/archive-links.ts.
 */
export type MarkdownArticleProps = { markdown: string } & (
  | {
      resolveInternalHref: (href: string | undefined) => string | null;
      onFollowInternalHref: (href: string) => void;
    }
  | { resolveInternalHref?: undefined; onFollowInternalHref?: undefined }
);

export function MarkdownArticle({
  markdown,
  resolveInternalHref,
  onFollowInternalHref,
}: MarkdownArticleProps) {
  const components = useMemo(() => {
    if (!resolveInternalHref) return markdownComponents;

    return {
      ...markdownComponents,
      a: ({ href, ...props }: ComponentPropsWithoutRef<"a">) => {
        const internal = resolveInternalHref(href);
        if (!internal) return <OutboundLink href={href} {...props} />;

        // A cross-page `#anchor` is dropped by the resolver and lands at the
        // top of the target page. Nothing to preserve it for yet: no rehype
        // plugin assigns heading ids, so the fragment has no target on the
        // destination either. Revisit together with heading anchors.

        return (
          <a
            href={internal}
            onClick={(event) => {
              // Leave the modified clicks to the browser, so "open in new tab"
              // on an archived link still works.
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                event.button !== 0
              ) {
                return;
              }
              event.preventDefault();
              onFollowInternalHref?.(internal);
            }}
            style={{
              color: "var(--accent)",
              // Dotted, where an outbound link is solid: this one keeps you
              // inside the archive rather than sending you to the live web.
              textDecorationColor: "var(--accent)",
              textDecorationStyle: "dotted",
              textUnderlineOffset: 2,
            }}
            title="Archived copy — opens in this site"
            {...props}
          />
        );
      },
    };
  }, [resolveInternalHref, onFollowInternalHref]);

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {markdown}
    </ReactMarkdown>
  );
}
