import { router } from "../lib/trpc/core";
import { digestRouter } from "../modules/digest/router";
import { healthRouter } from "../modules/health/router";
import { helloRouter } from "../modules/hello/router";
import { ingestRouter } from "../modules/ingest/router";
import { settingsRouter } from "../modules/settings/router";
import { tagsRouter } from "../modules/tags/router";

export const appRouter = router({
  digest: digestRouter,
  health: healthRouter,
  hello: helloRouter,
  ingest: ingestRouter,
  settings: settingsRouter,
  tags: tagsRouter,
});

export type AppRouter = typeof appRouter;
