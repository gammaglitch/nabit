"use client";

import { isTRPCClientError } from "@trpc/client";
import { syncBrowserAuthCookie } from "@/lib/supabase/auth-cookie";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { isPublicAuthPath, loginPathWithNext, toNextPath } from "./next-path";

/**
 * The API refused who we are, rather than what we asked for.
 *
 * Both codes mean the session is finished: the token no longer verifies, or
 * the address behind it is not on ALLOWED_EMAILS any more. Neither is fixed by
 * retrying, and both used to surface as an ordinary failed query.
 */
export function isRejectedSessionError(error: unknown): boolean {
  if (!isTRPCClientError(error)) {
    return false;
  }
  const code = error.data?.code;
  return code === "UNAUTHORIZED" || code === "FORBIDDEN";
}

// Every query in flight fails at once when a session dies, and each one
// reports it. Recovery runs for the first and is a no-op for the rest.
let recovering = false;

/**
 * Throws away a session the API will not accept and returns to the login
 * page.
 *
 * Without this a dead session simply kept failing: the cookie still looked
 * live to the edge proxy, the client still held a token Supabase was happy
 * with, and the only way out was clearing site data by hand.
 */
export async function endRejectedSession(): Promise<void> {
  if (typeof window === "undefined" || recovering) {
    return;
  }
  recovering = true;

  // The same write the session hook makes when Supabase reports no session.
  syncBrowserAuthCookie(null);

  try {
    await getBrowserSupabaseClient().auth.signOut({ scope: "local" });
  } catch {
    // Unconfigured, or refusing to talk to us — the cookie is already gone,
    // and the redirect below matters more than a clean sign-out.
  }

  const { pathname, search } = window.location;
  if (isPublicAuthPath(pathname)) {
    recovering = false;
    return;
  }

  // assign() rather than the router: the tree that failed is still mounted,
  // and a client navigation would re-run its queries against the dead session.
  window.location.assign(loginPathWithNext(toNextPath(pathname, search)));
}

/** Test seam: recovery latches so it only runs once per page. */
export function resetSessionRecoveryForTests(): void {
  recovering = false;
}
