"use client";

import type { CSSProperties } from "react";
import { endRejectedSession } from "@/lib/auth/session-recovery";

const buttonStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--rule, #d8d2c7)",
  color: "var(--ink-2, #3a362f)",
  cursor: "pointer",
  fontFamily: "var(--mono-font, monospace)",
  fontSize: 11,
  letterSpacing: "0.08em",
  padding: "8px 14px",
  textTransform: "uppercase",
};

/**
 * What a crash looks like instead of Next.js's default page.
 *
 * The sign-out is not decoration: a session the API has stopped accepting
 * takes down every page that queries it, and clearing site data by hand used
 * to be the only way back.
 *
 * Styling falls back to literal values because a global error replaces the
 * document, stylesheet included.
 */
export function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
}) {
  return (
    <div
      style={{
        alignItems: "center",
        background: "var(--bg, #f4f1ea)",
        display: "flex",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 560, width: "100%" }}>
        <div
          style={{
            color: "var(--accent, #d33a1c)",
            fontFamily: "var(--mono-font, monospace)",
            fontSize: 11,
            letterSpacing: "0.12em",
            marginBottom: 12,
            textTransform: "uppercase",
          }}
        >
          [SOMETHING BROKE]
        </div>

        <p
          style={{
            color: "var(--ink, #1a1814)",
            fontFamily: "var(--mono-font, monospace)",
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: 12,
            overflowWrap: "anywhere",
          }}
        >
          {error.message || "The page failed to render."}
        </p>

        <p
          style={{
            color: "var(--ink-3, #6b6459)",
            fontFamily: "var(--mono-font, monospace)",
            fontSize: 11,
            lineHeight: 1.6,
            marginBottom: 20,
          }}
        >
          If this followed a deploy or a long time away, the sign-in is probably
          stale — sign out and back in.{" "}
          {error.digest ? `Digest ${error.digest}.` : null}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {reset && (
            <button onClick={reset} style={buttonStyle} type="button">
              Try again
            </button>
          )}
          <button
            onClick={() => {
              void endRejectedSession();
            }}
            style={buttonStyle}
            type="button"
          >
            Sign out
          </button>
          <a
            href="/items"
            style={{
              ...buttonStyle,
              display: "inline-block",
              textDecoration: "none",
            }}
          >
            Back to the hoard
          </a>
        </div>
      </div>
    </div>
  );
}
