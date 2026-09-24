import { EMAIL_NOT_ALLOWED_MESSAGE, isEmailListed } from "@repo/trpc";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { bearer } from "better-auth/plugins";
import type { DatabaseState } from "../db/client";
import {
  authAccountsTable,
  authSessionsTable,
  authUsersTable,
  authVerificationsTable,
} from "../db/schema";
import type { AppEnv } from "./config/env";

export const AUTH_BASE_PATH = "/api/auth";

export type Auth = ReturnType<typeof configureAuth>;

/**
 * Better Auth, email + password only. Clients get a session token from the
 * `set-auth-token` header on sign-in (bearer plugin) and send it back as
 * `Authorization: Bearer`, the same contract the rest of the API already uses.
 *
 * Null when there is no database or no secret to sign sessions with; the auth
 * routes then answer 503 and only the API token can get in.
 */
export function createAuth(options: {
  database: DatabaseState;
  env: AppEnv;
}): Auth | null {
  const { database, env } = options;

  if (!database.db || !env.betterAuth.secret) {
    return null;
  }

  return configureAuth({
    database: drizzleAdapter(database.db, {
      provider: "pg",
      schema: {
        account: authAccountsTable,
        session: authSessionsTable,
        user: authUsersTable,
        verification: authVerificationsTable,
      },
    }),
    env,
    secret: env.betterAuth.secret,
  });
}

// Split from `createAuth` so tests can run the same configuration against
// Better Auth's in-memory adapter instead of Postgres.
export function configureAuth(options: {
  database: BetterAuthOptions["database"];
  env: AppEnv;
  secret: string;
}) {
  const { database, env, secret } = options;

  return betterAuth({
    basePath: AUTH_BASE_PATH,
    baseURL: env.betterAuth.url ?? undefined,
    database,
    databaseHooks: {
      user: {
        create: {
          // Every way an account can come into being passes through here,
          // not just the sign-up endpoint.
          before: async (user) => {
            assertSignupAllowed(user.email, env.allowedEmails);
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
    },
    plugins: [bearer()],
    secret,
    telemetry: {
      enabled: false,
    },
    trustedOrigins: env.betterAuth.trustedOrigins,
  });
}

/**
 * Only emails on ALLOWED_EMAILS may create an account, and with no list
 * nobody can: an open sign-up form on a self-hosted server would hand the
 * library to whoever finds the URL first.
 */
export function assertSignupAllowed(
  email: string,
  allowedEmails: string[] | null,
) {
  if (!isEmailListed(email, allowedEmails)) {
    throw new APIError("FORBIDDEN", { message: EMAIL_NOT_ALLOWED_MESSAGE });
  }
}
