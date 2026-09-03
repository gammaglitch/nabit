"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useBrowserSupabaseSession } from "@/hooks/use-browser-supabase-session";
import {
  isPublicAuthPath,
  loginPathWithNext,
  NEXT_PARAM,
  safeNextPath,
  toNextPath,
} from "@/lib/auth/next-path";
import { authRequired } from "@/lib/auth/required";

export function AuthGate({ children }: { children: ReactNode }) {
  // When auth is disabled at build time, render children directly — no
  // session fetch, no redirect, no flash. Mirror the API's AUTH_REQUIRED.
  if (!authRequired()) {
    return <>{children}</>;
  }

  return <GateEnforced>{children}</GateEnforced>;
}

function GateEnforced({ children }: { children: ReactNode }) {
  const { session, supabaseClient, supabaseError } =
    useBrowserSupabaseSession();
  const pathname = usePathname();
  const router = useRouter();

  const isPathReady = typeof pathname === "string" && pathname.length > 0;
  const isPublicPath = isPathReady && isPublicAuthPath(pathname);

  useEffect(() => {
    if (!isPathReady || supabaseError || !supabaseClient) {
      return;
    }

    // `window.location.search` rather than useSearchParams: this component
    // wraps every route, and reading the hook here would opt the whole app out
    // of static rendering. Inside an effect it is browser-only anyway.
    if (!session && !isPublicPath) {
      router.replace(
        loginPathWithNext(toNextPath(pathname, window.location.search)),
      );
    }

    if (session && pathname === "/login") {
      // The other half of the proxy's bounce: it sends an expired-but-
      // refreshable session here, and the client has the real one. Without
      // this the destination is dropped on the way back out.
      const next = safeNextPath(
        new URLSearchParams(window.location.search).get(NEXT_PARAM),
      );
      router.replace(next ?? "/");
    }
  }, [
    isPathReady,
    session,
    isPublicPath,
    pathname,
    router,
    supabaseClient,
    supabaseError,
  ]);

  if (!isPathReady) {
    return null;
  }

  if (isPublicPath) {
    return children;
  }

  if (supabaseError) {
    return children;
  }

  if (!session) {
    return null;
  }

  return children;
}
