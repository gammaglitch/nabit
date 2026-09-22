"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/features/shared/components/Icon";
import { type Theme, useTheme } from "@/features/shared/hooks/useTheme";
import { trpc } from "@/lib/trpc/react";

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

// Convenience shortcuts only — the field is free text, because OpenRouter
// carries hundreds of models and pinning a list here would go stale.
const MODEL_SUGGESTIONS = [
  "anthropic/claude-sonnet-5",
  "anthropic/claude-opus-5",
  "anthropic/claude-haiku-4.5",
  "google/gemini-2.5-flash",
];

const labelStyle = {
  fontFamily: "var(--mono-font)",
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  marginBottom: 10,
} as const;

const fieldStyle = {
  width: "100%",
  fontFamily: "var(--mono-font)",
  fontSize: 11,
  color: "var(--ink)",
  background: "var(--bg)",
  border: "1px solid var(--rule)",
  padding: "6px 8px",
  outline: "none",
} as const;

const fieldLabelStyle = {
  display: "block",
  fontFamily: "var(--mono-font)",
  fontSize: 10,
  color: "var(--ink-3)",
  marginBottom: 4,
} as const;

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
            width: 320,
            maxHeight: "70vh",
            overflow: "auto",
            background: "var(--bg)",
            border: "1px solid var(--ink)",
            boxShadow: "4px 4px 0 var(--ink)",
            zIndex: 200,
            fontFamily: "var(--ui-font)",
          }}
        >
          <div
            style={{
              position: "sticky",
              top: 0,
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
            <div style={labelStyle}>Theme</div>

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
                        style={{ fontFamily: "var(--mono-font)", fontSize: 10 }}
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

          <div style={{ borderTop: "1px solid var(--rule)", padding: 14 }}>
            <ChatSettingsSection enabled={open} />
          </div>
        </div>
      )}
    </div>
  );
}

function ChatSettingsSection({ enabled }: { enabled: boolean }) {
  const utils = trpc.useUtils();
  const settingsQuery = trpc.settings.get.useQuery(undefined, { enabled });
  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      void utils.settings.get.invalidate();
    },
  });

  const [model, setModel] = useState("");
  const [maxContextChars, setMaxContextChars] = useState("");
  const [historyTurns, setHistoryTurns] = useState("");

  const loaded = settingsQuery.data;
  // Seed the form once the server values arrive. Keyed on the values
  // themselves so a successful save re-syncs to whatever was clamped.
  useEffect(() => {
    if (!loaded) return;
    setModel(loaded.model);
    setMaxContextChars(String(loaded.maxContextChars));
    setHistoryTurns(String(loaded.historyTurns));
  }, [loaded]);

  const dirty =
    loaded !== undefined &&
    (model !== loaded.model ||
      maxContextChars !== String(loaded.maxContextChars) ||
      historyTurns !== String(loaded.historyTurns));

  return (
    <>
      <div style={labelStyle}>Chat</div>

      {settingsQuery.isLoading && (
        <div
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 11,
            color: "var(--ink-3)",
          }}
        >
          [LOADING…]
        </div>
      )}

      {settingsQuery.error && (
        <div
          style={{
            fontFamily: "var(--mono-font)",
            fontSize: 11,
            color: "var(--accent)",
          }}
        >
          [ERROR: {settingsQuery.error.message}]
        </div>
      )}

      {loaded && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateSettings.mutate({
              historyTurns: Number(historyTurns),
              maxContextChars: Number(maxContextChars),
              model: model.trim(),
            });
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              marginBottom: 12,
            }}
          >
            <span style={{ color: "var(--ink-3)" }}>API key</span>
            <span
              style={{
                color: loaded.apiKeyConfigured
                  ? "var(--ink-2)"
                  : "var(--accent)",
              }}
            >
              {loaded.apiKeyConfigured ? "configured" : "not configured"}
            </span>
          </div>
          <div
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 10,
              lineHeight: 1.5,
              color: "var(--ink-4)",
              marginBottom: 14,
            }}
          >
            Set via OPENROUTER_API_KEY on the API. Kept out of the database so
            backups never carry a live billing credential.
          </div>

          <label style={fieldLabelStyle} htmlFor="settings-model">
            Model
          </label>
          <input
            id="settings-model"
            list="settings-model-options"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ ...fieldStyle, marginBottom: 12 }}
          />
          <datalist id="settings-model-options">
            {MODEL_SUGGESTIONS.map((slug) => (
              <option key={slug} value={slug} />
            ))}
          </datalist>

          <label style={fieldLabelStyle} htmlFor="settings-context">
            Context limit (characters)
          </label>
          <input
            id="settings-context"
            type="number"
            min={1000}
            max={500000}
            step={1000}
            value={maxContextChars}
            onChange={(e) => setMaxContextChars(e.target.value)}
            style={{ ...fieldStyle, marginBottom: 12 }}
          />

          <label style={fieldLabelStyle} htmlFor="settings-history">
            History sent (messages)
          </label>
          <input
            id="settings-history"
            type="number"
            min={1}
            max={50}
            value={historyTurns}
            onChange={(e) => setHistoryTurns(e.target.value)}
            style={{ ...fieldStyle, marginBottom: 6 }}
          />
          <div
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 10,
              lineHeight: 1.5,
              color: "var(--ink-4)",
              marginBottom: 14,
            }}
          >
            The article is re-sent with every question, so a longer history
            makes each turn cost more.
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="submit"
              disabled={!dirty || updateSettings.isPending}
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--ink-2)",
                border: "1px solid var(--rule)",
                background: "transparent",
                padding: "7px 12px",
                cursor: dirty ? "pointer" : "default",
                opacity: dirty && !updateSettings.isPending ? 1 : 0.4,
              }}
            >
              {updateSettings.isPending ? "Saving…" : "Save"}
            </button>
            {updateSettings.isSuccess && !dirty && (
              <span
                style={{
                  fontFamily: "var(--mono-font)",
                  fontSize: 10,
                  color: "var(--ink-3)",
                }}
              >
                saved
              </span>
            )}
            {updateSettings.error && (
              <span
                style={{
                  fontFamily: "var(--mono-font)",
                  fontSize: 10,
                  color: "var(--accent)",
                }}
              >
                {updateSettings.error.message}
              </span>
            )}
          </div>
        </form>
      )}
    </>
  );
}
