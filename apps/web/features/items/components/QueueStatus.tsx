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

export function QueueStatus({ hidden, onOpenCapture }: QueueStatusProps) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const seenSuccessful = useRef(new Set<number>());

  const jobsQuery = trpc.ingest.jobs.useQuery(
    { limit: 20 },
    {
      refetchInterval: 2500,
    },
  );

  const jobs = jobsQuery.data?.jobs ?? [];
  const working = jobs.filter(
    (job) => job.status === "queued" || job.status === "processing",
  );
  const failed = jobs.filter((job) => job.status === "failed");
  const recent = jobs.filter((job) => job.status === "success").slice(0, 5);

  useEffect(() => {
    let sawNewSuccess = false;
    for (const job of jobs) {
      if (job.status !== "success") continue;
      if (seenSuccessful.current.has(job.id)) continue;
      seenSuccessful.current.add(job.id);
      sawNewSuccess = true;
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

  const idle = working.length === 0 && failed.length === 0;

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
        <span>
          {idle
            ? "queue idle"
            : `${working.length} active · ${failed.length} failed`}
        </span>
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
            <QueueStat label="active" value={working.length} />
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

          {grouped.working.length > 0 && (
            <QueueSection title="Working">
              {grouped.working.map((job, index) => (
                <QueueRow key={job.id} job={job} position={index + 1} />
              ))}
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

const messageStyle = {
  color: "var(--ink-3)",
  fontFamily: "var(--mono-font)",
  fontSize: 12,
  lineHeight: 1.5,
  padding: "32px 20px",
  textAlign: "center" as const,
};
