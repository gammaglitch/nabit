"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabaseAccessToken } from "@/lib/supabase/client";
import { getApiOrigin } from "@/lib/trpc/client";

// Mirrors the API's ExportArticleSummary. Frontend apps must not import from
// apps/api, so the shape is duplicated here intentionally.
interface ArticleSummary {
  id: number;
  sourceType: string;
  title: string | null;
  sourceUrl: string | null;
  ingestedAt: string;
  sourceCreatedAt: string | null;
  contentUpdatedAt: string;
  commentCount: number;
  contentHash: string;
  slug: string;
}

interface ListResult {
  articles: ArticleSummary[];
  nextCursor: string | null;
  total: number;
}

const SINCE_STORAGE_KEY = "nabit-debug-sync-since";

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getBrowserSupabaseAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function DebugSyncPage() {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [lastSince, setLastSince] = useState("");

  const [limit, setLimit] = useState(25);
  const [sourceType, setSourceType] = useState("");
  const [includeComments, setIncludeComments] = useState(true);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [doc, setDoc] = useState("");
  const [docMeta, setDocMeta] = useState<{
    url: string;
    contentType: string;
  } | null>(null);

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLastSince(localStorage.getItem(SINCE_STORAGE_KEY) ?? "");
  }, []);

  const poll = useCallback(
    async (opts: { reset: boolean; since?: string; useCursor?: boolean }) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        params.set("order", "asc");
        if (sourceType.trim()) params.set("sourceType", sourceType.trim());
        if (opts.useCursor && nextCursor) {
          params.set("cursor", nextCursor);
        } else if (opts.since) {
          params.set("since", opts.since);
        }

        const url = `${getApiOrigin()}/export/articles?${params.toString()}`;
        const res = await fetch(url, { headers: await authHeaders() });
        if (!res.ok) {
          throw new Error(
            `${res.status} ${res.statusText} — ${await res.text()}`,
          );
        }
        const data: ListResult = await res.json();

        const merged = opts.reset
          ? data.articles
          : [...articles, ...data.articles];
        setArticles(merged);
        setNextCursor(data.nextCursor);
        setTotal(data.total);

        // Track the high-water mark so "Poll changes" can request only newer
        // rows — the same incremental-sync trick an Obsidian client would use.
        const maxSeen = merged.reduce(
          (max, a) => (a.contentUpdatedAt > max ? a.contentUpdatedAt : max),
          "",
        );
        if (maxSeen) {
          setLastSince(maxSeen);
          localStorage.setItem(SINCE_STORAGE_KEY, maxSeen);
        }

        setStatus(`GET ${url} → ${data.articles.length} article(s)`);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [articles, limit, nextCursor, sourceType],
  );

  const openArticle = useCallback(
    async (id: number) => {
      setSelectedId(id);
      setDoc("Loading…");
      setDocMeta(null);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("comments", includeComments ? "true" : "false");
        const url = `${getApiOrigin()}/export/articles/${id}?${params.toString()}`;
        const res = await fetch(url, { headers: await authHeaders() });
        if (!res.ok) {
          throw new Error(
            `${res.status} ${res.statusText} — ${await res.text()}`,
          );
        }
        const text = await res.text();
        setDoc(text);
        setDocMeta({ url, contentType: res.headers.get("content-type") ?? "" });
      } catch (e) {
        setDoc("");
        setError(String(e));
      }
    },
    [includeComments],
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(420px, 1fr) 1fr",
        height: "100vh",
        background: "var(--bg)",
        color: "var(--ink)",
        fontFamily: "var(--ui-font)",
      }}
    >
      <section
        style={{
          borderRight: "1px solid var(--rule-soft)",
          overflow: "auto",
          padding: 16,
        }}
      >
        <h1 style={{ fontSize: 16, margin: "0 0 4px" }}>export sync trial</h1>
        <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 12px" }}>
          Drives the API&apos;s <code>/export</code> endpoints the way a polling
          client (e.g. Obsidian) would. Dev only.
        </p>

        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <label
              style={{
                fontSize: 12,
                display: "flex",
                gap: 4,
                alignItems: "center",
              }}
            >
              limit
              <input
                type="number"
                min={1}
                max={500}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 1)}
                style={{ width: 70, ...inputStyle }}
              />
            </label>
            <label
              style={{
                fontSize: 12,
                display: "flex",
                gap: 4,
                alignItems: "center",
              }}
            >
              sourceType
              <input
                type="text"
                placeholder="(any)"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                style={{ width: 130, ...inputStyle }}
              />
            </label>
            <label
              style={{
                fontSize: 12,
                display: "flex",
                gap: 4,
                alignItems: "center",
              }}
            >
              <input
                type="checkbox"
                checked={includeComments}
                onChange={(e) => setIncludeComments(e.target.checked)}
              />
              comments
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setNextCursor(null);
                void poll({ reset: true, since: "" });
              }}
              style={buttonStyle}
            >
              Full resync
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setNextCursor(null);
                void poll({ reset: true, since: lastSince });
              }}
              style={buttonStyle}
            >
              Poll changes
            </button>
            <button
              type="button"
              disabled={loading || !nextCursor}
              onClick={() => void poll({ reset: false, useCursor: true })}
              style={buttonStyle}
            >
              Load more
            </button>
          </div>

          {error ? (
            <div style={{ fontSize: 12, color: "var(--accent)" }}>{error}</div>
          ) : (
            <div
              style={{
                fontSize: 12,
                color: "var(--ink-3)",
                wordBreak: "break-all",
              }}
            >
              {status || "Run a poll to load articles."}
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            since:{" "}
            <span style={{ fontFamily: "var(--mono-font)" }}>
              {lastSince || "—"}
            </span>{" "}
            · loaded {articles.length}
            {total !== null ? ` / ${total}` : ""}
          </div>
        </div>

        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
        >
          <thead>
            <tr style={{ textAlign: "left", color: "var(--ink-3)" }}>
              <th style={cellStyle}>id</th>
              <th style={cellStyle}>title</th>
              <th style={cellStyle}>source</th>
              <th style={cellStyle}>cmts</th>
              <th style={cellStyle}>content_updated_at</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((a) => (
              <tr
                key={a.id}
                onClick={() => void openArticle(a.id)}
                style={{
                  cursor: "pointer",
                  background:
                    selectedId === a.id ? "var(--bg-alt)" : "transparent",
                }}
              >
                <td style={{ ...cellStyle, fontFamily: "var(--mono-font)" }}>
                  {a.id}
                </td>
                <td style={cellStyle}>{a.title ?? "(untitled)"}</td>
                <td style={{ ...cellStyle, color: "var(--ink-3)" }}>
                  {a.sourceType}
                </td>
                <td style={{ ...cellStyle, fontFamily: "var(--mono-font)" }}>
                  {a.commentCount}
                </td>
                <td
                  style={{
                    ...cellStyle,
                    fontFamily: "var(--mono-font)",
                    color: "var(--ink-3)",
                  }}
                >
                  {a.contentUpdatedAt}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ overflow: "auto", padding: 16 }}>
        <strong style={{ fontSize: 13 }}>
          {selectedId
            ? `#${selectedId} — exact Markdown document`
            : "Select an article to preview its Markdown"}
        </strong>
        {docMeta && (
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              margin: "6px 0",
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontFamily: "var(--mono-font)" }}>
              {docMeta.contentType}
            </span>
            <span>{doc.length} chars</span>
            <a
              href={docMeta.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: "var(--mono-font)", color: "var(--accent)" }}
            >
              open raw
            </a>
          </div>
        )}
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "var(--mono-font)",
            fontSize: 12,
            background: "var(--surface)",
            border: "1px solid var(--rule-soft)",
            borderRadius: 6,
            padding: 12,
            marginTop: 8,
          }}
        >
          {doc}
        </pre>
      </section>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  font: "inherit",
  padding: "4px 6px",
  border: "1px solid var(--rule-soft)",
  borderRadius: 4,
  background: "var(--surface)",
  color: "inherit",
};

const buttonStyle: React.CSSProperties = {
  font: "inherit",
  padding: "5px 10px",
  border: "1px solid var(--rule-soft)",
  borderRadius: 4,
  background: "var(--surface)",
  color: "inherit",
  cursor: "pointer",
};

const cellStyle: React.CSSProperties = {
  padding: "4px 6px",
  borderBottom: "1px solid var(--rule-soft)",
  verticalAlign: "top",
};
