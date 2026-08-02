import type { TrpcServices } from "@repo/trpc";
import type { DatabaseState } from "../db/client";
import { AssetService } from "../modules/assets/service";
import { ChatService } from "../modules/chat/service";
import { ExportService } from "../modules/export/service";
import { HealthService } from "../modules/health/service";
import { HelloService } from "../modules/hello/service";
import { IngestService } from "../modules/ingest/service";
import { TagService } from "../modules/tags/service";
import type { AppEnv } from "./config/env";
import type { AppEventBus } from "./event-bus";

export interface ServiceContainer extends TrpcServices {
  assets: AssetService;
  chat: ChatService;
  export: ExportService;
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
  const assets = new AssetService(
    options.database,
    options.env.assetStoragePath,
  );
  const exportService = new ExportService(options.database);

  return {
    assets,
    chat: new ChatService(exportService, options.env),
    export: exportService,
    health: new HealthService({
      database: options.database,
      env: options.env,
    }),
    hello,
    ingest: new IngestService(options.database, options.env, assets),
    tags: new TagService(options.database),
  };
}
