"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCrawls } from "../hooks/useCrawls";

type StartCrawlModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted?: (crawlId: number) => void;
  /** Prefills the form, so "crawl this whole site" carries the URL over. */
  initialUrl?: string;
};

function looksLikeUrl(value: string) {
  return /^https?:\/\/\S+$/.test(value.trim());
}

const labelStyle = {
  color: "var(--ink-3)",
  display: "block",
  fontFamily: "var(--ui-font)",
  fontSize: 11,
  letterSpacing: "0.08em",
  marginBottom: 6,
  textTransform: "uppercase",
} as const;

const inputStyle = {
  background: "var(--surface)",
  border: "1px solid var(--rule-soft)",
  color: "var(--ink)",
  fontFamily: "var(--ui-font)",
  fontSize: 13,
  padding: "8px 10px",
  width: "100%",
} as const;

export function StartCrawlModal({
  open,
  onOpenChange,
  onStarted,
  initialUrl,
}: StartCrawlModalProps) {
  const { isStarting, startCrawl, startError } = useCrawls();

  const [url, setUrl] = useState("");
  const [scope, setScope] = useState<"host" | "path">("host");
  const [followExternal, setFollowExternal] = useState(false);
  const [maxDepth, setMaxDepth] = useState(3);
  const [maxPages, setMaxPages] = useState(200);
  const [excludePattern, setExcludePattern] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl ?? "");
    setScope("host");
    setFollowExternal(false);
    setMaxDepth(3);
    setMaxPages(200);
    setExcludePattern("");
    setError(null);
  }, [open, initialUrl]);

  const trimmed = url.trim();
  const canStart = looksLikeUrl(trimmed) && !isStarting;

  const submit = async () => {
    if (!canStart) return;
    setError(null);
    try {
      const result = await startCrawl({
        excludePattern: excludePattern.trim() || null,
        followExternal,
        maxDepth,
        maxPages,
        scope,
        url: trimmed,
      });
      onOpenChange(false);
      onStarted?.(result.crawl.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isStarting) onOpenChange(next);
      }}
    >
      <DialogContent className="overflow-hidden p-0">
        <div
          style={{
            borderBottom: "1px solid var(--rule)",
            padding: "18px 20px 14px",
          }}
        >
          <DialogTitle
            style={{
              fontFamily: "var(--ui-font)",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            Crawl a site
          </DialogTitle>
          <DialogDescription
            style={{
              color: "var(--ink-3)",
              fontFamily: "var(--ui-font)",
              fontSize: 12,
              marginTop: 4,
            }}
          >
            Point this at an index or table of contents. Every page it links to,
            within the scope you choose, gets archived.
          </DialogDescription>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            padding: "18px 20px",
          }}
        >
          <div>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: htmlFor targets the input below */}
            <label htmlFor="crawl-url" style={labelStyle}>
              Start from
            </label>
            <input
              id="crawl-url"
              autoFocus
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="https://docs.example.com/guide/"
              style={inputStyle}
              value={url}
            />
          </div>

          <div>
            <span style={labelStyle}>Follow links</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <ScopeChoice
                checked={scope === "host"}
                description="Any page on this exact hostname."
                label="Anywhere on this host"
                onSelect={() => setScope("host")}
              />
              <ScopeChoice
                checked={scope === "path"}
                description="Only pages under the starting URL's directory."
                label="Under this path only"
                onSelect={() => setScope("path")}
              />
            </div>
          </div>

          <label
            style={{
              alignItems: "flex-start",
              cursor: "pointer",
              display: "flex",
              gap: 8,
            }}
          >
            <input
              checked={followExternal}
              onChange={(event) => setFollowExternal(event.target.checked)}
              style={{ marginTop: 2 }}
              type="checkbox"
            />
            <span
              style={{
                color: "var(--ink-2)",
                fontFamily: "var(--ui-font)",
                fontSize: 12,
              }}
            >
              Also archive pages this site links out to
              <span style={{ color: "var(--ink-3)", display: "block" }}>
                One hop only — their own links are never followed.
              </span>
            </span>
          </label>

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: htmlFor targets the input below */}
              <label htmlFor="crawl-depth" style={labelStyle}>
                Max depth
              </label>
              <input
                id="crawl-depth"
                max={10}
                min={0}
                onChange={(event) => setMaxDepth(Number(event.target.value))}
                style={inputStyle}
                type="number"
                value={maxDepth}
              />
            </div>
            <div style={{ flex: 1 }}>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: htmlFor targets the input below */}
              <label htmlFor="crawl-pages" style={labelStyle}>
                Max pages
              </label>
              <input
                id="crawl-pages"
                max={5000}
                min={1}
                onChange={(event) => setMaxPages(Number(event.target.value))}
                style={inputStyle}
                type="number"
                value={maxPages}
              />
            </div>
          </div>

          <div>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: htmlFor targets the input below */}
            <label htmlFor="crawl-exclude" style={labelStyle}>
              Skip URLs matching (optional)
            </label>
            <input
              id="crawl-exclude"
              onChange={(event) => setExcludePattern(event.target.value)}
              placeholder="/changelog/|/tags/"
              style={inputStyle}
              value={excludePattern}
            />
          </div>

          {(error ?? startError) && (
            <div
              style={{
                color: "var(--accent)",
                fontFamily: "var(--ui-font)",
                fontSize: 12,
              }}
            >
              {error ?? startError}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              disabled={isStarting}
              onClick={() => onOpenChange(false)}
              style={{
                background: "none",
                border: "1px solid var(--rule-soft)",
                color: "var(--ink-2)",
                cursor: "pointer",
                fontFamily: "var(--ui-font)",
                fontSize: 12,
                padding: "8px 14px",
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              disabled={!canStart}
              onClick={() => void submit()}
              style={{
                background: canStart ? "var(--ink)" : "var(--rule-soft)",
                border: "none",
                color: canStart ? "var(--bg)" : "var(--ink-4)",
                cursor: canStart ? "pointer" : "default",
                fontFamily: "var(--ui-font)",
                fontSize: 12,
                fontWeight: 600,
                padding: "8px 16px",
              }}
              type="button"
            >
              {isStarting ? "Starting…" : "Start crawl"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScopeChoice({
  checked,
  description,
  label,
  onSelect,
}: {
  checked: boolean;
  description: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <label
      style={{
        alignItems: "flex-start",
        cursor: "pointer",
        display: "flex",
        gap: 8,
      }}
    >
      <input
        checked={checked}
        name="crawl-scope"
        onChange={onSelect}
        style={{ marginTop: 2 }}
        type="radio"
      />
      <span
        style={{
          color: "var(--ink-2)",
          fontFamily: "var(--ui-font)",
          fontSize: 12,
        }}
      >
        {label}
        <span style={{ color: "var(--ink-3)", display: "block" }}>
          {description}
        </span>
      </span>
    </label>
  );
}
