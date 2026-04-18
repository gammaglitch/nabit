import type { AuthUser, AuthUserRole } from "@repo/trpc";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import type { AppEnv } from "./config/env";

const BEARER_PREFIX = "Bearer ";

type SupabaseAccessTokenPayload = JWTPayload & {
  app_metadata?: {
    role?: unknown;
  };
  email?: unknown;
  role?: unknown;
};

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

export function createAuthHeaderVerifier(env: AppEnv) {
  const jwksUrl = env.supabase.jwksUrl;
  const jwtIssuer = env.supabase.jwtIssuer;

  const jwks = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null;

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
        tokenKind: "supabase" as const,
      };
    }

    if (!env.supabase.authEnabled || !jwks || !jwtIssuer) {
      throw new AuthConfigurationError(
        "Supabase auth verification is not configured for the API.",
      );
    }

    try {
      const { payload } = await jwtVerify(token, jwks, {
        audience: env.supabase.jwtAudience,
        issuer: jwtIssuer,
      });

      return mapSupabaseJwtPayloadToAuthUser(payload);
    } catch (error) {
      throw new InvalidAuthTokenError(
        error instanceof Error
          ? error.message
          : "Invalid or expired bearer token.",
      );
    }
  };
}

function getBearerToken(authorizationHeader?: string) {
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) {
    return null;
  }

  return authorizationHeader.slice(BEARER_PREFIX.length).trim();
}

function mapSupabaseJwtPayloadToAuthUser(payload: JWTPayload): AuthUser {
  const claims = payload as SupabaseAccessTokenPayload;

  if (typeof claims.sub !== "string" || !claims.sub) {
    throw new InvalidAuthTokenError(
      "Supabase access token is missing a subject.",
    );
  }

  return {
    email: typeof claims.email === "string" ? claims.email : null,
    id: claims.sub,
    role: getAuthUserRole(claims),
    tokenKind: "supabase",
  };
}

function getAuthUserRole(payload: SupabaseAccessTokenPayload): AuthUserRole {
  if (payload.app_metadata?.role === "admin") {
    return "admin";
  }

  if (payload.role === "admin") {
    return "admin";
  }

  return "user";
}
