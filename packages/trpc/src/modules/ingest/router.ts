import { router } from "../../lib/trpc/core";
import { authedProcedure } from "../../lib/trpc/middlewares";
import {
  DeleteInput,
  DeleteOutput,
  EnqueueIngestInput,
  EnqueueIngestOutput,
  GetIngestJobInput,
  GetItemInput,
  IngestBatchInput,
  IngestBatchOutput,
  IngestInput,
  IngestJobOutput,
  IngestOutput,
  ItemDetailOutput,
  ItemListInput,
  ItemListOutput,
  ListIngestJobsInput,
  ListIngestJobsOutput,
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
  enqueue: authedProcedure
    .input(EnqueueIngestInput)
    .output(EnqueueIngestOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.ingest.enqueue(input);
    }),
  job: authedProcedure
    .input(GetIngestJobInput)
    .output(IngestJobOutput)
    .query(async ({ ctx, input }) => {
      return ctx.services.ingest.getJob(input);
    }),
  jobs: authedProcedure
    .input(ListIngestJobsInput)
    .output(ListIngestJobsOutput)
    .query(async ({ ctx, input }) => {
      return ctx.services.ingest.listJobs(input ?? {});
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
