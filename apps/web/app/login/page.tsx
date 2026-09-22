"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Mark } from "@/features/shared/components/Mark";
import { getAuthClient } from "@/lib/auth/client";
import { NEXT_PARAM, safeNextPath } from "@/lib/auth/next-path";
import { syncSessionCookie } from "@/lib/auth/session-cookie";

type Mode = "sign-in" | "sign-up";

const fieldStyle = {
  width: "100%",
  padding: "10px 12px",
  marginBottom: 12,
  border: "1px solid var(--rule)",
  background: "var(--bg)",
  color: "var(--ink)",
  fontFamily: "var(--mono-font)",
  fontSize: 13,
  outline: "none",
} as const;

const labelStyle = {
  display: "block",
  marginBottom: 4,
  fontFamily: "var(--mono-font)",
  fontSize: 10,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
} as const;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const auth = getAuthClient();
    try {
      const { error: authError } =
        mode === "sign-in"
          ? await auth.signIn.email({ email, password })
          : await auth.signUp.email({
              email,
              // Required by Better Auth; nothing shows it yet.
              name: email.split("@")[0] || email,
              password,
            });
      if (authError) {
        setError(authError.message ?? "Could not sign in.");
        setBusy(false);
        return;
      }

      // The proxy decides by cookie, so it has to be set before navigating
      // or the next page request bounces straight back here.
      const { data } = await auth.getSession();
      syncSessionCookie(data?.session.expiresAt ?? null);

      const next = safeNextPath(
        new URLSearchParams(window.location.search).get(NEXT_PARAM),
      );
      router.replace(next ?? "/items");
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(mode === "sign-in" ? "sign-up" : "sign-in");
    setError(null);
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
            {mode === "sign-in" ? "Sign in" : "Create account"}
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

          <form onSubmit={(event) => void submit(event)}>
            <label htmlFor="login-email" style={labelStyle}>
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={fieldStyle}
            />
            <label htmlFor="login-password" style={labelStyle}>
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={fieldStyle}
            />
            <button
              type="submit"
              disabled={busy}
              style={{
                width: "100%",
                marginTop: 4,
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
              {busy
                ? "One moment…"
                : mode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          <button
            type="button"
            onClick={switchMode}
            style={{
              marginTop: 14,
              padding: 0,
              border: "none",
              background: "none",
              color: "var(--ink-3)",
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            {mode === "sign-in"
              ? "New here? Create an account"
              : "Have an account? Sign in"}
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
