import { router } from "../../lib/trpc/core";
import { authedProcedure } from "../../lib/trpc/middlewares";
import {
  CancelCrawlInput,
  DeleteCrawlInput,
  DeleteCrawlOutput,
  GetCrawlInput,
  GetCrawlOutput,
  ListCrawlsInput,
  ListCrawlsOutput,
  StartCrawlInput,
  StartCrawlOutput,
} from "./dto";

export const crawlRouter = router({
  start: authedProcedure
    .input(StartCrawlInput)
    .output(StartCrawlOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.crawl.start(input);
    }),
  list: authedProcedure
    .input(ListCrawlsInput)
    .output(ListCrawlsOutput)
    .query(async ({ ctx, input }) => {
      return ctx.services.crawl.list(input ?? {});
    }),
  get: authedProcedure
    .input(GetCrawlInput)
    .output(GetCrawlOutput)
    .query(async ({ ctx, input }) => {
      return ctx.services.crawl.get(input);
    }),
  cancel: authedProcedure
    .input(CancelCrawlInput)
    .output(GetCrawlOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.crawl.cancel(input);
    }),
  delete: authedProcedure
    .input(DeleteCrawlInput)
    .output(DeleteCrawlOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.crawl.delete(input);
    }),
});
