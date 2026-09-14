"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RemovableTag } from "@/features/items/components/RemovableTag";
import {
  TagPicker,
  type TagPickerAnchor,
} from "@/features/items/components/TagPicker";
import { useDeleteItem } from "@/features/items/hooks/useDeleteItem";
import { useDigestOptIn } from "@/features/items/hooks/useDigestOptIn";
import { useReextract } from "@/features/items/hooks/useReextract";
import { useTagOperations } from "@/features/items/hooks/useTagOperations";
import { toDisplayItem } from "@/features/items/utils/item-helpers";
import { DigestToggle } from "@/features/shared/components/DigestToggle";
import { Icon } from "@/features/shared/components/Icon";
import { SettingsMenu } from "@/features/shared/components/SettingsMenu";
import { useStarred } from "@/features/shared/hooks/useStarred";
import {
  hostname,
  linkedUrlFromMetadata,
  sourceColor,
  sourceLabel,
  timeAgo,
} from "@/features/shared/utils/source";
import { SiteTree } from "@/features/sites/components/SiteTree";
import { useArchiveLinks } from "@/features/sites/hooks/useArchiveLinks";
import { useCrawl } from "@/features/sites/hooks/useCrawls";
import {
  buildSiteTree,
  type CrawlPage,
  flattenVisible,
  isReadable,
} from "@/features/sites/utils/tree";
import { trpc } from "@/lib/trpc/react";
import { ArticleChat } from "../components/ArticleChat";
import { CommentTree } from "../components/CommentTree";
import { DeleteItemButton } from "../components/DeleteItemButton";
import { MarkdownArticle } from "../components/MarkdownArticle";
import { ReextractButton } from "../components/ReextractButton";

type RailTab = "comments" | "chat";

export default function ReaderPage({ id }: { id: number }) {
  const router = useRouter();
  const tagBtnRef = useRef<HTMLButtonElement | null>(null);
  const [tagAnchor, setTagAnchor] = useState<TagPickerAnchor | null>(null);
  const [railTab, setRailTab] = useState<RailTab>("comments");
  const { isStarred, toggleStarred } = useStarred();
  const { addTag, removeTag } = useTagOperations();
  const { toggleDigestOptIn, isTogglingDigestOptIn } = useDigestOptIn();
  const { reextractItem, isReextracting } = useReextract();
  const { deleteItem, isDeleting } = useDeleteItem();

  const detailQuery = trpc.ingest.get.useQuery(
    { id },
    { enabled: Number.isFinite(id) && id > 0 },
  );
  const tagsQuery = trpc.tags.list.useQuery();

  // A crawled page is one of many, and the reader is where you land on it from
  // the library. The tree, and links that stay inside the archive, are what
  // make it browsable from here rather than only from /sites/<id>.
  //
  // `useCrawl` ignores a non-positive id, so this is a no-op for an ordinary
  // item — which is every item that is not part of a crawl.
  const crawl = detailQuery.data?.item.crawl ?? null;
  const crawlQuery = useCrawl(crawl?.id ?? 0);
  const crawlPages = useMemo(
    () => crawlQuery.data?.pages ?? [],
    [crawlQuery.data?.pages],
  );
  const tree = useMemo(() => buildSiteTree(crawlPages), [crawlPages]);

  // Open by default, like the site browser: seeing the shape of the site is
  // the point of having the rail at all.
  const [treeOpen, setTreeOpen] = useState(true);
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const isExpanded = useCallback(
    (pageId: number) => !collapsedIds.has(pageId),
    [collapsedIds],
  );
  const toggleCollapsed = useCallback((pageId: number) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }, []);
  const visible = useMemo(
    () => flattenVisible(tree, isExpanded),
    [tree, isExpanded],
  );

  const currentPageId = crawl?.pageId ?? null;
  const currentPage =
    crawlPages.find((page) => page.id === currentPageId) ?? null;

  const openPage = useCallback(
    (page: CrawlPage) => {
      if (page.itemId === null) return;
      router.push(`/read/${page.itemId}`);
    },
    [router],
  );

  // Resolved against the crawl's own record of this page rather than the item's
  // sourceUrl, so both surfaces use the same base and agree on which links are
  // internal. Falls back while `crawl.get` is still in flight.
  const resolveInternalHref = useArchiveLinks({
    crawlId: crawl?.id ?? null,
    currentUrl: currentPage?.url ?? detailQuery.data?.item.sourceUrl ?? null,
    pages: crawlPages,
    target: "reader",
  });
  const followInternalHref = useCallback(
    (href: string) => router.push(href),
    [router],
  );

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

  // j/k walks the site the way it does in the site browser, in tree order and
  // skipping pages with nothing to read. Bound only for a crawled page, so the
  // keys stay free everywhere else, and never while the chat box has focus.
  useEffect(() => {
    if (currentPageId === null) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "j" && event.key !== "k") return;
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const readable = visible.filter(isReadable);
      if (readable.length === 0) return;
      const current = readable.findIndex((page) => page.id === currentPageId);
      const nextIndex =
        event.key === "j"
          ? Math.min(current + 1, readable.length - 1)
          : Math.max(current - 1, 0);
      const next = readable[current < 0 ? 0 : nextIndex];
      if (next && next.id !== currentPageId) {
        event.preventDefault();
        openPage(next);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentPageId, openPage, visible]);

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
  // The page a thread points at. The linked item only exists when ingest
  // archived it as a new child, so fall back to the URL the extractor kept —
  // it survives a failed fetch or an article that was already nabbed alone.
  const articleUrl = isThread
    ? (linkedItem?.sourceUrl ?? linkedUrlFromMetadata(raw.metadata))
    : null;
  // Threads without a linked article show the post text in an "Original post"
  // blockquote (excerpt), so the main markdown slot is only used for the
  // attached article (threads) or the item's own extracted body (articles).
  const markdown = hasLinkedArticle
    ? (linkedItem.contentMarkdown ?? linkedItem.contentText ?? "")
    : isThread
      ? ""
      : (raw.contentMarkdown ?? raw.contentText ?? "");
  // Re-extract whatever produced the body on screen: for a thread with an
  // attached article that is the linked item, not the thread itself.
  const bodyItemId = hasLinkedArticle && linkedItem ? linkedItem.id : raw.id;
  const srcCol = sourceColor(item.source);
  // The rail needs a tree to show: a crawl whose pages have not arrived yet
  // would otherwise take 300px to display nothing.
  const showTree = raw.crawl !== null && treeOpen && tree.length > 0;
  const starred = isStarred(item.id);
  const comments = raw.comments;
  const hasOwnComments = comments.length > 0;
  // The rail is always present now that chat lives there; the Comments tab
  // only exists for items that actually have any.
  const activeTab: RailTab = hasOwnComments ? railTab : "chat";

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
        {/* A crawled page is not reachable from the library — the list shows
            one row for the whole site — so this is its only way back. */}
        {raw.crawl && (
          <button
            type="button"
            onClick={() =>
              router.push(`/sites/${raw.crawl?.id}?page=${raw.crawl?.pageId}`)
            }
            title={`Part of ${raw.crawl.label ?? "an archived site"}`}
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
              maxWidth: 220,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            ⌂ {raw.crawl.label ?? "Site"}
          </button>
        )}
        {raw.crawl && (
          // The label says this is not a lone page; the button opens the tree
          // that proves it. Distinct from the ⌂ button beside it, which leaves
          // for the site's own page — where the crawl itself is managed.
          <button
            type="button"
            aria-expanded={treeOpen}
            onClick={() => setTreeOpen((open) => !open)}
            title={
              treeOpen
                ? "Hide the site tree"
                : `Show the ${raw.crawl.pageCount} archived pages of this site`
            }
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: treeOpen ? "var(--accent)" : "var(--ink-2)",
              border: `1px solid ${treeOpen ? "var(--accent)" : "var(--rule)"}`,
              padding: "5px 10px",
              background: "transparent",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            ☰ Site · {raw.crawl.pageCount} pages
            {raw.crawl.pagesQueued > 0 && " · archiving"}
          </button>
        )}
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
            border: tagAnchor
              ? "1px solid var(--ink)"
              : "1px solid transparent",
            padding: "5px 10px",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="tag" size={12} /> Tag
        </button>
        {/* A thread has two originals: the article it links to and the
            discussion itself. "Source" alone would be ambiguous there. */}
        {articleUrl && <ExternalLinkButton href={articleUrl} label="Article" />}
        {item.sourceUrl && (
          <ExternalLinkButton
            href={item.sourceUrl}
            label={articleUrl ? "Thread" : "Source"}
          />
        )}
        <ReextractButton
          disabled={isReextracting}
          onReextract={() => reextractItem(bodyItemId)}
          style={{ fontSize: 11, letterSpacing: "0.06em", padding: "5px 10px" }}
        />
        <DigestToggle
          digestOptIn={raw.digestOptIn}
          disabled={isTogglingDigestOptIn}
          onToggle={() => {
            void toggleDigestOptIn(raw.id, !raw.digestOptIn);
          }}
          style={{ fontSize: 11, letterSpacing: "0.06em", padding: "5px 10px" }}
        />
        <DeleteItemButton
          disabled={isDeleting}
          // Deletes the item this page is about, never the linked article a
          // thread points at — that one is reachable and deletable on its own.
          onDelete={async () => {
            await deleteItem(raw.id);
            // Nothing left to read: the query would 404 on the next refetch.
            router.push("/items");
          }}
          style={{ fontSize: 11, letterSpacing: "0.06em", padding: "5px 10px" }}
        />
        <SettingsMenu />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: showTree
            ? "300px minmax(0,1fr) minmax(0, 440px)"
            : "minmax(0,1fr) minmax(0, 440px)",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {showTree && (
          <aside
            style={{
              borderRight: "1px solid var(--rule)",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
              background: "var(--bg)",
            }}
          >
            <nav aria-label="Site pages" style={{ flex: 1, overflowY: "auto" }}>
              <SiteTree
                isExpanded={isExpanded}
                nodes={tree}
                onSelect={openPage}
                onToggle={toggleCollapsed}
                selectedId={currentPageId}
              />
            </nav>
          </aside>
        )}
        <div
          style={{
            borderRight: "1px solid var(--rule)",
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

            {articleUrl && (
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
                <a
                  href={articleUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "var(--ink-2)",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                    overflowWrap: "anywhere",
                  }}
                >
                  {linkedItem?.title ?? articleUrl}
                </a>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  · {hostname(articleUrl)}
                  <Icon name="external" size={10} />
                </span>
                {!hasLinkedArticle && <span>· not archived</span>}
              </div>
            )}

            {markdown.trim().length > 0 ? (
              raw.crawl ? (
                <MarkdownArticle
                  markdown={markdown}
                  onFollowInternalHref={followInternalHref}
                  resolveInternalHref={resolveInternalHref}
                />
              ) : (
                <MarkdownArticle markdown={markdown} />
              )
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

        <div
          style={{
            display: "grid",
            gridTemplateRows: "auto minmax(0, 1fr)",
            height: "100%",
            minHeight: 0,
            background: "var(--bg-alt)",
          }}
        >
          <div
            style={{
              borderBottom: "1px solid var(--rule)",
              padding: "0 20px",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {hasOwnComments && (
              <RailTabButton
                active={activeTab === "comments"}
                label={`Comments · ${raw.commentCount || comments.length}`}
                onClick={() => setRailTab("comments")}
              />
            )}
            <RailTabButton
              active={activeTab === "chat"}
              label="Ask"
              onClick={() => setRailTab("chat")}
            />
          </div>

          {activeTab === "comments" ? (
            <div style={{ overflow: "auto" }}>
              <CommentTree comments={comments} />
            </div>
          ) : (
            <ArticleChat itemId={item.id} />
          )}
        </div>
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

function ExternalLinkButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={href}
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
      <Icon name="external" size={12} /> {label}
    </a>
  );
}

function RailTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: "var(--mono-font)",
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: active ? "var(--ink)" : "var(--ink-3)",
        background: "transparent",
        border: "none",
        borderBottom: active
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        padding: "14px 8px 12px",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
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
