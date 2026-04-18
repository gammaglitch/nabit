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
  return {
    allowedEmails: req.server.env.allowedEmails,
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
