"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Mark } from "@/features/shared/components/Mark";
import { completeBrowserSupabaseAuth } from "@/lib/supabase/auth";

type CallbackState =
  | { status: "loading" }
  | { status: "success" }
  | { status: "error"; message: string };

export default function AuthCallbackPage() {
  const router = useRouter();
  const [state, setState] = useState<CallbackState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const completeSignIn = async () => {
      try {
        await completeBrowserSupabaseAuth(window.location.href);
        if (cancelled) return;
        setState({ status: "success" });
        window.history.replaceState({}, "", "/auth/callback");
        router.replace("/");
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not complete Supabase sign in.",
          });
        }
      }
    };

    void completeSignIn();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const title =
    state.status === "loading"
      ? "Completing sign in"
      : state.status === "success"
        ? "Signed in. Shiny."
        : "Sign in failed";

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
          maxWidth: 460,
          border: "1px solid var(--rule)",
          background: "var(--bg)",
          boxShadow: "6px 6px 0 var(--ink)",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--rule)",
            background: "var(--ink)",
            color: "var(--bg)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Mark size={22} />
          <span
            style={{
              fontFamily: "var(--mono-font)",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Supabase auth
          </span>
        </div>
        <div style={{ padding: "28px 24px" }}>
          <h1
            style={{
              fontFamily: "var(--serif-font)",
              fontSize: 28,
              lineHeight: 1.1,
              color: "var(--ink)",
              marginBottom: 14,
            }}
          >
            {title}
          </h1>
          {state.status === "loading" && (
            <p
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 12,
                color: "var(--ink-3)",
                lineHeight: 1.6,
              }}
            >
              Finishing the redirect and preparing your session…
            </p>
          )}
          {state.status === "success" && (
            <p
              style={{
                fontFamily: "var(--mono-font)",
                fontSize: 12,
                color: "var(--ink-3)",
                lineHeight: 1.6,
              }}
            >
              Session ready. Taking you to your hoard.
            </p>
          )}
          {state.status === "error" && (
            <>
              <p
                style={{
                  padding: "10px 12px",
                  marginBottom: 16,
                  border: "1px solid var(--accent)",
                  color: "var(--accent)",
                  fontFamily: "var(--mono-font)",
                  fontSize: 12,
                }}
              >
                {state.message}
              </p>
              <Link
                href="/"
                style={{
                  display: "inline-block",
                  padding: "8px 14px",
                  border: "1px solid var(--ink)",
                  background: "var(--ink)",
                  color: "var(--bg)",
                  fontFamily: "var(--mono-font)",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                }}
              >
                Back to hoard
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
