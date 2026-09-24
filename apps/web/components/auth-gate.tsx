"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useSession } from "@/hooks/use-session";
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
  const { isPending, session } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const isPathReady = typeof pathname === "string" && pathname.length > 0;
  const isPublicPath = isPathReady && isPublicAuthPath(pathname);

  useEffect(() => {
    // Until the API has answered, no session means "don't know yet".
    if (!isPathReady || isPending) {
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
      // Signed in already (another tab, or a session cookie that went
      // missing): leave /login for the destination instead of asking again.
      const next = safeNextPath(
        new URLSearchParams(window.location.search).get(NEXT_PARAM),
      );
      router.replace(next ?? "/");
    }
  }, [isPathReady, isPending, session, isPublicPath, pathname, router]);

  if (!isPathReady) {
    return null;
  }

  if (isPublicPath) {
    return children;
  }

  if (!session) {
    return null;
  }

  return children;
}
