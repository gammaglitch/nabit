"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useBrowserSupabaseSession } from "@/hooks/use-browser-supabase-session";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, supabaseClient, supabaseError } =
    useBrowserSupabaseSession();
  const pathname = usePathname();
  const router = useRouter();

  const isPathReady = typeof pathname === "string" && pathname.length > 0;
  const isPublicPath =
    isPathReady &&
    PUBLIC_PATHS.some((publicPath) => pathname.startsWith(publicPath));

  useEffect(() => {
    if (!isPathReady || supabaseError || !supabaseClient) {
      return;
    }

    if (!session && !isPublicPath) {
      router.replace("/login");
    }

    if (session && pathname === "/login") {
      router.replace("/");
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
