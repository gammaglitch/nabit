import type { Session } from "@supabase/supabase-js";

export const AUTH_COOKIE_NAME = "nf-access-token";

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padding);

  if (typeof globalThis.atob === "function") {
    return globalThis.atob(padded);
  }

  return Buffer.from(padded, "base64").toString("utf8");
}

export function getAccessTokenExpiry(accessToken: string) {
  const [, payload] = accessToken.split(".");

  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown };
    return typeof parsed.exp === "number" ? parsed.exp : null;
  } catch {
    return null;
  }
}

export function hasUsableAccessToken(
  accessToken: string | null | undefined,
  nowMs = Date.now(),
) {
  if (!accessToken) {
    return false;
  }

  const expiry = getAccessTokenExpiry(accessToken);
  if (expiry === null) {
    return true;
  }

  return expiry * 1000 > nowMs;
}

export function syncBrowserAuthCookie(session: Session | null) {
  if (typeof document === "undefined") {
    return;
  }

  if (!session?.access_token || !hasUsableAccessToken(session.access_token)) {
    document.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const expiresAt =
    typeof session.expires_at === "number" ? session.expires_at * 1000 : null;
  const expires =
    expiresAt !== null ? `; Expires=${new Date(expiresAt).toUTCString()}` : "";

  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(
    session.access_token,
  )}; Path=/; SameSite=Lax${secure}${expires}`;
}
