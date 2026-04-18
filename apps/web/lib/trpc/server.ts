import "server-only";

import type { AppRouter } from "@repo/trpc/types";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

const fallbackApiUrl = "http://127.0.0.1:3001/trpc";

export function getServerApiUrl() {
  return (
    process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? fallbackApiUrl
  );
}

export function createServerTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: getServerApiUrl(),
      }),
    ],
  });
}
