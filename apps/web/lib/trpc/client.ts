import type { AppRouter } from "@repo/trpc/types";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { getBrowserSupabaseAccessToken } from "@/lib/supabase/client";

const fallbackApiUrl = "http://127.0.0.1:3001/trpc";

export function getBrowserApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? fallbackApiUrl;
}

export function createTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        async headers() {
          const accessToken = await getBrowserSupabaseAccessToken();

          if (!accessToken) {
            return {};
          }

          return {
            authorization: `Bearer ${accessToken}`,
          };
        },
        url: getBrowserApiUrl(),
      }),
    ],
  });
}
