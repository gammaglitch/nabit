import type { TrpcServices } from "@repo/trpc";
import type { DatabaseState } from "../db/client";
import { AssetService } from "../modules/assets/service";
import { ChatService } from "../modules/chat/service";
import { CrawlService } from "../modules/crawl/service";
import { DigestService } from "../modules/digest/service";
import { ExportService } from "../modules/export/service";
import { HealthService } from "../modules/health/service";
import { HelloService } from "../modules/hello/service";
import { IngestService } from "../modules/ingest/service";
import { SettingsService } from "../modules/settings/service";
import { TagService } from "../modules/tags/service";
import type { AppEnv } from "./config/env";
import type { AppEventBus } from "./event-bus";

export interface ServiceContainer extends TrpcServices {
  assets: AssetService;
  chat: ChatService;
  crawl: CrawlService;
  digest: DigestService;
  export: ExportService;
  health: HealthService;
  hello: HelloService;
  ingest: IngestService;
  settings: SettingsService;
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
  const settings = new SettingsService(options.database, options.env);
  const ingest = new IngestService(options.database, options.env, assets);

  // Built after ingest because a crawl queues its pages through it, and wired
  // back by hand because ingest calls into the crawl on the way out. Passing
  // either into the other's constructor would be a cycle.
  const crawl = new CrawlService(options.database, ingest);
  ingest.setCrawlHooks({
    onPageFailed: (input) => crawl.markPageFailed(input),
    onPageIngested: (input) => crawl.expand(input),
  });

  return {
    assets,
    chat: new ChatService(exportService, settings, options.env),
    crawl,
    digest: new DigestService(
      options.database,
      options.env,
      exportService,
      settings,
    ),
    export: exportService,
    health: new HealthService({
      database: options.database,
      env: options.env,
    }),
    hello,
    ingest,
    settings,
    tags: new TagService(options.database),
  };
}
