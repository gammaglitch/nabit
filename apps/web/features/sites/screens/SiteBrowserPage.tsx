"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MarkdownArticle } from "@/features/reader/components/MarkdownArticle";
import { Icon } from "@/features/shared/components/Icon";
import { SettingsMenu } from "@/features/shared/components/SettingsMenu";
import { hostname } from "@/features/shared/utils/source";
import { trpc } from "@/lib/trpc/react";
import { CrawlProgress } from "../components/CrawlProgress";
import { SiteTree } from "../components/SiteTree";
import { StatusBadge } from "./SitesPage";
import { useCrawl, useCrawls } from "../hooks/useCrawls";
import {
  buildSiteTree,
  type CrawlPage,
  flattenVisible,
  isReadable,
  pageLabel,
} from "../utils/tree";

export default function SiteBrowserPage({ id }: { id: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const crawlQuery = useCrawl(id);
  const { cancelCrawl } = useCrawls();

  const pages = useMemo(
    () => crawlQuery.data?.pages ?? [],
    [crawlQuery.data?.pages],
  );
  const tree = useMemo(() => buildSiteTree(pages), [pages]);

  // Everything starts open: a crawl of a handbook is most useful when you can
  // see the whole shape of it at once.
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const isExpanded = useCallback(
    (pageId: number) => !collapsedIds.has(pageId),
    [collapsedIds],
  );

  const visible = useMemo(
    () => flattenVisible(tree, isExpanded),
    [tree, isExpanded],
  );

  // Selection lives in the URL so a sub-page can be linked and survives a
  // reload — the whole point of browsing an archived site.
  const selectedParam = searchParams.get("page");
  const selectedId = selectedParam ? Number(selectedParam) : null;
  const selectedPage =
    pages.find((page) => page.id === selectedId) ??
    pages.find((page) => page.isRoot && isReadable(page)) ??
    pages.find(isReadable) ??
    null;

  const select = useCallback(
    (page: CrawlPage) => {
      router.replace(`/sites/${id}?page=${page.id}`, { scroll: false });
    },
    [id, router],
  );

  const toggle = useCallback((pageId: number) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }, []);

  // j/k moves through the tree as rendered, skipping pages with nothing to
  // read — a queued or skipped page would just blank the reading pane.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (event.key === "Escape") {
        router.push("/sites");
        return;
      }
      if (event.key !== "j" && event.key !== "k") return;

      const readable = visible.filter(isReadable);
      if (readable.length === 0) return;
      const current = readable.findIndex(
        (page) => page.id === selectedPage?.id,
      );
      const nextIndex =
        event.key === "j"
          ? Math.min(current + 1, readable.length - 1)
          : Math.max(current - 1, 0);
      const next = readable[current < 0 ? 0 : nextIndex];
      if (next) {
        event.preventDefault();
        select(next);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, select, selectedPage?.id, visible]);

  const detailQuery = trpc.ingest.get.useQuery(
    { id: selectedPage?.itemId ?? 0 },
    { enabled: selectedPage?.itemId != null },
  );

  if (!Number.isFinite(id) || id <= 0) {
    return <Centered>[INVALID SITE ID]</Centered>;
  }
  if (crawlQuery.isLoading) {
    return <Centered>Loading site…</Centered>;
  }
  if (crawlQuery.error || !crawlQuery.data) {
    return <Centered>{crawlQuery.error?.message ?? "Site not found"}</Centered>;
  }

  const { crawl } = crawlQuery.data;
  const item = detailQuery.data?.item;
  const markdown = item?.contentMarkdown ?? item?.contentText ?? "";
  const active = crawl.status === "running" || crawl.status === "queued";

  return (
    <div
      style={{
        background: "var(--bg)",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          alignItems: "center",
          borderBottom: "1px solid var(--rule)",
          display: "flex",
          gap: 14,
          height: 64,
          padding: "0 24px",
        }}
      >
        <button
          onClick={() => router.push("/sites")}
          style={{
            background: "none",
            border: "none",
            color: "var(--ink-3)",
            cursor: "pointer",
            display: "flex",
          }}
          title="All sites"
          type="button"
        >
          <Icon name="arrow-right" size={16} style={{ rotate: "180deg" }} />
        </button>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--ui-font)",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {crawl.label ?? hostname(crawl.rootUrl)}
          </div>
          <div
            style={{
              color: "var(--ink-4)",
              fontFamily: "var(--mono-font)",
              fontSize: 11,
            }}
          >
            {hostname(crawl.rootUrl)} · {crawl.pagesDone} pages
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <StatusBadge status={crawl.status} />
        {active && (
          <button
            onClick={() => void cancelCrawl(crawl.id)}
            style={{
              background: "none",
              border: "1px solid var(--rule-soft)",
              color: "var(--ink-2)",
              cursor: "pointer",
              fontFamily: "var(--ui-font)",
              fontSize: 11,
              padding: "5px 10px",
            }}
            type="button"
          >
            Stop
          </button>
        )}
        <SettingsMenu />
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          minHeight: 0,
        }}
      >
        <aside
          style={{
            borderRight: "1px solid var(--rule)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {active && (
            <div
              style={{
                borderBottom: "1px solid var(--rule-soft)",
                padding: "12px 12px 10px",
              }}
            >
              <CrawlProgress crawl={crawl} />
            </div>
          )}
          <nav style={{ flex: 1, overflowY: "auto" }}>
            <SiteTree
              isExpanded={isExpanded}
              nodes={tree}
              onSelect={select}
              onToggle={toggle}
              selectedId={selectedPage?.id ?? null}
            />
          </nav>
        </aside>

        <main style={{ minHeight: 0, overflowY: "auto" }}>
          {!selectedPage && (
            <Centered>
              {active
                ? "Nothing archived yet — the crawl is still running."
                : "This site has no readable pages."}
            </Centered>
          )}

          {selectedPage && (
            <article style={{ margin: "0 auto", maxWidth: 720, padding: 32 }}>
              <h1
                style={{
                  fontFamily: "var(--read-font)",
                  fontSize: 30,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                }}
              >
                {pageLabel(selectedPage)}
              </h1>
              <a
                href={selectedPage.url}
                rel="noreferrer"
                target="_blank"
                style={{
                  alignItems: "center",
                  color: "var(--ink-3)",
                  display: "inline-flex",
                  fontFamily: "var(--mono-font)",
                  fontSize: 11,
                  gap: 5,
                  marginTop: 8,
                  textDecoration: "none",
                }}
              >
                {selectedPage.url}
                <Icon name="external" size={11} />
              </a>

              <div style={{ marginTop: 28 }}>
                {detailQuery.isLoading && <Muted>Loading page…</Muted>}
                {!detailQuery.isLoading && markdown.trim().length > 0 && (
                  <MarkdownArticle markdown={markdown} />
                )}
                {!detailQuery.isLoading && markdown.trim().length === 0 && (
                  <Muted>
                    Nothing was extracted from this page — it may be an index
                    with no prose of its own.
                  </Muted>
                )}
              </div>

              {selectedPage.itemId !== null && (
                <button
                  onClick={() => router.push(`/read/${selectedPage.itemId}`)}
                  style={{
                    background: "none",
                    border: "1px solid var(--rule-soft)",
                    color: "var(--ink-2)",
                    cursor: "pointer",
                    fontFamily: "var(--ui-font)",
                    fontSize: 11,
                    marginTop: 32,
                    padding: "6px 12px",
                  }}
                  type="button"
                >
                  Open in reader
                </button>
              )}
            </article>
          )}
        </main>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        alignItems: "center",
        color: "var(--ink-3)",
        display: "flex",
        fontFamily: "var(--ui-font)",
        fontSize: 13,
        height: "100%",
        justifyContent: "center",
        padding: 32,
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        color: "var(--ink-3)",
        fontFamily: "var(--ui-font)",
        fontSize: 13,
      }}
    >
      {children}
    </p>
  );
}
