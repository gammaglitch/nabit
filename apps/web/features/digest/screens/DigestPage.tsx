"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MarkdownArticle } from "@/features/reader/components/MarkdownArticle";
import { Icon } from "@/features/shared/components/Icon";
import { SettingsMenu } from "@/features/shared/components/SettingsMenu";
import { trpc } from "@/lib/trpc/react";

type DigestStatus = "pending" | "processing" | "success" | "failed" | "empty";

function statusLabel(status: DigestStatus) {
  switch (status) {
    case "success":
      return "READY";
    case "empty":
      return "NOTHING SAVED";
    case "failed":
      return "FAILED";
    case "processing":
      return "BUILDING…";
    default:
      return "QUEUED";
  }
}

function statusColor(status: DigestStatus) {
  switch (status) {
    case "success":
      return "var(--accent)";
    case "failed":
      return "var(--ink-2)";
    default:
      return "var(--ink-3)";
  }
}

function formatRange(periodStart: string, periodEnd: string) {
  const format = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  // The window is half-open, so the last included day is the day before the
  // closing boundary.
  const lastIncluded = new Date(
    new Date(periodEnd).getTime() - 86_400_000,
  ).toISOString();

  return `${format(periodStart)} – ${format(lastIncluded)}`;
}

const monoLabel = {
  fontFamily: "var(--mono-font)",
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
} as const;

export default function DigestPage() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const listQuery = trpc.digest.list.useQuery({ limit: 50 });
  const digests = listQuery.data?.digests ?? [];

  // Default to the newest digest rather than an empty pane.
  useEffect(() => {
    if (selectedId === null && digests.length > 0) {
      setSelectedId(digests[0].id);
    }
  }, [digests, selectedId]);

  const selected = digests.find((digest) => digest.id === selectedId) ?? null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div
        style={{
          alignItems: "center",
          borderBottom: "1px solid var(--rule)",
          display: "flex",
          gap: 10,
          padding: "14px 20px",
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/items")}
          style={{
            ...monoLabel,
            alignItems: "center",
            background: "transparent",
            border: "1px solid transparent",
            color: "var(--ink-2)",
            cursor: "pointer",
            display: "flex",
            fontSize: 11,
            gap: 6,
            letterSpacing: "0.06em",
            padding: "5px 10px",
          }}
        >
          <Icon name="arrow-right" size={12} /> Library
        </button>
        <span
          style={{
            ...monoLabel,
            color: "var(--accent)",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Weekly digest
        </span>
        <span style={{ flex: 1 }} />
        <SettingsMenu />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 260px) minmax(0, 1fr)",
        }}
      >
        <aside
          style={{
            borderRight: "1px solid var(--rule)",
            minHeight: "calc(100vh - 52px)",
          }}
        >
          {listQuery.isLoading ? (
            <div style={{ ...monoLabel, color: "var(--ink-3)", padding: 20 }}>
              [LOADING…]
            </div>
          ) : listQuery.error ? (
            <div style={{ ...monoLabel, color: "var(--accent)", padding: 20 }}>
              [ERROR: {listQuery.error.message}]
            </div>
          ) : digests.length === 0 ? (
            <div
              style={{
                color: "var(--ink-3)",
                fontFamily: "var(--mono-font)",
                fontSize: 11,
                lineHeight: 1.7,
                padding: 20,
              }}
            >
              No digests yet.
              <div style={{ marginTop: 10, color: "var(--ink-4)" }}>
                Mark articles with ▣ Digest as you nab them. The first digest is
                built once the week closes.
              </div>
            </div>
          ) : (
            digests.map((digest) => {
              const active = digest.id === selectedId;
              return (
                <button
                  key={digest.id}
                  type="button"
                  onClick={() => setSelectedId(digest.id)}
                  style={{
                    background: active ? "var(--bg-alt)" : "transparent",
                    border: 0,
                    borderBottom: "1px solid var(--rule-soft)",
                    borderLeft: active
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                    cursor: "pointer",
                    display: "block",
                    padding: "12px 16px",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      color: "var(--ink)",
                      fontFamily: "var(--mono-font)",
                      fontSize: 11,
                      marginBottom: 4,
                    }}
                  >
                    {formatRange(digest.periodStart, digest.periodEnd)}
                  </div>
                  <div
                    style={{
                      ...monoLabel,
                      color: statusColor(digest.status as DigestStatus),
                    }}
                  >
                    {statusLabel(digest.status as DigestStatus)}
                    {digest.status === "success"
                      ? ` · ${digest.itemCount} item${digest.itemCount === 1 ? "" : "s"}`
                      : ""}
                  </div>
                </button>
              );
            })
          )}
        </aside>

        <main style={{ padding: "28px 32px", minWidth: 0 }}>
          {!selected ? null : selected.summaryMarkdown ? (
            <>
              <MarkdownArticle markdown={selected.summaryMarkdown} />
              {selected.omittedCount > 0 && (
                <div
                  style={{
                    ...monoLabel,
                    borderTop: "1px solid var(--rule-soft)",
                    color: "var(--ink-3)",
                    marginTop: 28,
                    paddingTop: 14,
                  }}
                >
                  {selected.omittedCount} item
                  {selected.omittedCount === 1 ? "" : "s"} could not be
                  summarized
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                color: "var(--ink-3)",
                fontFamily: "var(--mono-font)",
                fontSize: 12,
                lineHeight: 1.8,
              }}
            >
              <div style={{ ...monoLabel, color: "var(--ink-2)" }}>
                {statusLabel(selected.status as DigestStatus)}
              </div>
              <div style={{ marginTop: 12 }}>
                {selected.status === "empty"
                  ? "Nothing was marked for the digest this week."
                  : selected.status === "failed"
                    ? (selected.errorMessage ?? "The digest run failed.")
                    : "This digest has not been built yet."}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
