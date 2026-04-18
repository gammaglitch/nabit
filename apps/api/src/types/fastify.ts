import type { AuthUser, TrpcServices } from "@repo/trpc";
import "fastify";
import type { DatabaseState } from "../db/client";
import type { AppEnv } from "../lib/config/env";
import type { AppEventBus } from "../lib/event-bus";

declare module "fastify" {
  interface FastifyInstance {
    bus: AppEventBus;
    database: DatabaseState;
    env: AppEnv;
    services: TrpcServices;
  }

  interface FastifyRequest {
    user: AuthUser | null;
  }
}
