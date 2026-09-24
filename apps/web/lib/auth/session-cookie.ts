/**
 * A hint for `proxy.ts` that this browser has a session.
 *
 * The session itself is a token in localStorage, which the edge proxy cannot
 * see. So the client mirrors it into a cookie holding no secret, just a
 * marker, expiring when the session does.
 *
 * The API still checks the real token on every call; this only decides which
 * page the proxy serves. What matters is that it never outlives the session:
 * a cookie the proxy trusts while the client finds no session bounces between
 * /login and the app forever. `useSession` clears it whenever the API says
 * there is no session.
 */

export const SESSION_COOKIE_NAME = "nf-session";
const SESSION_COOKIE_VALUE = "1";

export function hasSessionCookie(value: string | null | undefined) {
  return value === SESSION_COOKIE_VALUE;
}

export function syncSessionCookie(expiresAt: Date | string | null) {
  if (typeof document === "undefined") {
    return;
  }

  const expiry = expiresAt ? new Date(expiresAt) : null;
  if (!expiry || Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
    document.cookie = `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SESSION_COOKIE_NAME}=${SESSION_COOKIE_VALUE}; Path=/; SameSite=Lax${secure}; Expires=${expiry.toUTCString()}`;
}
