"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/features/shared/components/Icon";
import { type Theme, useTheme } from "@/features/shared/hooks/useTheme";

const THEMES: Array<{ id: Theme; title: string; sub: string }> = [
  {
    id: "paper",
    title: "Paper",
    sub: "warm off-white · Space Grotesk + JB Mono · vermillion accent",
  },
  {
    id: "terminal",
    title: "Terminal",
    sub: "near-black · IBM Plex Mono throughout · amber accent",
  },
];

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Settings"
        aria-label="Settings"
        style={{
          width: 34,
          height: 34,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: open ? "1px solid var(--ink)" : "1px solid var(--rule)",
          background: open ? "var(--ink)" : "transparent",
          color: open ? "var(--bg)" : "var(--ink-2)",
        }}
      >
        <Icon name="settings" size={14} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 280,
            background: "var(--bg)",
            border: "1px solid var(--ink)",
            boxShadow: "4px 4px 0 var(--ink)",
            zIndex: 200,
            fontFamily: "var(--ui-font)",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--ink)",
              background: "var(--ink)",
              color: "var(--bg)",
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Settings
          </div>
          <div style={{ padding: 14 }}>
            <div
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                marginBottom: 10,
              }}
            >
              Theme
            </div>

            {THEMES.map((opt) => {
              const active = theme === opt.id;
              return (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setTheme(opt.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    marginBottom: 6,
                    border: "1px solid var(--rule)",
                    background: active ? "var(--ink)" : "var(--bg)",
                    color: active ? "var(--bg)" : "var(--ink)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 13,
                      fontWeight: 600,
                      marginBottom: 2,
                    }}
                  >
                    <span>{opt.title}</span>
                    {active && (
                      <span
                        style={{
                          fontFamily: "var(--mono-font)",
                          fontSize: 10,
                        }}
                      >
                        ●
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--mono-font)",
                      color: active ? "var(--bg)" : "var(--ink-3)",
                      letterSpacing: 0,
                      lineHeight: 1.4,
                    }}
                  >
                    {opt.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
