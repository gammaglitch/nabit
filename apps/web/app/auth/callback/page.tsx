"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { completeBrowserSupabaseAuth } from "@/lib/supabase/auth";

type CallbackState =
  | { status: "loading" }
  | { status: "success" }
  | { status: "error"; message: string };

export default function AuthCallbackPage() {
  const router = useRouter();
  const [state, setState] = useState<CallbackState>({
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;

    const completeSignIn = async () => {
      try {
        await completeBrowserSupabaseAuth(window.location.href);

        if (cancelled) {
          return;
        }

        setState({
          status: "success",
        });

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

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f5ede0_0%,_#efe4d2_48%,_#e8dcc6_100%)] px-6 py-10 text-foreground sm:px-10 lg:px-14">
      <div className="mx-auto max-w-2xl">
        <Card className="border-border/70 bg-card/95 backdrop-blur">
          <CardHeader>
            <CardDescription>Supabase Auth</CardDescription>
            <CardTitle className="text-3xl">
              {state.status === "loading"
                ? "Completing sign in"
                : state.status === "success"
                  ? "Signed in"
                  : "Sign in failed"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {state.status === "loading" ? (
              <p className="text-base leading-7 text-muted-foreground">
                Finishing the Supabase redirect and preparing your session.
              </p>
            ) : null}
            {state.status === "success" ? (
              <p className="text-base leading-7 text-muted-foreground">
                Your session is ready. Redirecting back to the home page.
              </p>
            ) : null}
            {state.status === "error" ? (
              <>
                <p className="rounded-2xl border border-red-300/40 bg-red-100/70 p-4 text-sm leading-6 text-red-900">
                  {state.message}
                </p>
                <Button asChild variant="outline">
                  <Link href="/">Back to home</Link>
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
