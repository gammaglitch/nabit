export interface AppEnv {
  allowedEmails: string[] | null;
  apiToken: string | null;
  authRequired: boolean;
  headlessBrowser: {
    captureUrl: string | null;
    enabled: boolean;
  };
  host: string;
  port: number;
  supabase: {
    authEnabled: boolean;
    jwtAudience: string[];
    jwtIssuer: string | null;
    jwksUrl: string | null;
    url: string | null;
  };
  websocketsEnabled: boolean;
}

export function getAppEnv(): AppEnv {
  const headlessBrowserCaptureUrl = parseOptionalAbsoluteUrl(
    process.env.HEADLESS_BROWSER_CAPTURE_URL,
  );

  const supabaseUrl = parseOptionalUrl(process.env.SUPABASE_URL);
  const jwtIssuer =
    process.env.SUPABASE_JWT_ISSUER ?? deriveSupabaseAuthUrl(supabaseUrl);
  const jwksUrl =
    process.env.SUPABASE_JWKS_URL ?? deriveSupabaseJwksUrl(supabaseUrl);

  return {
    allowedEmails: parseList(process.env.ALLOWED_EMAILS),
    apiToken: process.env.API_TOKEN?.trim() || null,
    // Auth is required unless explicitly disabled. Disabling turns the API
    // into single-user mode — every request gets a synthetic admin user and
    // ALLOWED_EMAILS is ignored. Meant for private self-hosted deployments
    // that already gate the network path (local network, VPN, etc.).
    authRequired: process.env.AUTH_REQUIRED !== "false",
    headlessBrowser: {
      captureUrl: headlessBrowserCaptureUrl,
      enabled: Boolean(headlessBrowserCaptureUrl),
    },
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 3001),
    supabase: {
      authEnabled: Boolean(supabaseUrl),
      jwtAudience: parseList(process.env.SUPABASE_JWT_AUDIENCE) ?? [
        "authenticated",
      ],
      jwtIssuer,
      jwksUrl,
      url: supabaseUrl,
    },
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

function deriveSupabaseAuthUrl(supabaseUrl: string | null) {
  if (!supabaseUrl) {
    return null;
  }

  return `${supabaseUrl}/auth/v1`;
}

function deriveSupabaseJwksUrl(supabaseUrl: string | null) {
  if (!supabaseUrl) {
    return null;
  }

  return `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
}
