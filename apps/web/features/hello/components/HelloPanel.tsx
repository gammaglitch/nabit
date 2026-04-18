"use client";

import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useHelloPanel } from "../hooks/use-hello-panel";

interface HelloPanelProps {
  session: Session | null;
}

export function HelloPanel({ session }: HelloPanelProps) {
  const { apiUrl, helloQuery, privateHelloQuery, status } =
    useHelloPanel(session);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
      <Card className="border-primary/15 bg-card/95 backdrop-blur">
        <CardHeader>
          <CardDescription>Browser-side query</CardDescription>
          <CardTitle className="text-3xl">
            {helloQuery.data?.message ?? "Waiting for backend response"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            This card fetches from the Fastify tRPC backend in the browser with
            React Query. The web app uses the shared `@repo/trpc` contract,
            matching the mobile app&apos;s client-side model.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
                Endpoint
              </p>
              <p className="mt-3 break-all text-sm font-medium">{apiUrl}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
                Status
              </p>
              <p className="mt-3 text-sm font-medium">{status}</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary">Next.js 16</Button>
            <Button variant="secondary">TanStack Query</Button>
            <Button variant="secondary">tRPC v11</Button>
          </div>
          <Button
            onClick={() => {
              void helloQuery.refetch();
            }}
            variant="outline"
          >
            Refetch
          </Button>
        </CardFooter>
      </Card>

      <Card className="border-border/70 bg-[#152033] text-white">
        <CardHeader>
          <CardDescription className="text-slate-300">
            Response details
          </CardDescription>
          <CardTitle className="text-2xl text-white">
            Hello world card
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {helloQuery.isPending ? (
            <div className="rounded-2xl bg-white/8 p-4 text-sm leading-6 text-slate-100">
              Loading hello world from the backend...
            </div>
          ) : helloQuery.isError ? (
            <div className="rounded-2xl border border-red-300/30 bg-red-200/10 p-4 text-sm leading-6 text-red-100">
              {helloQuery.error.message}
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-white/8 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-300">
                  Message
                </p>
                <p className="mt-3 text-2xl font-semibold text-[#f7c96f]">
                  {helloQuery.data.message}
                </p>
              </div>
              <div className="rounded-2xl bg-white/8 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-300">
                  Served at
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-100">
                  {helloQuery.data.servedAt}
                </p>
              </div>
              <div className="rounded-2xl bg-white/8 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-300">
                  Authenticated route
                </p>
                {!session ? (
                  <p className="mt-3 text-sm leading-6 text-slate-100">
                    Sign in above to call `hello.me` with your Supabase access
                    token.
                  </p>
                ) : privateHelloQuery.isPending ? (
                  <p className="mt-3 text-sm leading-6 text-slate-100">
                    Calling `hello.me` with the current browser session...
                  </p>
                ) : privateHelloQuery.isError ? (
                  <p className="mt-3 text-sm leading-6 text-red-100">
                    {privateHelloQuery.error.message}
                  </p>
                ) : (
                  <>
                    <p className="mt-3 text-lg font-semibold text-[#f7c96f]">
                      {privateHelloQuery.data.message}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-100">
                      Role: {privateHelloQuery.data.role}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-100">
                      User ID: {privateHelloQuery.data.userId}
                    </p>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
