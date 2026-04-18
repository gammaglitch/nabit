"use client";

import { useState } from "react";
import { Mark } from "@/features/shared/components/Mark";
import {
  getBrowserSupabaseClient,
  getBrowserSupabaseRedirectUrl,
} from "@/lib/supabase/client";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: getBrowserSupabaseRedirectUrl() },
      });
      if (signInError) {
        setError(signInError.message);
        setBusy(false);
      }
    } catch {
      setError("Failed to start sign in.");
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          border: "1px solid var(--rule)",
          background: "var(--bg)",
          boxShadow: "6px 6px 0 var(--ink)",
        }}
      >
        <div
          style={{
            padding: "18px 20px 16px",
            borderBottom: "1px solid var(--rule)",
            background: "var(--bg)",
            color: "var(--ink)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Mark size={28} />
          <span
            style={{
              fontFamily: "var(--ui-font)",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            nabit
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--mono-font)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
          >
            Sign in
          </span>
        </div>
        <div style={{ padding: "28px 24px" }}>
          <p
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              marginBottom: 8,
            }}
          >
            Welcome back, magpie.
          </p>
          <h1
            style={{
              fontFamily: "var(--serif-font)",
              fontSize: 30,
              lineHeight: 1.1,
              color: "var(--ink)",
              marginBottom: 20,
            }}
          >
            Your hoard awaits.
          </h1>

          {error && (
            <div
              style={{
                padding: "10px 12px",
                marginBottom: 16,
                border: "1px solid var(--accent)",
                color: "var(--accent)",
                fontFamily: "var(--mono-font)",
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void signIn()}
            style={{
              width: "100%",
              padding: "12px 16px",
              border: "1px solid var(--ink)",
              background: busy ? "var(--bg-alt)" : "var(--ink)",
              color: busy ? "var(--ink-3)" : "var(--bg)",
              fontFamily: "var(--mono-font)",
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {busy ? "Redirecting…" : "Sign in with GitHub"}
          </button>

          <p
            style={{
              marginTop: 18,
              fontFamily: "var(--mono-font)",
              fontSize: 10,
              letterSpacing: "0.06em",
              color: "var(--ink-4)",
              lineHeight: 1.6,
            }}
          >
            Paste a URL. Nabit keeps a copy forever — article body, thread OP,
            comment tree.
          </p>
        </div>
      </div>
    </div>
  );
}
