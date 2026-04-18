"use client";

import { Command as CommandPrimitive } from "cmdk";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  type NormalizedSource,
  sourceColor,
  sourceLabel,
} from "@/features/shared/utils/source";
import { trpc } from "@/lib/trpc/react";

type CaptureModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function detectType(u: string): NormalizedSource | null {
  if (!u) return null;
  if (u.includes("ycombinator")) return "hn";
  if (u.includes("reddit.com")) return "reddit";
  if (/\/\/(www\.)?(x|twitter)\.com\//i.test(u)) return "x";
  if (/^https?:\/\//.test(u)) return "article";
  return null;
}

function looksLikeUrl(q: string): boolean {
  return /^https?:\/\/\S+$/.test(q.trim());
}

export function CaptureModal({ open, onOpenChange }: CaptureModalProps) {
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "error" | "done">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const ingestMutation = trpc.ingest.ingest.useMutation({
    onSuccess: async () => {
      await utils.ingest.list.invalidate();
      setStatus("done");
      setTimeout(() => {
        setQuery("");
        setStatus("idle");
        onOpenChange(false);
      }, 700);
    },
    onError: (err) => {
      setStatus("error");
      setErrorMessage(err.message);
    },
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setStatus("idle");
      setErrorMessage(null);
    }
  }, [open]);

  const type = detectType(query);
  const nabbing = ingestMutation.isPending;
  const done = status === "done";
  const trimmed = query.trim();
  const canNab = looksLikeUrl(trimmed) && !nabbing;

  const startNab = () => {
    if (!canNab) return;
    setErrorMessage(null);
    setStatus("idle");
    ingestMutation.mutate({ url: trimmed });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!nabbing) onOpenChange(next);
      }}
    >
      <DialogContent className="overflow-hidden p-0">
        <DialogTitle className="sr-only">Nab a URL</DialogTitle>

        <CommandPrimitive
          shouldFilter={false}
          className="flex w-full flex-col bg-[var(--bg)] text-[var(--ink)]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && canNab) {
              e.preventDefault();
              startNab();
            }
          }}
        >
          {/* Header — single flat row: NAB ▸ | input | [source] | Esc */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "18px 20px 14px",
              borderBottom: "1px solid var(--rule)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 12,
                color: "var(--accent)",
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              NAB ▸
            </span>
            <CommandPrimitive.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Paste URL — article, HN, Reddit…"
              disabled={nabbing}
              style={{
                flex: 1,
                fontSize: 19,
                fontWeight: 500,
                fontFamily: "var(--ui-font)",
                letterSpacing: "-0.01em",
                color: "var(--ink)",
                background: "transparent",
                border: 0,
                outline: "none",
                minWidth: 0,
              }}
            />
            {type && (
              <span
                style={{
                  fontFamily: "var(--mono-font)",
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  fontWeight: 700,
                  padding: "3px 6px",
                  border: "1px solid currentColor",
                  color: sourceColor(type),
                  lineHeight: 1,
                }}
              >
                {sourceLabel(type)}
              </span>
            )}
            <span
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
              }}
            >
              Esc
            </span>
          </div>

          {nabbing || done || status === "error" ? (
            <div
              style={{
                padding: "18px 20px",
                fontFamily: "var(--mono-font)",
                fontSize: 12,
                color: "var(--ink-2)",
              }}
            >
              <div style={{ marginBottom: 10 }}>
                {status === "error"
                  ? "× Nab failed."
                  : done
                    ? "✓ Nabbed. Shiny."
                    : "Nabbing…"}
              </div>
              <div
                style={{
                  height: 4,
                  background: "var(--rule-soft)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      status === "error" ? "var(--ink-4)" : "var(--accent)",
                    transform: done ? "scaleX(1)" : "scaleX(0.6)",
                    transformOrigin: "left",
                    transition:
                      "transform 0.9s cubic-bezier(.2,.8,.2,1)",
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: 12,
                  color: "var(--ink-3)",
                  fontSize: 11,
                  lineHeight: 1.6,
                }}
              >
                {status === "error" ? (
                  <div style={{ color: "var(--accent)" }}>{errorMessage}</div>
                ) : done ? (
                  <>
                    <div>✓ captured snapshot</div>
                    <div>✓ extractor ran</div>
                    <div>✓ search index updated</div>
                  </>
                ) : (
                  <>
                    <div>→ fetching {trimmed.slice(0, 60)}…</div>
                    <div>→ running extractor</div>
                    <div>→ capturing comment tree</div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Action row — single "Nab {url}" item when URL looks valid */}
              <CommandPrimitive.List
                style={{
                  maxHeight: 320,
                  overflow: "auto",
                }}
              >
                {canNab && (
                  <CommandPrimitive.Item
                    value="nab"
                    onSelect={startNab}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 20px",
                      borderLeft: "2px solid transparent",
                      fontFamily: "var(--mono-font)",
                      fontSize: 12,
                      color: "var(--ink)",
                      cursor: "pointer",
                    }}
                    className="data-[selected=true]:bg-[var(--bg-alt)] data-[selected=true]:border-l-[var(--accent)]"
                  >
                    <span
                      style={{
                        color: "var(--accent)",
                        fontWeight: 700,
                      }}
                    >
                      ▸
                    </span>
                    <span style={{ flex: 1 }}>
                      Nab{" "}
                      <span style={{ color: "var(--ink-2)" }}>
                        {trimmed.slice(0, 56)}
                        {trimmed.length > 56 ? "…" : ""}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.08em",
                        color: "var(--ink-3)",
                      }}
                    >
                      ↵
                    </span>
                  </CommandPrimitive.Item>
                )}
              </CommandPrimitive.List>

              {/* Footer — hint + char count, always shown in idle state */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 20px",
                  borderTop: "1px solid var(--rule-soft)",
                  fontFamily: "var(--mono-font)",
                  fontSize: 11,
                  color: "var(--ink-3)",
                }}
              >
                <span>
                  {trimmed ? (
                    canNab ? (
                      <>
                        Press{" "}
                        <strong style={{ color: "var(--ink)" }}>↵</strong> to
                        nab
                      </>
                    ) : (
                      "Needs to look like a URL (http:// or https://)"
                    )
                  ) : (
                    "Paste any article, HN thread, or Reddit link"
                  )}
                </span>
                <span>{query.length} chars</span>
              </div>
            </>
          )}
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
