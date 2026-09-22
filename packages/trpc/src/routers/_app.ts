import { router } from "../lib/trpc/core";
import { crawlRouter } from "../modules/crawl/router";
import { digestRouter } from "../modules/digest/router";
import { findRouter } from "../modules/find/router";
import { healthRouter } from "../modules/health/router";
import { helloRouter } from "../modules/hello/router";
import { ingestRouter } from "../modules/ingest/router";
import { settingsRouter } from "../modules/settings/router";
import { taggingRouter } from "../modules/tagging/router";
import { tagsRouter } from "../modules/tags/router";
import { usageRouter } from "../modules/usage/router";

export const appRouter = router({
  crawl: crawlRouter,
  digest: digestRouter,
  find: findRouter,
  health: healthRouter,
  hello: helloRouter,
  ingest: ingestRouter,
  settings: settingsRouter,
  tagging: taggingRouter,
  tags: tagsRouter,
  usage: usageRouter,
});

export type AppRouter = typeof appRouter;
