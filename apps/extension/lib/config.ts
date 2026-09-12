import {
  HN_HOST_PERMISSION,
  type HnFavorite,
  type HnFavoriteKind,
} from "./hn-favorites";

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

const hnUsernameItem = storage.defineItem<string>("local:hnUsername", {
  fallback: "",
});

export async function getHnUsername(): Promise<string> {
  return (await hnUsernameItem.getValue()).trim();
}

export async function setHnUsername(username: string): Promise<void> {
  await hnUsernameItem.setValue(username.trim());
}

/**
 * news.ycombinator.com is deliberately *not* in the manifest — baking it into
 * `host_permissions` would put a scary install-time warning in front of every
 * user for a feature most never touch. It's covered by
 * `optional_host_permissions` instead and requested on the first import;
 * afterwards this resolves true without prompting again.
 */
export async function requestHackerNewsPermission(): Promise<boolean> {
  return browser.permissions.request({ origins: [HN_HOST_PERMISSION] });
}

export interface HnFavoritesCache {
  favorites: HnFavorite[];
  fetchedAt: number;
  kind: HnFavoriteKind;
  username: string;
}

/**
 * The last list fetched. A popup closes the moment anything outside it is
 * clicked, which would otherwise throw away a multi-page walk the user waited
 * on — the background worker keeps going and stores the result here, so
 * reopening the popup finds it ready to send.
 */
const hnFavoritesItem = storage.defineItem<HnFavoritesCache | null>(
  "local:hnFavorites",
  { fallback: null },
);

export async function getHnFavoritesCache(): Promise<HnFavoritesCache | null> {
  return hnFavoritesItem.getValue();
}

export async function setHnFavoritesCache(
  cache: HnFavoritesCache,
): Promise<void> {
  await hnFavoritesItem.setValue(cache);
}
