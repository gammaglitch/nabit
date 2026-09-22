"use client";

import type { AppRouter, inferRouterOutputs } from "@repo/trpc/types";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/react";

type TagRun = inferRouterOutputs<AppRouter>["tagging"]["getRun"];

type AutoTagModalProps = {
  /** Fired once the matches are written, so the library can refetch. */
  onApplied?: () => void;
  onClose: () => void;
};

/** Roughly what one item costs to weigh, in dollars. */
const PER_ITEM_USD = 0.0002;

/** Statuses that still want the user: either running, or waiting on a verdict. */
const UNFINISHED = new Set(["pending", "scoring", "scored"]);

function costLabel(itemsTotal: number) {
  const usd = itemsTotal * PER_ITEM_USD;
  return usd < 0.01 ? "<$0.01" : `about $${usd.toFixed(2)}`;
}

const buttonStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--rule)",
  color: "var(--ink-2)",
  fontFamily: "var(--mono-font)",
  fontSize: 10,
  letterSpacing: "0.08em",
  lineHeight: 1,
  padding: "7px 12px",
  textTransform: "uppercase",
};

const noteStyle: CSSProperties = {
  color: "var(--ink-3)",
  fontFamily: "var(--mono-font)",
  fontSize: 10,
  lineHeight: 1.5,
};

/**
 * Weighs chosen tags against the whole library in one pass.
 *
 * Scoring is a paid run over every item that lacks the tags, so the counts are
 * shown and applied as a second, deliberate step: a run that guessed wrong is
 * discarded before it ever touches an item.
 */
export function AutoTagModal({ onApplied, onClose }: AutoTagModalProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const [run, setRun] = useState<TagRun | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const tagsQuery = trpc.tags.list.useQuery();
  const latestQuery = trpc.tagging.latestRun.useQuery();

  const status = run?.status ?? null;
  const scoring = status === "pending" || status === "scoring";
  const owned = scoring || status === "scored";

  const runQuery = trpc.tagging.getRun.useQuery(
    { id: run?.id ?? 0 },
    { enabled: scoring, refetchInterval: scoring ? 2000 : false },
  );

  const estimateQuery = trpc.tagging.estimateRun.useQuery(
    { tagIds: selected },
    { enabled: selected.length > 0 && !owned },
  );

  const startRun = trpc.tagging.startRun.useMutation({
    onSuccess: (started: TagRun) => setRun(started),
  });
  const applyRun = trpc.tagging.applyRun.useMutation({
    onSuccess: (applied: TagRun) => {
      setRun(applied);
      onApplied?.();
    },
  });
  const cancelRun = trpc.tagging.cancelRun.useMutation({
    onSuccess: (cancelled: TagRun) => setRun(cancelled),
  });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  // A run started in another tab, or left scoring when the modal was closed,
  // still owns this modal until it is applied or discarded.
  useEffect(() => {
    const found = latestQuery.data?.run;
    if (!found || !UNFINISHED.has(found.status)) return;
    setRun((current) => current ?? found);
  }, [latestQuery.data]);

  useEffect(() => {
    if (runQuery.data) setRun(runQuery.data);
  }, [runQuery.data]);

  const tags = tagsQuery.data?.tags ?? [];
  const canStart = selected.length > 0 && !startRun.isPending;

  const toggle = (tagId: number) =>
    setSelected((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId],
    );

  return (
    <div
      ref={rootRef}
      style={{
        background: "var(--bg)",
        border: "1px solid var(--ink)",
        boxShadow: "4px 4px 0 var(--ink)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--ui-font)",
        left: "50%",
        maxWidth: "calc(100vw - 32px)",
        position: "fixed",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: 420,
        zIndex: 300,
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: "var(--ink)",
          borderBottom: "1px solid var(--rule)",
          color: "var(--bg)",
          display: "flex",
          fontFamily: "var(--mono-font)",
          fontSize: 10,
          justifyContent: "space-between",
          letterSpacing: "0.12em",
          padding: "10px 12px",
          textTransform: "uppercase",
        }}
      >
        <span>Auto-tag the library</span>
        <span style={{ fontSize: 9 }}>ESC</span>
      </div>

      {run && status === "applied" && (
        <AppliedPanel count={run.appliedCount} onClose={onClose} />
      )}

      {run && scoring && (
        <ScoringPanel
          busy={cancelRun.isPending}
          onCancel={() => cancelRun.mutate({ id: run.id })}
          run={run}
        />
      )}

      {run && status === "scored" && (
        <ScoredPanel
          applying={applyRun.isPending}
          discarding={cancelRun.isPending}
          onApply={() => applyRun.mutate({ id: run.id })}
          onDiscard={() => cancelRun.mutate({ id: run.id })}
          run={run}
        />
      )}

      {!owned && status !== "applied" && (
        <>
          {status === "failed" && (
            <div
              style={{
                borderBottom: "1px solid var(--rule-soft)",
                color: "var(--accent)",
                fontFamily: "var(--mono-font)",
                fontSize: 11,
                padding: "10px 12px",
              }}
            >
              {run?.errorMessage ?? "The run failed."}
            </div>
          )}
          {status === "cancelled" && (
            <div
              style={{
                borderBottom: "1px solid var(--rule-soft)",
                fontFamily: "var(--mono-font)",
                fontSize: 11,
                padding: "10px 12px",
                ...noteStyle,
              }}
            >
              Cancelled.
            </div>
          )}

          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {tags.length === 0 && (
              <div
                style={{
                  padding: 14,
                  textAlign: "center",
                  ...noteStyle,
                  fontSize: 11,
                }}
              >
                No tags yet — make one first, then Jev can spread it.
              </div>
            )}
            {tags.map((tag) => (
              <label
                key={tag.id}
                style={{
                  alignItems: "flex-start",
                  borderBottom: "1px solid var(--rule-soft)",
                  cursor: "pointer",
                  display: "flex",
                  gap: 8,
                  padding: "9px 12px",
                }}
              >
                <input
                  checked={selected.includes(tag.id)}
                  onChange={() => toggle(tag.id)}
                  style={{ marginTop: 2 }}
                  type="checkbox"
                />
                <span style={{ flex: 1 }}>
                  <span
                    style={{
                      color: "var(--ink)",
                      display: "block",
                      fontFamily: "var(--mono-font)",
                      fontSize: 12,
                    }}
                  >
                    #{tag.name}
                  </span>
                  <span
                    style={{
                      ...noteStyle,
                      color: tag.description ? "var(--ink-2)" : "var(--ink-4)",
                      display: "block",
                      fontFamily: "var(--ui-font)",
                      fontSize: 11,
                    }}
                  >
                    {tag.description ?? "no description — judged by name alone"}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div
            style={{
              borderTop: "1px solid var(--rule)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: "12px",
            }}
          >
            {selected.length > 0 && (
              <div style={noteStyle}>
                {estimateQuery.data ? (
                  <>
                    <span style={{ color: "var(--ink-2)" }}>
                      {estimateQuery.data.itemsTotal} items would be weighed
                    </span>
                    {" · "}
                    <span>{costLabel(estimateQuery.data.itemsTotal)}</span>
                  </>
                ) : (
                  <span>Counting what is left to weigh…</span>
                )}
                <span style={{ display: "block" }}>
                  Items already carrying a selected tag are skipped.
                </span>
              </div>
            )}

            {startRun.error && (
              <div
                style={{
                  ...noteStyle,
                  color: "var(--accent)",
                  fontSize: 11,
                }}
              >
                {startRun.error.message}
              </div>
            )}

            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button onClick={onClose} style={buttonStyle} type="button">
                Close
              </button>
              <button
                disabled={!canStart}
                onClick={() => startRun.mutate({ tagIds: selected })}
                style={{
                  ...buttonStyle,
                  background: canStart ? "var(--ink)" : "var(--rule-soft)",
                  border: "1px solid transparent",
                  color: canStart ? "var(--bg)" : "var(--ink-4)",
                  fontWeight: 600,
                }}
                type="button"
              >
                {startRun.isPending ? "Starting…" : "Start"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ScoringPanel({
  busy,
  onCancel,
  run,
}: {
  busy: boolean;
  onCancel: () => void;
  run: TagRun;
}) {
  const percent =
    run.itemsTotal === 0
      ? 0
      : Math.round((run.itemsScored / run.itemsTotal) * 100);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "14px 12px",
      }}
    >
      <div
        aria-label={`${run.itemsScored} of ${run.itemsTotal} items weighed`}
        aria-valuemax={run.itemsTotal}
        aria-valuemin={0}
        aria-valuenow={run.itemsScored}
        role="progressbar"
        style={{
          background: "var(--rule-soft)",
          height: 3,
          overflow: "hidden",
          width: "100%",
        }}
      >
        <div
          style={{
            background: "var(--ink-2)",
            height: "100%",
            transition: "width 300ms ease",
            width: `${percent}%`,
          }}
        />
      </div>

      <div>
        <span style={{ ...noteStyle, color: "var(--ink-2)", fontSize: 11 }}>
          {`${run.itemsScored} / ${run.itemsTotal} weighed`}
        </span>
        <span style={{ ...noteStyle, display: "block" }}>
          {run.status === "pending"
            ? "Queued — the worker picks it up shortly."
            : "Jev is reading. Closing this does not stop the run."}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          disabled={busy}
          onClick={onCancel}
          style={buttonStyle}
          type="button"
        >
          {busy ? "Cancelling…" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

function ScoredPanel({
  applying,
  discarding,
  onApply,
  onDiscard,
  run,
}: {
  applying: boolean;
  discarding: boolean;
  onApply: () => void;
  onDiscard: () => void;
  run: TagRun;
}) {
  const nothing = run.matches.length === 0;
  const total = run.matches.reduce((sum, match) => sum + match.count, 0);

  return (
    <>
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        {nothing ? (
          <div
            style={{
              padding: 14,
              textAlign: "center",
              ...noteStyle,
              fontSize: 11,
            }}
          >
            Nothing matched — no item earned any of those tags.
          </div>
        ) : (
          run.matches.map((match) => (
            <div
              key={match.tagId}
              style={{
                borderBottom: "1px solid var(--rule-soft)",
                padding: "9px 12px",
              }}
            >
              <span
                style={{
                  color: "var(--ink)",
                  display: "block",
                  fontFamily: "var(--mono-font)",
                  fontSize: 12,
                }}
              >
                {`#${match.tagName} — ${match.count} ${
                  match.count === 1 ? "item" : "items"
                }`}
              </span>
              {match.description && (
                <span
                  style={{
                    ...noteStyle,
                    fontFamily: "var(--ui-font)",
                    fontSize: 11,
                  }}
                >
                  {match.description}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <div
        style={{
          alignItems: "center",
          borderTop: "1px solid var(--rule)",
          display: "flex",
          gap: 8,
          padding: 12,
        }}
      >
        <span style={{ ...noteStyle, flex: 1 }}>
          {run.itemsScored} items weighed
        </span>
        <button
          disabled={discarding}
          onClick={onDiscard}
          style={buttonStyle}
          type="button"
        >
          Discard
        </button>
        {!nothing && (
          <button
            disabled={applying}
            onClick={onApply}
            style={{
              ...buttonStyle,
              background: "var(--ink)",
              border: "1px solid transparent",
              color: "var(--bg)",
              fontWeight: 600,
            }}
            type="button"
          >
            {applying ? "Applying…" : `Apply ${total}`}
          </button>
        )}
      </div>
    </>
  );
}

function AppliedPanel({
  count,
  onClose,
}: {
  count: number;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "16px 12px 12px",
      }}
    >
      <span style={{ ...noteStyle, color: "var(--ink)", fontSize: 12 }}>
        Applied {count} tags to the library.
      </span>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onClose} style={buttonStyle} type="button">
          Close
        </button>
      </div>
    </div>
  );
}
