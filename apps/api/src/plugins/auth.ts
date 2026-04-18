import type { AuthUser } from "@repo/trpc";
import fp from "fastify-plugin";
import {
  AuthConfigurationError,
  createAuthHeaderVerifier,
  InvalidAuthTokenError,
} from "../lib/auth";

// Used when AUTH_REQUIRED=false — every request gets this user so downstream
// `authedProcedure` checks pass without a JWT. See apps/api/src/lib/config/env.ts.
const LOCAL_USER: AuthUser = {
  email: null,
  id: "auth-disabled",
  role: "admin",
  tokenKind: "supabase",
};

export default fp(async (app) => {
  const verifyAuthHeader = createAuthHeaderVerifier(app.env);
  const authRequired = app.env.authRequired;

  app.decorateRequest("user", null);

  app.addHook("onRequest", async (req, reply) => {
    if (!authRequired) {
      req.user = LOCAL_USER;
      return;
    }

    try {
      req.user = await verifyAuthHeader(req.headers.authorization);
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
  });
});
