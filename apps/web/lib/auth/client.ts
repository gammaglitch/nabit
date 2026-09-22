"use client";

import { createAuthClient } from "better-auth/react";
import { getApiOrigin } from "@/lib/trpc/client";
import { getAccessToken, setAccessToken } from "./token";

let authClient: ReturnType<typeof makeAuthClient> | null = null;

function makeAuthClient() {
  return createAuthClient({
    baseURL: getApiOrigin(),
    basePath: "/api/auth",
    fetchOptions: {
      auth: { type: "Bearer", token: () => getAccessToken() ?? "" },
      // The API is on another origin, so its session cookie never reaches
      // this app. The bearer plugin hands the token over in a header instead.
      onSuccess: (context) => {
        const token = context.response.headers.get("set-auth-token");
        if (token) setAccessToken(token);
      },
    },
  });
}

/** Better Auth's client, talking to the API's /api/auth routes. */
export function getAuthClient() {
  if (!authClient) authClient = makeAuthClient();
  return authClient;
}
