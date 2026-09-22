"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import {
  endRejectedSession,
  isRejectedSessionError,
} from "@/lib/auth/session-recovery";
import { createTrpcClient } from "@/lib/trpc/client";
import { trpc } from "@/lib/trpc/react";

type ProvidersProps = {
  children: ReactNode;
};

/**
 * A session the API refuses is not a failed request, it is the end of the
 * session: retrying cannot fix it, and every query on the page fails the same
 * way. Caught here rather than per-query so one dead session logs out once,
 * instead of leaving each screen to render its own broken state.
 */
function onQueryError(error: unknown) {
  if (isRejectedSessionError(error)) {
    void endRejectedSession();
  }
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({ onError: onQueryError }),
        queryCache: new QueryCache({ onError: onQueryError }),
      }),
  );
  const [trpcClient] = useState(() => createTrpcClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthGate>{children}</AuthGate>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
