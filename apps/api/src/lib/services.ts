import type { TrpcServices } from "@repo/trpc";
import type { DatabaseState } from "../db/client";
import { HealthService } from "../modules/health/service";
import { HelloService } from "../modules/hello/service";
import { IngestService } from "../modules/ingest/service";
import { TagService } from "../modules/tags/service";
import type { AppEnv } from "./config/env";
import type { AppEventBus } from "./event-bus";

export interface ServiceContainer extends TrpcServices {
  health: HealthService;
  hello: HelloService;
  ingest: IngestService;
  tags: TagService;
}

type MakeServicesOptions = {
  bus: AppEventBus;
  database: DatabaseState;
  env: AppEnv;
};

export function makeServices(options: MakeServicesOptions): ServiceContainer {
  const hello = new HelloService(options.bus);

  return {
    health: new HealthService({
      database: options.database,
      env: options.env,
    }),
    hello,
    ingest: new IngestService(options.database, options.env),
    tags: new TagService(options.database),
  };
}
