import { router } from "../lib/trpc/core";
import { healthRouter } from "../modules/health/router";
import { helloRouter } from "../modules/hello/router";
import { ingestRouter } from "../modules/ingest/router";
import { tagsRouter } from "../modules/tags/router";

export const appRouter = router({
  health: healthRouter,
  hello: helloRouter,
  ingest: ingestRouter,
  tags: tagsRouter,
});

export type AppRouter = typeof appRouter;
