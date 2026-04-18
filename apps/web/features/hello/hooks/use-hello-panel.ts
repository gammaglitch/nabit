"use client";

import type { Session } from "@supabase/supabase-js";
import { getBrowserApiUrl } from "@/lib/trpc/client";
import { trpc } from "@/lib/trpc/react";

export function useHelloPanel(session: Session | null) {
  const helloQuery = trpc.hello.world.useQuery({
    name: "Next.js",
  });
  const privateHelloQuery = trpc.hello.me.useQuery(undefined, {
    enabled: Boolean(session),
    retry: false,
  });

  const status = helloQuery.isPending
    ? "Connecting"
    : helloQuery.isError
      ? "Failed"
      : "Connected";

  return {
    apiUrl: getBrowserApiUrl(),
    helloQuery,
    privateHelloQuery,
    status,
  };
}
