"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthPanel } from "../hooks/use-auth-panel";

interface AuthPanelProps {
  session: Session | null;
  supabaseClient: SupabaseClient | null;
  supabaseError: string | null;
}

export function AuthPanel({
  session,
  supabaseClient,
  supabaseError,
}: AuthPanelProps) {
  const {
    avatarUrl,
    busyAction,
    displayName,
    email,
    notice,
    oauthProvider,
    sendMagicLink,
    sessionSummary,
    setEmail,
    signInWithOAuth,
    signOut,
  } = useAuthPanel({
    session,
    supabaseClient,
  });

  return (
    <Card className="border-border/70 bg-card/95 backdrop-blur">
      <CardHeader>
        <CardDescription>Supabase Auth</CardDescription>
        <CardTitle className="text-3xl">
          Magic link and {oauthProvider} OAuth
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          This example keeps auth client-side on the web. It uses the shared
          `@repo/auth` package for Supabase config validation and session/user
          shaping, while the browser client stays local to the Next app.
        </p>

        {supabaseError ? (
          <div className="rounded-2xl border border-red-300/40 bg-red-100/70 p-4 text-sm leading-6 text-red-900">
            {supabaseError}
          </div>
        ) : null}

        {notice ? (
          <div
            className={
              notice.kind === "error"
                ? "rounded-2xl border border-red-300/40 bg-red-100/70 p-4 text-sm leading-6 text-red-900"
                : "rounded-2xl border border-emerald-300/40 bg-emerald-100/70 p-4 text-sm leading-6 text-emerald-950"
            }
          >
            {notice.text}
          </div>
        ) : null}

        {sessionSummary ? (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[28px] border border-border/70 bg-background/80 p-5">
              <div className="flex items-center gap-4">
                {avatarUrl ? (
                  <Image
                    alt={displayName ?? "Authenticated user avatar"}
                    className="h-14 w-14 rounded-full object-cover"
                    height={56}
                    src={avatarUrl}
                    unoptimized
                    width={56}
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                    {(displayName ?? sessionSummary.userId)
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
                    Signed in
                  </p>
                  <p className="mt-2 text-xl font-semibold">{displayName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {sessionSummary.email ?? "No email available"}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-[28px] border border-border/70 bg-background/80 p-5">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
                Providers
              </p>
              <p className="mt-3 text-sm leading-6">
                {sessionSummary.providers.join(", ")}
              </p>
              <p className="mt-4 font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
                User ID
              </p>
              <p className="mt-3 break-all text-sm leading-6">
                {sessionSummary.userId}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Input
              autoComplete="email"
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
            <Button
              disabled={busyAction !== null || !supabaseClient}
              onClick={() => {
                void sendMagicLink();
              }}
            >
              {busyAction === "magic-link" ? "Sending..." : "Magic link"}
            </Button>
            <Button
              disabled={busyAction !== null || !supabaseClient}
              onClick={() => {
                void signInWithOAuth();
              }}
              variant="outline"
            >
              {busyAction === "oauth" ? "Redirecting..." : "GitHub OAuth"}
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Redirect URL: <span className="font-mono">/auth/callback</span>
        </div>
        {sessionSummary ? (
          <Button
            disabled={busyAction !== null}
            onClick={() => {
              void signOut();
            }}
            variant="outline"
          >
            {busyAction === "sign-out" ? "Signing out..." : "Sign out"}
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
