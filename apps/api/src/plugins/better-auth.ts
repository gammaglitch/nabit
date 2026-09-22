import { fromNodeHeaders } from "better-auth/node";
import fp from "fastify-plugin";
import { AUTH_BASE_PATH, createAuth } from "../lib/better-auth";

export default fp(async (app) => {
  app.decorate("auth", createAuth({ database: app.database, env: app.env }));

  // Better Auth speaks Fetch, so each request is rebuilt as one. Fastify has
  // already parsed the JSON body by now; it goes back in as a string.
  app.route({
    method: ["GET", "POST"],
    url: `${AUTH_BASE_PATH}/*`,
    handler: async (req, reply) => {
      if (!app.auth) {
        return reply.code(503).send({
          message: "Sign-in is not configured on the API.",
        });
      }

      const url = new URL(req.url, `${req.protocol}://${req.host}`);
      const response = await app.auth.handler(
        new Request(url, {
          method: req.method,
          headers: fromNodeHeaders(req.headers),
          ...(req.body ? { body: JSON.stringify(req.body) } : {}),
        }),
      );

      reply.status(response.status);
      for (const [key, value] of response.headers) {
        if (key !== "set-cookie") {
          reply.header(key, value);
        }
      }
      // Iterating joins repeated Set-Cookie headers into one, which browsers
      // can't split again.
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) {
        reply.header("set-cookie", cookies);
      }
      return reply.send(response.body ? await response.text() : null);
    },
  });
});
