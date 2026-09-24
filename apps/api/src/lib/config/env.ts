export interface AppEnv {
  allowedEmails: string[] | null;
  apiToken: string | null;
  assetStoragePath: string;
  authRequired: boolean;
  betterAuth: {
    // Signs session tokens. Without it (or without a database) sign-in is off
    // and the /api/auth routes answer 503.
    secret: string | null;
    trustedOrigins: string[];
    url: string | null;
  };
  headlessBrowser: {
    captureUrl: string | null;
    enabled: boolean;
  };
  host: string;
  openrouter: {
    apiKey: string | null;
    enabled: boolean;
    model: string;
  };
  port: number;
  websocketsEnabled: boolean;
}

// Model used for the reader's "ask about this article" chat. Any OpenRouter
// slug works; this one is picked for a large context window (archived articles
// plus their comment trees get long) at a moderate price.
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-5";

export function getAppEnv(): AppEnv {
  const headlessBrowserCaptureUrl = parseOptionalAbsoluteUrl(
    process.env.HEADLESS_BROWSER_CAPTURE_URL,
  );

  const openrouterApiKey = process.env.OPENROUTER_API_KEY?.trim() || null;

  return {
    allowedEmails: parseList(process.env.ALLOWED_EMAILS),
    apiToken: process.env.API_TOKEN?.trim() || null,
    assetStoragePath: process.env.ASSET_STORAGE_PATH?.trim() || "./data/assets",
    // Auth is required unless explicitly disabled. Disabling turns the API
    // into single-user mode — every request gets a synthetic admin user and
    // ALLOWED_EMAILS is ignored. Meant for private self-hosted deployments
    // that already gate the network path (local network, VPN, etc.).
    authRequired: process.env.AUTH_REQUIRED !== "false",
    betterAuth: {
      secret: process.env.BETTER_AUTH_SECRET?.trim() || null,
      // Origins allowed to call the auth routes from a browser — the web app.
      // Better Auth rejects sign-in from any other origin.
      trustedOrigins: (parseList(process.env.AUTH_TRUSTED_ORIGINS) ?? []).map(
        (origin) => new URL(origin).origin,
      ),
      // The API's public origin, used to build the auth endpoints' URLs.
      url: parseOptionalUrl(process.env.BETTER_AUTH_URL),
    },
    headlessBrowser: {
      captureUrl: headlessBrowserCaptureUrl,
      enabled: Boolean(headlessBrowserCaptureUrl),
    },
    host: process.env.HOST ?? "0.0.0.0",
    // Without an API key the chat endpoint stays off and answers 503 — the
    // rest of the API is unaffected.
    openrouter: {
      apiKey: openrouterApiKey,
      enabled: Boolean(openrouterApiKey),
      model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
    },
    port: Number(process.env.PORT ?? 3001),
    websocketsEnabled: parseBoolean(process.env.WEBSOCKETS_ENABLED),
  };
}

function parseBoolean(value: string | undefined) {
  return value === "1" || value === "true";
}

function parseList(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseOptionalUrl(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  return new URL(value).origin;
}

function parseOptionalAbsoluteUrl(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  return new URL(value).toString();
}
