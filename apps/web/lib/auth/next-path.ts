/**
 * Where to send someone back to after an auth bounce.
 *
 * A deep link into the app — `/sites/2?page=6`, a reader URL, a shared link —
 * used to be discarded: the proxy redirected to /login and the login flow ended
 * at /items, so the destination was gone. The path rides along as `?next=` and
 * every consumer runs it through `safeNextPath` first.
 *
 * Not importable from a "use client" module by the edge proxy, so this file
 * stays free of React and of the browser: `proxy.ts`, `AuthGate` and the OAuth
 * callback all use it.
 */

export const NEXT_PARAM = "next";

/** Key the OAuth round-trip parks the destination under. */
export const NEXT_STORAGE_KEY = "nabit:auth:next";

/**
 * The paths reachable without a session. One list, because the proxy, the
 * client gate and `safeNextPath` all have to agree on it: a path the gate lets
 * through but `safeNextPath` accepts as a destination is a redirect loop.
 */
export const PUBLIC_PATH_PREFIXES = ["/login", "/auth/callback"];

/** Exact match or a path beneath it — never a prefix like `/loginary`. */
export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * The value as a path to redirect to, or null if it cannot be trusted.
 *
 * The check is deliberately strict, because this value ends up in a redirect
 * and arrives from the URL: anything that could name another origin is an open
 * redirect. A leading slash is not sufficient — browsers read `//evil.com` and
 * `/\evil.com` as protocol-relative URLs pointing off-site.
 *
 * Public paths are rejected too, or a bounce could land back on /login and
 * loop.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  // A control character can split a header or smuggle a second URL past the
  // checks above.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  if (isPublicAuthPath(value.split(/[?#]/)[0])) return null;

  return value;
}

/**
 * The current location as a `next` value.
 *
 * The fragment is left out because it never reaches the server anyway: a deep
 * link to a page survives an auth bounce, a position within that page does not.
 */
export function toNextPath(pathname: string, search: string): string | null {
  return safeNextPath(`${pathname}${search}`);
}

/** `/login`, carrying `next` when there is a destination worth keeping. */
export function loginPathWithNext(next: string | null): string {
  const safe = safeNextPath(next);
  return safe ? `/login?${NEXT_PARAM}=${encodeURIComponent(safe)}` : "/login";
}
