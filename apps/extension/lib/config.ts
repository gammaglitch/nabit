/** Strips trailing slashes so callers can append paths safely. */
export function normalizeApiUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Build-time defaults from `apps/extension/.env` (see `.env.example`). WXT
 * inlines every WXT_-prefixed var, so an unset one arrives as `undefined` and
 * we fall back to the local dev API. These are only defaults — anything saved
 * in the popup's config panel wins, since `defineItem` reads the fallback only
 * when nothing is stored.
 */
const FALLBACK_API_URL = "http://localhost:3001";

export const DEFAULT_API_URL = normalizeApiUrl(
  import.meta.env.WXT_API_URL || FALLBACK_API_URL,
);

const DEFAULT_API_TOKEN = (import.meta.env.WXT_API_TOKEN ?? "").trim();

const apiUrlItem = storage.defineItem<string>("local:apiUrl", {
  fallback: DEFAULT_API_URL,
});

const apiTokenItem = storage.defineItem<string>("local:apiToken", {
  fallback: DEFAULT_API_TOKEN,
});

/** Returns the parsed URL, or null when it isn't a usable http(s) origin. */
export function parseApiUrl(url: string): URL | null {
  try {
    const parsed = new URL(normalizeApiUrl(url));
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export async function getApiUrl(): Promise<string> {
  return normalizeApiUrl(await apiUrlItem.getValue());
}

export async function setApiUrl(url: string): Promise<void> {
  await apiUrlItem.setValue(normalizeApiUrl(url));
}

export async function getApiToken(): Promise<string> {
  return (await apiTokenItem.getValue()).trim();
}

export async function setApiToken(token: string): Promise<void> {
  await apiTokenItem.setValue(token.trim());
}

/**
 * Grants the extension access to the configured API host. Only localhost ships
 * in the manifest, so anything else has to be granted at runtime. Resolves true
 * without prompting when the origin is already covered.
 */
export async function requestHostPermission(url: URL): Promise<boolean> {
  return browser.permissions.request({ origins: [`${url.origin}/*`] });
}
