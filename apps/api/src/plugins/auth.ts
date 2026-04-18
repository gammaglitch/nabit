import fp from "fastify-plugin";
import {
  AuthConfigurationError,
  createAuthHeaderVerifier,
  InvalidAuthTokenError,
} from "../lib/auth";

export default fp(async (app) => {
  const verifyAuthHeader = createAuthHeaderVerifier(app.env);

  app.decorateRequest("user", null);

  app.addHook("onRequest", async (req, reply) => {
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
