const DEFAULT_API_URL = "http://localhost:3001";

const apiUrlItem = storage.defineItem<string>("local:apiUrl", {
  fallback: DEFAULT_API_URL,
});

const apiTokenItem = storage.defineItem<string>("local:apiToken", {
  fallback: "",
});

/** Strips trailing slashes so callers can append paths safely. */
export function normalizeApiUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

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
