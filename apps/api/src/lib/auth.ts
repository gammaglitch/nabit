import type { AuthUser, AuthUserRole } from "@repo/trpc";
import type { Auth } from "./better-auth";
import type { AppEnv } from "./config/env";

const BEARER_PREFIX = "Bearer ";

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export class InvalidAuthTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAuthTokenError";
  }
}

// `getAuth` is read per request rather than captured once, so the instance
// can be swapped after the app is built (tests do).
export function createAuthHeaderVerifier(
  env: AppEnv,
  getAuth: () => Auth | null,
) {
  return async function verifyAuthHeader(authorizationHeader?: string) {
    const token = getBearerToken(authorizationHeader);

    if (!token) {
      return null;
    }

    if (env.apiToken && token === env.apiToken) {
      return {
        email: null,
        id: "api-token",
        role: "admin" as AuthUserRole,
        tokenKind: "api-token" as const,
        userId: null,
      };
    }

    const auth = getAuth();
    if (!auth) {
      throw new AuthConfigurationError(
        "Sign-in is not configured for the API.",
      );
    }

    const result = await auth.api.getSession({
      headers: new Headers({ authorization: `${BEARER_PREFIX}${token}` }),
    });

    if (!result) {
      throw new InvalidAuthTokenError("Invalid or expired bearer token.");
    }

    return {
      email: result.user.email,
      id: result.user.id,
      // Nothing grants admin to a signed-in account yet; the operator is
      // admin through the API token or with auth turned off.
      role: "user",
      tokenKind: "session",
      // Filled in by the auth plugin once the email gate has passed — resolving
      // it needs the database, which token verification has no business touching.
      userId: null,
    } satisfies AuthUser;
  };
}

function getBearerToken(authorizationHeader?: string) {
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) {
    return null;
  }

  return authorizationHeader.slice(BEARER_PREFIX.length).trim();
}
