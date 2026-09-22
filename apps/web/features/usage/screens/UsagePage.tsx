"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useState } from "react";
import { formatUsd } from "@/features/usage/utils/format";
import { trpc } from "@/lib/trpc/react";

const WINDOWS = [7, 30, 90];

const monoStyle: CSSProperties = {
  color: "var(--ink-2)",
  fontFamily: "var(--mono-font)",
  fontSize: 11,
};

const labelStyle: CSSProperties = {
  color: "var(--ink-3)",
  fontFamily: "var(--mono-font)",
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

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

const cellStyle: CSSProperties = {
  borderTop: "1px solid var(--rule-soft)",
  color: "var(--ink-2)",
  fontFamily: "var(--mono-font)",
  fontSize: 11,
  padding: "8px 10px 8px 0",
  textAlign: "left",
  verticalAlign: "top",
};

const headCellStyle: CSSProperties = {
  ...cellStyle,
  ...labelStyle,
  borderTop: "none",
  borderBottom: "1px solid var(--rule)",
};

const numberFormat = new Intl.NumberFormat("en-US");

function formatCount(value: number | null): string {
  return value === null ? "—" : numberFormat.format(value);
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

/**
 * What the models have cost, and which part of nabit spent it.
 *
 * Every figure here comes from the call ledger the API writes as it goes, so
 * the page only reads — there is nothing to reconcile and nothing to correct.
 */
export default function UsagePage() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const summaryQuery = trpc.usage.summary.useQuery({ days });

  const summary = summaryQuery.data;
  const totals = summary?.totals;
  const maxDayCost = Math.max(
    0,
    ...(summary?.byDay ?? []).map((entry) => entry.costUsd),
  );

  return (
    <div style={{ background: "var(--bg)", height: "100%", overflow: "auto" }}>
      <div
        style={{ margin: "0 auto", maxWidth: 900, padding: "40px 32px 80px" }}
      >
        <button
          onClick={() => router.push("/items")}
          style={{ ...buttonStyle, marginBottom: 24 }}
          type="button"
        >
          ← Hoard
        </button>

        <h1
          style={{
            color: "var(--ink)",
            fontFamily: "var(--read-font)",
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginBottom: 8,
          }}
        >
          LLM spend
        </h1>
        <p style={{ ...monoStyle, color: "var(--ink-3)", marginBottom: 20 }}>
          Every call Jev makes is logged with what it cost. Tagging a whole
          library runs up a bill quietly, so it is worth a look now and then.
        </p>

        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 32,
          }}
        >
          {WINDOWS.map((window) => {
            const active = window === days;
            return (
              <button
                key={window}
                onClick={() => setDays(window)}
                style={{
                  ...buttonStyle,
                  background: active ? "var(--ink)" : "transparent",
                  borderColor: active ? "var(--ink)" : "var(--rule)",
                  color: active ? "var(--bg)" : "var(--ink-2)",
                }}
                type="button"
              >
                {window} days
              </button>
            );
          })}
        </div>

        {summaryQuery.isLoading && <div style={monoStyle}>[LOADING…]</div>}
        {summaryQuery.error && (
          <div style={{ ...monoStyle, color: "var(--accent)" }}>
            [ERROR: {summaryQuery.error.message}]
          </div>
        )}

        {summary && totals && (
          <>
            <div
              style={{
                borderTop: "1px solid var(--rule)",
                display: "flex",
                gap: 48,
                marginBottom: 36,
                paddingTop: 16,
              }}
            >
              <Total label="Spent" value={formatUsd(totals.costUsd)} />
              <Total label="Calls" value={formatCount(totals.calls)} />
              <Total
                accent={totals.errors > 0}
                label="Errors"
                value={formatCount(totals.errors)}
              />
            </div>

            {totals.calls === 0 ? (
              <div style={{ ...monoStyle, color: "var(--ink-3)" }}>
                No calls in the last {summary.days} days. Nothing was spent.
              </div>
            ) : (
              <>
                <div style={{ ...labelStyle, marginBottom: 12 }}>
                  By feature
                </div>
                <div style={{ marginBottom: 36 }}>
                  {summary.byFeature.map((entry) => {
                    const cost = entry.costUsd ?? 0;
                    const share =
                      totals.costUsd > 0 ? (cost / totals.costUsd) * 100 : 0;
                    return (
                      <div
                        key={entry.feature}
                        style={{
                          borderTop: "1px solid var(--rule-soft)",
                          padding: "12px 0",
                        }}
                      >
                        <div
                          style={{
                            alignItems: "baseline",
                            display: "flex",
                            gap: 10,
                            justifyContent: "space-between",
                          }}
                        >
                          <span style={{ ...monoStyle, color: "var(--ink)" }}>
                            {entry.feature}
                          </span>
                          <span style={monoStyle}>
                            {formatUsd(entry.costUsd)}
                            <span style={{ color: "var(--ink-4)" }}>
                              {" "}
                              {share.toFixed(0)}%
                            </span>
                          </span>
                        </div>
                        <div
                          style={{
                            background: "var(--bg-alt)",
                            height: 6,
                            margin: "8px 0 6px",
                          }}
                        >
                          <div
                            style={{
                              background: "var(--accent)",
                              height: "100%",
                              width: `${share}%`,
                            }}
                          />
                        </div>
                        <div style={{ ...monoStyle, color: "var(--ink-3)" }}>
                          {formatCount(entry.calls)} call
                          {entry.calls === 1 ? "" : "s"} ·{" "}
                          {formatCount(entry.totalTokens)} tokens
                          {entry.errors > 0 ? (
                            <span style={{ color: "var(--accent)" }}>
                              {" "}
                              · {formatCount(entry.errors)} failed
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ ...labelStyle, marginBottom: 12 }}>By day</div>
                <div
                  style={{
                    borderBottom: "1px solid var(--rule)",
                    display: "flex",
                    gap: 2,
                    height: 80,
                    marginBottom: 36,
                  }}
                >
                  {summary.byDay.map((entry) => {
                    const label = `${entry.day} · ${formatUsd(entry.costUsd)}`;
                    return (
                      <div
                        aria-label={label}
                        key={entry.day}
                        role="img"
                        style={{
                          alignItems: "flex-end",
                          display: "flex",
                          flex: 1,
                          minWidth: 2,
                        }}
                        title={label}
                      >
                        <div
                          style={{
                            background:
                              entry.costUsd > 0
                                ? "var(--accent)"
                                : "var(--rule-soft)",
                            height:
                              maxDayCost > 0
                                ? `${Math.max((entry.costUsd / maxDayCost) * 100, entry.costUsd > 0 ? 2 : 1)}%`
                                : "1%",
                            width: "100%",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                <div style={{ ...labelStyle, marginBottom: 12 }}>
                  Recent calls
                </div>
                <table
                  style={{
                    borderCollapse: "collapse",
                    tableLayout: "fixed",
                    width: "100%",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={headCellStyle}>When</th>
                      <th style={headCellStyle}>Feature</th>
                      <th style={headCellStyle}>Model</th>
                      <th style={{ ...headCellStyle, textAlign: "right" }}>
                        Tokens
                      </th>
                      <th style={{ ...headCellStyle, textAlign: "right" }}>
                        Took
                      </th>
                      <th style={{ ...headCellStyle, textAlign: "right" }}>
                        Cost
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recent.map((call) => (
                      <tr key={call.id}>
                        <td
                          style={{ ...cellStyle, whiteSpace: "nowrap" }}
                          title={call.createdAt}
                        >
                          {formatWhen(call.createdAt)}
                        </td>
                        <td style={{ ...cellStyle, color: "var(--ink)" }}>
                          {call.feature}
                          {call.status === "error" && call.errorMessage ? (
                            <div
                              style={{
                                color: "var(--accent)",
                                marginTop: 4,
                                whiteSpace: "normal",
                              }}
                            >
                              {call.errorMessage}
                            </div>
                          ) : null}
                        </td>
                        <td
                          style={{
                            ...cellStyle,
                            color: "var(--ink-3)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {call.model}
                        </td>
                        <td style={{ ...cellStyle, textAlign: "right" }}>
                          {formatCount(call.totalTokens)}
                        </td>
                        <td style={{ ...cellStyle, textAlign: "right" }}>
                          {formatDuration(call.durationMs)}
                        </td>
                        <td style={{ ...cellStyle, textAlign: "right" }}>
                          {formatUsd(call.costUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Total({
  accent,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div style={{ ...labelStyle, marginBottom: 6 }}>{label}</div>
      <div
        style={{
          color: accent ? "var(--accent)" : "var(--ink)",
          fontFamily: "var(--mono-font)",
          fontSize: 22,
        }}
      >
        {value}
      </div>
    </div>
  );
}
