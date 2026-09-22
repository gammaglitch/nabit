import type { AuthUser } from "@repo/trpc";
import "fastify";
import type { DatabaseState } from "../db/client";
import type { Auth } from "../lib/better-auth";
import type { AppEnv } from "../lib/config/env";
import type { AppEventBus } from "../lib/event-bus";
import type { ServiceContainer } from "../lib/services";

declare module "fastify" {
  interface FastifyInstance {
    auth: Auth | null;
    bus: AppEventBus;
    database: DatabaseState;
    env: AppEnv;
    services: ServiceContainer;
  }

  interface FastifyRequest {
    user: AuthUser | null;
  }
}
