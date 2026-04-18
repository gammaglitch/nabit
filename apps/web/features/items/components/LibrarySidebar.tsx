"use client";

import { Mark } from "@/features/shared/components/Mark";
import {
  type NormalizedSource,
  sourceColor,
  sourceDescription,
} from "@/features/shared/utils/source";

export type Folder = "all" | "starred";

type Counts = {
  all: number;
  starred: number;
  article: number;
  hn: number;
  reddit: number;
  x: number;
};

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  counts: Counts;
  activeFolder: Folder;
  setActiveFolder: (f: Folder) => void;
  activeSource: "all" | NormalizedSource;
  setActiveSource: (s: "all" | NormalizedSource) => void;
  activeTag: string | null;
  setActiveTag: (t: string | null) => void;
  allTags: Array<{ name: string; count: number }>;
};

export function LibrarySidebar(props: SidebarProps) {
  return (
    <aside
      style={{
        borderRight: "1px solid var(--rule)",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {props.collapsed ? (
        <CollapsedRail {...props} />
      ) : (
        <ExpandedSidebar {...props} />
      )}
    </aside>
  );
}

function ExpandedSidebar({
  counts,
  activeFolder,
  setActiveFolder,
  activeSource,
  setActiveSource,
  activeTag,
  setActiveTag,
  allTags,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <>
      <div
        style={{
          padding: "18px 20px 16px",
          borderBottom: "1px solid var(--rule)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Mark size={75} />
        <div
          style={{
            fontFamily: "var(--ui-font)",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          nabit
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Collapse sidebar (⌘\)"
          aria-label="Collapse sidebar"
          style={{
            marginLeft: "auto",
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--rule)",
            background: "var(--bg)",
            color: "var(--ink-2)",
            cursor: "pointer",
            borderRadius: 4,
            padding: 0,
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M7.5 2.5 L3.5 6 L7.5 9.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div style={{ padding: "14px 0 8px", borderBottom: "1px solid var(--rule-soft)" }}>
        {(
          [
            { id: "all", label: "Hoard", count: counts.all },
            { id: "starred", label: "Shiny", count: counts.starred },
          ] as const
        ).map((n) => (
          <NavRow
            key={n.id}
            label={n.label}
            count={n.count}
            active={activeFolder === n.id}
            onClick={() => setActiveFolder(n.id)}
          />
        ))}
      </div>

      <div
        style={{
          padding: "14px 0 8px",
          borderBottom: "1px solid var(--rule-soft)",
        }}
      >
        <NavHeader>Source</NavHeader>
        {(
          [
            { id: "all", label: "Everything", count: counts.all },
            { id: "article", label: sourceDescription("article"), count: counts.article },
            { id: "hn", label: sourceDescription("hn"), count: counts.hn },
            { id: "reddit", label: sourceDescription("reddit"), count: counts.reddit },
            { id: "x", label: sourceDescription("x"), count: counts.x },
          ] as const
        ).map((n) => (
          <NavRow
            key={n.id}
            label={n.label}
            count={n.count}
            active={activeSource === n.id}
            onClick={() => setActiveSource(n.id)}
          />
        ))}
      </div>

      <div
        style={{
          padding: "14px 0 8px",
          borderBottom: "1px solid var(--rule-soft)",
          flex: 1,
          overflow: "auto",
        }}
      >
        <NavHeader>Tags</NavHeader>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            padding: "4px 20px 12px",
          }}
        >
          {allTags.length === 0 && (
            <div
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 11,
                color: "var(--ink-4)",
              }}
            >
              No tags yet.
            </div>
          )}
          {allTags.map(({ name, count }) => {
            const active = activeTag === name;
            return (
              <button
                type="button"
                key={name}
                onClick={() => setActiveTag(active ? null : name)}
                title={`${count} item${count !== 1 ? "s" : ""}`}
                style={{
                  fontFamily: "var(--mono-font)",
                  fontSize: 11,
                  padding: "2px 6px",
                  color: active ? "var(--bg)" : "var(--ink-2)",
                  background: active ? "var(--ink)" : "transparent",
                  border: "1px solid transparent",
                  lineHeight: 1.3,
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function NavHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--mono-font)",
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        padding: "0 20px 8px",
      }}
    >
      {children}
    </div>
  );
}

function NavRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 20px",
        fontSize: 13,
        color: active ? "var(--ink)" : "var(--ink-2)",
        background: active ? "var(--bg-alt)" : "transparent",
        borderLeft: active
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        fontWeight: active ? 500 : 400,
        width: "100%",
        textAlign: "left",
      }}
    >
      <span>{label}</span>
      <span
        style={{
          fontFamily: "var(--mono-font)",
          fontSize: 11,
          color: "var(--ink-3)",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function CollapsedRail({
  counts,
  activeFolder,
  setActiveFolder,
  activeSource,
  setActiveSource,
  activeTag,
  setActiveTag,
  onToggleCollapse,
}: SidebarProps) {
  const railBtn = (active: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "10px 0",
    borderBottom: "1px solid var(--rule-soft)",
    fontFamily: "var(--mono-font)",
    fontSize: 10,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: active ? "var(--ink)" : "var(--ink-3)",
    background: active ? "var(--bg-alt)" : "transparent",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    position: "relative",
    borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
  });

  const folders = [
    { id: "all" as const, glyph: "■", label: "ALL", count: counts.all },
    {
      id: "starred" as const,
      glyph: "◆",
      label: "SHN",
      count: counts.starred,
    },
  ];
  const sources = [
    { id: "all" as const, label: "∗", full: "All" },
    { id: "article" as const, label: "ART", full: "Articles" },
    { id: "hn" as const, label: "HN", full: "Hacker News" },
    { id: "reddit" as const, label: "RDT", full: "Reddit" },
    { id: "x" as const, label: "X", full: "X / Twitter" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggleCollapse}
        title="Expand sidebar"
        style={{
          padding: "18px 0 16px",
          borderBottom: "1px solid var(--rule)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          width: "100%",
        }}
      >
        <Mark size={22} />
      </button>

      <div style={{ borderBottom: "1px solid var(--rule-soft)" }}>
        {folders.map((f) => (
          <button
            type="button"
            key={f.id}
            onClick={() => setActiveFolder(f.id)}
            style={railBtn(activeFolder === f.id)}
            title={`${f.label} · ${f.count}`}
          >
            <span style={{ fontSize: 11, color: "var(--ink-2)" }}>
              {f.glyph}
            </span>
            <span>{f.count}</span>
          </button>
        ))}
      </div>

      <div style={{ borderBottom: "1px solid var(--rule-soft)" }}>
        {sources.map((s) => (
          <button
            type="button"
            key={s.id}
            onClick={() => setActiveSource(s.id)}
            style={railBtn(activeSource === s.id)}
            title={s.full}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color:
                  s.id === "all" ? "var(--ink-2)" : sourceColor(s.id),
              }}
            >
              {s.label}
            </span>
          </button>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {activeTag && (
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            title={`Clear tag #${activeTag}`}
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              fontFamily: "var(--mono-font)",
              fontSize: 10,
              letterSpacing: "0.08em",
              padding: "8px 4px",
              background: "var(--ink)",
              color: "var(--bg)",
              border: 0,
            }}
          >
            #{activeTag} ×
          </button>
        )}
      </div>
    </div>
  );
}
