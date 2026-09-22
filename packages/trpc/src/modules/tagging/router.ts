import { router } from "../../lib/trpc/core";
import { authedProcedure } from "../../lib/trpc/middlewares";
import {
  LatestTagRunOutput,
  StartTagRunInput,
  SuggestTagsInput,
  SuggestTagsOutput,
  TagRunEstimateOutput,
  TagRunIdInput,
  TagRunOutput,
} from "./dto";

export const taggingRouter = router({
  // A mutation, not a query: every call is a paid Jev request, so it runs
  // when the user asks for suggestions rather than whenever a cache expires.
  suggest: authedProcedure
    .input(SuggestTagsInput)
    .output(SuggestTagsOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.tagging.suggest(input, {
        userId: ctx.user.userId,
      });
    }),
  /** How many items a bulk run would weigh, before committing to one. */
  estimateRun: authedProcedure
    .input(StartTagRunInput)
    .output(TagRunEstimateOutput)
    .query(async ({ ctx, input }) => {
      return ctx.services.tagging.estimateRun(input);
    }),
  // Queues the pass and returns immediately: the worker does the scoring,
  // which takes minutes and must not be held open on an HTTP request.
  startRun: authedProcedure
    .input(StartTagRunInput)
    .output(TagRunOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.tagging.startRun(input, {
        userId: ctx.user.userId,
      });
    }),
  getRun: authedProcedure
    .input(TagRunIdInput)
    .output(TagRunOutput)
    .query(async ({ ctx, input }) => {
      return ctx.services.tagging.getRun(input);
    }),
  latestRun: authedProcedure
    .output(LatestTagRunOutput)
    .query(async ({ ctx }) => {
      return ctx.services.tagging.latestRun();
    }),
  /** Writes the scored matches to the items. Only a scored run can apply. */
  applyRun: authedProcedure
    .input(TagRunIdInput)
    .output(TagRunOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.tagging.applyRun(input);
    }),
  cancelRun: authedProcedure
    .input(TagRunIdInput)
    .output(TagRunOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.tagging.cancelRun(input);
    }),
});
