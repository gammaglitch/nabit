"use client";

import { useEffect } from "react";
import { getAuthClient } from "@/lib/auth/client";
import { syncSessionCookie } from "@/lib/auth/session-cookie";

/** The signed-in session, kept in step with the proxy's session cookie. */
export function useSession() {
  const { data, isPending } = getAuthClient().useSession();

  useEffect(() => {
    if (isPending) return;
    syncSessionCookie(data?.session.expiresAt ?? null);
  }, [data, isPending]);

  return { isPending, session: data ?? null };
}
