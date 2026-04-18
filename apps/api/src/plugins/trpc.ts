import { appRouter, type TrpcContext } from "@repo/trpc";
import {
  type FastifyTRPCPluginOptions,
  fastifyTRPCPlugin,
} from "@trpc/server/adapters/fastify";
import fp from "fastify-plugin";

type CreateContextOptions = Parameters<
  NonNullable<
    FastifyTRPCPluginOptions<typeof appRouter>["trpcOptions"]["createContext"]
  >
>[0];

function createTrpcContext({ req }: CreateContextOptions): TrpcContext {
  // When auth is disabled, ignore ALLOWED_EMAILS so the email gate in
  // `isAuthed` doesn't reject the synthetic local user.
  const allowedEmails = req.server.env.authRequired
    ? req.server.env.allowedEmails
    : null;

  return {
    allowedEmails,
    requestId: req.id,
    services: req.server.services,
    user: req.user,
  };
}

export default fp(async (app) => {
  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: createTrpcContext,
    },
  });
});
