"use client";

import { getHelloRuntimeLabel } from "@repo/shared";
import { Button } from "@/components/ui/button";
import { AuthPanel } from "@/features/auth/components/AuthPanel";
import { HelloPanel } from "@/features/hello/components/HelloPanel";
import { useBrowserSupabaseSession } from "@/hooks/use-browser-supabase-session";

export default function HomePage() {
  const { session, supabaseClient, supabaseError } =
    useBrowserSupabaseSession();

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(219,171,92,0.28),_transparent_34%),linear-gradient(180deg,_#f5ede0_0%,_#efe4d2_48%,_#e8dcc6_100%)] px-6 py-10 text-foreground sm:px-10 lg:px-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.38em] text-muted-foreground">
              Nabit
            </p>
            <h1 className="mt-3 max-w-2xl text-5xl font-semibold tracking-[-0.06em] text-balance sm:text-6xl">
              Web frontend with Tailwind, shadcn, and typed tRPC.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              {getHelloRuntimeLabel("web")} defaults to browser-side querying.
              Server-side tRPC stays available for the smaller set of pages that
              actually need it.
            </p>
          </div>
          <div className="flex gap-3">
            <Button asChild variant="outline">
              <a
                href="https://ui.shadcn.com/docs"
                rel="noreferrer"
                target="_blank"
              >
                shadcn docs
              </a>
            </Button>
            <Button asChild>
              <a
                href="https://nextjs.org/docs"
                rel="noreferrer"
                target="_blank"
              >
                Next docs
              </a>
            </Button>
          </div>
        </div>

        <AuthPanel
          session={session}
          supabaseClient={supabaseClient}
          supabaseError={supabaseError}
        />
        <HelloPanel session={session} />
      </div>
    </main>
  );
}
