import {
  type AuthUser,
  EMAIL_NOT_ALLOWED_MESSAGE,
  isUserAllowed,
} from "@repo/trpc";
import fp from "fastify-plugin";
import {
  AuthConfigurationError,
  createAuthHeaderVerifier,
  InvalidAuthTokenError,
} from "../lib/auth";
import { AUTH_BASE_PATH } from "../lib/better-auth";

// Used when AUTH_REQUIRED=false — every request gets this user so downstream
// `authedProcedure` checks pass without a JWT. See apps/api/src/lib/config/env.ts.
const LOCAL_USER: AuthUser = {
  email: null,
  id: "auth-disabled",
  role: "admin",
  tokenKind: "local",
  userId: null,
};

export default fp(async (app) => {
  const verifyAuthHeader = createAuthHeaderVerifier(app.env);
  const authRequired = app.env.authRequired;

  app.decorateRequest("user", null);

  app.addHook("onRequest", async (req, reply) => {
    // Better Auth checks its own credentials. A stale token left in the
    // client must not 401 the sign-in that would replace it.
    if (req.url.startsWith(`${AUTH_BASE_PATH}/`)) {
      return;
    }

    if (!authRequired) {
      req.user = LOCAL_USER;
      return;
    }

    let user: AuthUser | null;
    try {
      user = await verifyAuthHeader(req.headers.authorization);
    } catch (error) {
      if (error instanceof AuthConfigurationError) {
        req.log.error(error, "supabase auth is not configured");
        return reply.code(503).send({
          message: "Supabase auth verification is not configured on the API.",
        });
      }

      if (error instanceof InvalidAuthTokenError) {
        return reply.code(401).send({
          message: "Invalid or expired bearer token.",
        });
      }

      throw error;
    }

    if (!user) {
      req.user = null;
      return;
    }

    // Enforced here rather than per route: the tRPC middleware used to be the
    // only place ALLOWED_EMAILS was checked, which left every REST route
    // (/ingest, /chat, /export) open to any account the Supabase project would
    // issue a token to. Checked before the user is resolved, too, so an
    // account that is turned away never gets a `users` row.
    if (!isUserAllowed(user, app.env.allowedEmails)) {
      return reply.code(403).send({ message: EMAIL_NOT_ALLOWED_MESSAGE });
    }

    if (user.tokenKind === "supabase") {
      user = {
        ...user,
        userId: await app.services.users.resolve({
          email: user.email,
          provider: "supabase",
          subject: user.id,
        }),
      };
    }

    req.user = user;
  });
});
