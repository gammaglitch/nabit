import { router } from "../../lib/trpc/core";
import { authedProcedure } from "../../lib/trpc/middlewares";
import {
  DeleteInput,
  DeleteOutput,
  GetItemInput,
  IngestBatchInput,
  IngestBatchOutput,
  IngestInput,
  IngestOutput,
  ItemDetailOutput,
  ItemListInput,
  ItemListOutput,
} from "./dto";

export const ingestRouter = router({
  ingest: authedProcedure
    .input(IngestInput)
    .output(IngestOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.ingest.ingest(input);
    }),
  batch: authedProcedure
    .input(IngestBatchInput)
    .output(IngestBatchOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.ingest.ingestBatch(input);
    }),
  list: authedProcedure
    .input(ItemListInput)
    .output(ItemListOutput)
    .query(async ({ ctx, input }) => {
      return ctx.services.ingest.list(input ?? {});
    }),
  get: authedProcedure
    .input(GetItemInput)
    .output(ItemDetailOutput)
    .query(async ({ ctx, input }) => {
      return ctx.services.ingest.get(input);
    }),
  delete: authedProcedure
    .input(DeleteInput)
    .output(DeleteOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.ingest.delete(input);
    }),
});
