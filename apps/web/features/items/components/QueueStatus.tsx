"use client";

import type { AppRouter, inferRouterOutputs } from "@repo/trpc/types";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type NormalizedSource,
  sourceColor,
  sourceLabel,
} from "@/features/shared/utils/source";
import { trpc } from "@/lib/trpc/react";

type QueueStatusProps = {
  hidden?: boolean;
  onOpenAutoTag: () => void;
  onOpenCapture: () => void;
};

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Job = RouterOutputs["ingest"]["jobs"]["jobs"][number];

function sourceFromJob(job: Job): NormalizedSource {
  if (job.ingestor === "reddit") return "reddit";
  if (job.ingestor === "hacker_news") return "hn";
  if (job.ingestor === "tweet") return "x";
  return "article";
}

function domainFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("reddit.com")) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts[0] === "r" && parts[1]) {
        return `reddit.com/r/${parts[1]}`;
      }
    }
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function stateLabel(job: Job) {
  if (job.status === "processing") return "nabbing";
  if (job.status === "success") return "nabbed";
  if (job.status === "failed") return job.errorMessage ?? "failed";
  return "waiting";
}

export function QueueStatus({
  hidden,
  onOpenAutoTag,
  onOpenCapture,
}: QueueStatusProps) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const seenSuccessful = useRef(new Set<number>());

  // A tagging pass is background work like any capture, and it runs for
  // minutes. Without it here the only sign anything was happening was the
  // modal that started it.
  const tagRunQuery = trpc.tagging.latestRun.useQuery(undefined, {
    refetchInterval: (query) => {
      const status = query.state.data?.run?.status;
      return status === "pending" || status === "scoring" ? 2500 : 30_000;
    },
  });
  const tagRun = tagRunQuery.data?.run ?? null;
  const tagRunActive =
    tagRun?.status === "pending" || tagRun?.status === "scoring";
  // A pass that has finished scoring is the state that most needs saying: it
  // has spent the money and will do nothing else until someone approves it.
  const tagRunReady = tagRun?.status === "scored";
  const tagRunFailed = tagRun?.status === "failed";
  const tagRunShown = tagRunActive || tagRunReady || tagRunFailed;
  const readyCount =
    tagRun?.matches.reduce((total, match) => total + match.count, 0) ?? 0;

  const jobsQuery = trpc.ingest.jobs.useQuery(
    { limit: 20 },
    {
      // Poll fast while there's active work; back off to a slow heartbeat
      // when the queue is fully drained so we still notice jobs enqueued
      // from other sessions (discord bot, REST clients) without burning
      // requests every 2.5s for nothing.
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 2500;
        // Counts, not the visible slice: a backlog deeper than the window is
        // exactly when we most want to keep polling. Optional because web and
        // API deploy as separate containers — an API still serving the old
        // shape would otherwise crash the interval callback.
        const hasActive = data.counts
          ? data.counts.queued + data.counts.processing > 0
          : data.jobs.some(
              (job) => job.status === "queued" || job.status === "processing",
            );
        return hasActive ? 2500 : 30_000;
      },
    },
  );

  const jobs = jobsQuery.data?.jobs ?? [];
  // `working` is the visible slice — the front of the queue. `activeCount` is
  // how deep the queue actually is, which is the number worth showing: a bulk
  // import can be hundreds, and counting the slice would just pin the badge at
  // the window size while the worker drained the far end out of sight.
  const counts = jobsQuery.data?.counts;
  const working = jobs.filter(
    (job) => job.status === "queued" || job.status === "processing",
  );
  const activeCount = counts
    ? counts.queued + counts.processing
    : working.length;
  const hiddenActive = Math.max(0, activeCount - working.length);
  const failed = jobs.filter((job) => job.status === "failed");
  const recent = jobs.filter((job) => job.status === "success").slice(0, 5);

  useEffect(() => {
    let sawNewSuccess = false;
    const visibleIds = new Set<number>();
    for (const job of jobs) {
      visibleIds.add(job.id);
      if (job.status !== "success") continue;
      if (seenSuccessful.current.has(job.id)) continue;
      seenSuccessful.current.add(job.id);
      sawNewSuccess = true;
    }
    // Drop tracked ids that have rolled out of the visible window so the
    // set stays bounded over long-lived sessions.
    for (const id of seenSuccessful.current) {
      if (!visibleIds.has(id)) seenSuccessful.current.delete(id);
    }
    if (sawNewSuccess) {
      void utils.ingest.list.invalidate();
    }
  }, [jobs, utils]);

  const grouped = useMemo(
    () => ({
      failed,
      recent,
      working,
    }),
    [failed, recent, working],
  );

  if (hidden) {
    return null;
  }

  const idle = activeCount === 0 && failed.length === 0 && !tagRunShown;

  // Composed rather than branched: a capture and a tagging pass can be going
  // at once, and the badge is the only thing on screen that says so.
  const badgeParts: string[] = [];
  if (activeCount > 0) badgeParts.push(`${activeCount} active`);
  if (failed.length > 0) badgeParts.push(`${failed.length} failed`);
  if (tagRun && tagRunActive) {
    badgeParts.push(`tagging ${tagRun.itemsScored}/${tagRun.itemsTotal}`);
  }
  if (tagRunReady) badgeParts.push(`${readyCount} tags ready`);
  if (tagRunFailed) badgeParts.push("tagging failed");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          fontFamily: "var(--mono-font)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color:
            failed.length > 0
              ? "var(--accent)"
              : idle
                ? "var(--ink-3)"
                : "var(--ink)",
          background: "var(--bg)",
          border: `1px solid ${failed.length > 0 ? "var(--accent)" : "var(--rule)"}`,
          padding: "7px 11px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          zIndex: 90,
          boxShadow: idle ? "none" : "3px 3px 0 var(--ink)",
        }}
      >
        {!idle && (
          <span
            style={{
              animation: "nabitPulse 1.1s ease-in-out infinite",
              background: failed.length > 0 ? "var(--accent)" : "var(--ink)",
              display: "inline-block",
              height: 8,
              width: 8,
            }}
          />
        )}
        <span>{idle ? "queue idle" : badgeParts.join(" · ")}</span>
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 58,
            width: "min(520px, calc(100vw - 32px))",
            maxHeight: "min(620px, calc(100vh - 90px))",
            overflow: "auto",
            background: "var(--bg)",
            border: "1px solid var(--ink)",
            boxShadow: "5px 5px 0 var(--ink)",
            zIndex: 95,
          }}
        >
          <div
            style={{
              alignItems: "flex-end",
              borderBottom: "1px solid var(--rule)",
              display: "flex",
              gap: 16,
              padding: "18px 20px 14px",
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  color: "var(--ink-3)",
                  fontFamily: "var(--mono-font)",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Capture Queue
              </div>
              <div
                style={{
                  color: "var(--ink)",
                  fontFamily: "var(--read-font)",
                  fontSize: 26,
                  fontWeight: 700,
                  marginTop: 2,
                }}
              >
                Queue
              </div>
            </div>
            <QueueStat label="active" value={activeCount} />
            <QueueStat
              label="failed"
              value={failed.length}
              accent={failed.length > 0}
            />
          </div>

          {jobsQuery.error && (
            <div style={messageStyle}>[ERROR: {jobsQuery.error.message}]</div>
          )}

          {!jobsQuery.error && jobs.length === 0 && (
            <div style={messageStyle}>
              <div style={{ marginBottom: 14 }}>Nothing is queued.</div>
              <button type="button" onClick={onOpenCapture} style={buttonStyle}>
                Nab URL
              </button>
            </div>
          )}

          {tagRunQuery.error && (
            <div style={{ ...messageStyle, color: "var(--accent)" }}>
              [TAGGING STATUS UNAVAILABLE: {tagRunQuery.error.message}]
            </div>
          )}

          {tagRun && tagRunShown && (
            <QueueSection
              title={tagRunReady ? "Tags ready to apply" : "Auto-tagging"}
              accent={tagRunFailed}
            >
              <TagRunRow
                onOpen={tagRunReady ? onOpenAutoTag : undefined}
                readyCount={readyCount}
                run={tagRun}
              />
            </QueueSection>
          )}

          {grouped.working.length > 0 && (
            <QueueSection title="Working">
              {grouped.working.map((job, index) => (
                <QueueRow key={job.id} job={job} position={index + 1} />
              ))}
              {hiddenActive > 0 && (
                <div style={moreStyle}>+ {hiddenActive} more waiting</div>
              )}
            </QueueSection>
          )}

          {grouped.failed.length > 0 && (
            <QueueSection title="Failed" accent>
              {grouped.failed.map((job) => (
                <QueueRow key={job.id} job={job} />
              ))}
            </QueueSection>
          )}

          {grouped.recent.length > 0 && (
            <QueueSection title="Recently Nabbed">
              {grouped.recent.map((job) => (
                <QueueRow key={job.id} job={job} />
              ))}
            </QueueSection>
          )}
        </div>
      )}
    </>
  );
}

/**
 * The bulk tagging pass: while it runs, when it is waiting to be approved,
 * and when it gave up. A finished pass used to vanish from here entirely,
 * which left the tags it had scored sitting unapplied and unmentioned.
 */
function TagRunRow({
  onOpen,
  readyCount,
  run,
}: {
  /** Set only when there is something to approve. */
  onOpen?: () => void;
  readyCount: number;
  run: NonNullable<RouterOutputs["tagging"]["latestRun"]["run"]>;
}) {
  const share =
    run.itemsTotal > 0
      ? Math.min(100, Math.round((run.itemsScored / run.itemsTotal) * 100))
      : 0;
  const failing = run.status === "failed";

  return (
    <button
      disabled={!onOpen}
      onClick={onOpen}
      type="button"
      style={{
        background: "transparent",
        border: 0,
        borderBottom: "1px solid var(--rule-soft)",
        cursor: onOpen ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "12px 20px",
        textAlign: "left",
        width: "100%",
      }}
    >
      <div
        style={{
          color: "var(--ink-2)",
          display: "flex",
          fontFamily: "var(--mono-font)",
          fontSize: 11,
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: failing ? "var(--accent)" : undefined }}>
          {run.status === "pending"
            ? "waiting for the worker"
            : run.status === "scoring"
              ? "weighing tags against the library"
              : failing
                ? "the pass gave up"
                : `${readyCount} tags ready — click to review`}
        </span>
        <span style={{ color: "var(--ink-3)" }}>
          {run.itemsScored}/{run.itemsTotal}
        </span>
      </div>
      {!failing && (
        <div
          aria-label={`${share}% scored`}
          role="progressbar"
          aria-valuemax={run.itemsTotal}
          aria-valuemin={0}
          aria-valuenow={run.itemsScored}
          style={{ background: "var(--rule-soft)", height: 4, width: "100%" }}
        >
          <div
            style={{
              background: "var(--ink)",
              height: "100%",
              width: `${share}%`,
            }}
          />
        </div>
      )}
      <div
        style={{
          color: failing ? "var(--accent)" : "var(--ink-3)",
          fontFamily: "var(--mono-font)",
          fontSize: 10,
          overflowWrap: "anywhere",
        }}
      >
        {failing
          ? (run.errorMessage ?? "No reason was recorded.")
          : `${readyCount} match${readyCount === 1 ? "" : "es"}${
              run.status === "scoring" ? " so far" : ""
            }`}
        {run.failedCount > 0 ? ` · ${run.failedCount} could not be scored` : ""}
        {!failing && " · nothing is applied until you approve it"}
      </div>
    </button>
  );
}

function QueueStat({
  accent,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: number;
}) {
  return (
    <div style={{ textAlign: "right" }}>
      <div
        style={{
          color: accent ? "var(--accent)" : "var(--ink)",
          fontFamily: "var(--mono-font)",
          fontSize: 24,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {value.toString().padStart(2, "0")}
      </div>
      <div
        style={{
          color: "var(--ink-3)",
          fontFamily: "var(--mono-font)",
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function QueueSection({
  accent,
  children,
  title,
}: {
  accent?: boolean;
  children: ReactNode;
  title: string;
}) {
  return (
    <section>
      <div
        style={{
          borderBottom: "1px solid var(--rule-soft)",
          color: accent ? "var(--accent)" : "var(--ink-2)",
          fontFamily: "var(--mono-font)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          padding: "13px 20px 8px",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function QueueRow({ job, position }: { job: Job; position?: number }) {
  const source = sourceFromJob(job);
  const color = sourceColor(source);
  const label = stateLabel(job);

  return (
    <div
      style={{
        alignItems: "center",
        borderBottom: "1px solid var(--rule-soft)",
        display: "grid",
        fontFamily: "var(--mono-font)",
        fontSize: 12,
        gap: 12,
        gridTemplateColumns: "32px 52px minmax(0, 1fr)",
        padding: "11px 20px",
      }}
    >
      <div style={{ color: "var(--ink-3)", fontSize: 11 }}>
        {position?.toString().padStart(2, "0") ?? <StateGlyph job={job} />}
      </div>
      <span
        style={{
          border: "1px solid currentColor",
          color,
          fontSize: 9,
          fontWeight: 700,
          lineHeight: 1,
          padding: "2px 5px",
          width: "fit-content",
        }}
      >
        {sourceLabel(source)}
      </span>
      <div style={{ minWidth: 0, overflow: "hidden" }}>
        <div
          style={{
            color: job.status === "failed" ? "var(--ink-2)" : "var(--ink)",
            fontFamily: "var(--read-font)",
            fontSize: 13,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {job.result?.sourceType ? job.result.normalizedUrl : job.url}
        </div>
        <div
          style={{
            alignItems: "center",
            color: "var(--ink-3)",
            display: "flex",
            fontSize: 10,
            gap: 8,
            marginTop: 3,
          }}
        >
          <span>{domainFromUrl(job.url)}</span>
          <span style={{ color: "var(--ink-4)" }}>·</span>
          <span
            style={{
              color: job.status === "failed" ? "var(--accent)" : undefined,
              fontWeight: job.status === "failed" ? 600 : 400,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

function StateGlyph({ job }: { job: Job }) {
  if (job.status === "processing") {
    return (
      <span
        style={{
          animation: "nabitPulse 1.1s ease-in-out infinite",
          background: "var(--accent)",
          display: "inline-block",
          height: 10,
          width: 10,
        }}
      />
    );
  }
  if (job.status === "success") {
    return <span style={{ color: "var(--accent)", fontSize: 14 }}>◆</span>;
  }
  if (job.status === "failed") {
    return <span style={{ color: "var(--accent)", fontSize: 14 }}>!</span>;
  }
  return <span style={{ color: "var(--ink-4)" }}>◇</span>;
}

const buttonStyle = {
  background: "var(--ink)",
  border: "1px solid var(--ink)",
  color: "var(--bg)",
  cursor: "pointer",
  fontFamily: "var(--mono-font)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  padding: "9px 14px",
  textTransform: "uppercase" as const,
};

const moreStyle = {
  borderBottom: "1px solid var(--rule-soft)",
  color: "var(--ink-3)",
  fontFamily: "var(--mono-font)",
  fontSize: 11,
  padding: "11px 20px",
};

const messageStyle = {
  color: "var(--ink-3)",
  fontFamily: "var(--mono-font)",
  fontSize: 12,
  lineHeight: 1.5,
  padding: "32px 20px",
  textAlign: "center" as const,
};
