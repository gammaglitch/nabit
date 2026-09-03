"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/features/shared/components/Icon";
import { SettingsMenu } from "@/features/shared/components/SettingsMenu";
import { hostname } from "@/features/shared/utils/source";
import { CrawlProgress } from "../components/CrawlProgress";
import { StartCrawlModal } from "../components/StartCrawlModal";
import { useCrawlList, useCrawls } from "../hooks/useCrawls";

export default function SitesPage() {
  const router = useRouter();
  const crawlsQuery = useCrawlList();
  const { cancelCrawl, deleteCrawl } = useCrawls();
  const [startOpen, setStartOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const crawls = crawlsQuery.data?.crawls ?? [];

  return (
    <div
      style={{
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
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
          onClick={() => router.push("/items")}
          style={{
            background: "none",
            border: "none",
            color: "var(--ink-3)",
            cursor: "pointer",
            display: "flex",
          }}
          title="Back to library"
          type="button"
        >
          <Icon name="arrow-right" size={16} style={{ rotate: "180deg" }} />
        </button>
        <h1
          style={{
            flex: 1,
            fontFamily: "var(--ui-font)",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Sites
        </h1>
        <button
          onClick={() => setStartOpen(true)}
          style={{
            alignItems: "center",
            background: "var(--ink)",
            border: "none",
            color: "var(--bg)",
            cursor: "pointer",
            display: "flex",
            fontFamily: "var(--ui-font)",
            fontSize: 12,
            fontWeight: 600,
            gap: 6,
            padding: "8px 14px",
          }}
          type="button"
        >
          <Icon name="plus" size={13} />
          Crawl a site
        </button>
        <SettingsMenu />
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {crawlsQuery.isLoading && <Muted>Loading…</Muted>}

        {!crawlsQuery.isLoading && crawls.length === 0 && (
          <div style={{ maxWidth: 460, paddingTop: 40 }}>
            <p
              style={{
                fontFamily: "var(--ui-font)",
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              No sites yet
            </p>
            <p
              style={{
                color: "var(--ink-3)",
                fontFamily: "var(--ui-font)",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              Point a crawl at a documentation index or a table of contents and
              nabit will archive every page it links to, then let you read them
              here as one site.
            </p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {crawls.map((crawl) => (
            <article
              key={crawl.id}
              style={{
                border: "1px solid var(--rule-soft)",
                background: "var(--surface)",
                padding: 16,
              }}
            >
              <div style={{ alignItems: "baseline", display: "flex", gap: 10 }}>
                <button
                  onClick={() => router.push(`/sites/${crawl.id}`)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--ink)",
                    cursor: "pointer",
                    fontFamily: "var(--ui-font)",
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    padding: 0,
                    textAlign: "left",
                  }}
                  type="button"
                >
                  {crawl.label ?? hostname(crawl.rootUrl)}
                </button>
                <span
                  style={{
                    color: "var(--ink-4)",
                    fontFamily: "var(--mono-font)",
                    fontSize: 11,
                  }}
                >
                  {hostname(crawl.rootUrl)}
                </span>
                <span style={{ flex: 1 }} />
                <StatusBadge status={crawl.status} />
              </div>

              <div style={{ marginTop: 12 }}>
                <CrawlProgress crawl={crawl} />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <SmallButton onClick={() => router.push(`/sites/${crawl.id}`)}>
                  Browse
                </SmallButton>
                {(crawl.status === "running" || crawl.status === "queued") && (
                  <SmallButton onClick={() => void cancelCrawl(crawl.id)}>
                    Stop
                  </SmallButton>
                )}
                {confirmDelete === crawl.id ? (
                  <>
                    <SmallButton
                      danger
                      onClick={async () => {
                        await deleteCrawl(crawl.id, false);
                        setConfirmDelete(null);
                      }}
                    >
                      Keep pages
                    </SmallButton>
                    <SmallButton
                      danger
                      onClick={async () => {
                        await deleteCrawl(crawl.id, true);
                        setConfirmDelete(null);
                      }}
                    >
                      Delete pages too
                    </SmallButton>
                    <SmallButton onClick={() => setConfirmDelete(null)}>
                      Cancel
                    </SmallButton>
                  </>
                ) : (
                  <SmallButton onClick={() => setConfirmDelete(crawl.id)}>
                    Delete
                  </SmallButton>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      <StartCrawlModal
        onOpenChange={setStartOpen}
        onStarted={(id) => router.push(`/sites/${id}`)}
        open={startOpen}
      />
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

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "failed" || status === "cancelled"
      ? "var(--accent)"
      : status === "done"
        ? "var(--ink-3)"
        : "var(--ink)";

  return (
    <span
      style={{
        border: `1px solid ${tone}`,
        color: tone,
        fontFamily: "var(--mono-font)",
        fontSize: 10,
        letterSpacing: "0.08em",
        padding: "2px 6px",
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

function SmallButton({
  children,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: `1px solid ${danger ? "var(--accent)" : "var(--rule-soft)"}`,
        color: danger ? "var(--accent)" : "var(--ink-2)",
        cursor: "pointer",
        fontFamily: "var(--ui-font)",
        fontSize: 11,
        padding: "5px 10px",
      }}
      type="button"
    >
      {children}
    </button>
  );
}
