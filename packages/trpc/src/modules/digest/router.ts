import { router } from "../../lib/trpc/core";
import { authedProcedure } from "../../lib/trpc/middlewares";
import {
  GetDigestInput,
  GetDigestOutput,
  ListDigestsInput,
  ListDigestsOutput,
  TriggerDigestInput,
  TriggerDigestOutput,
} from "./dto";

export const digestRouter = router({
  list: authedProcedure
    .input(ListDigestsInput)
    .output(ListDigestsOutput)
    .query(async ({ ctx, input }) => {
      return ctx.services.digest.list(input ?? {});
    }),
  get: authedProcedure
    .input(GetDigestInput)
    .output(GetDigestOutput)
    .query(async ({ ctx, input }) => {
      return ctx.services.digest.get(input);
    }),
  // Queues a (re)build. Returns as soon as the row is marked pending — the
  // worker does the work, which can take minutes and must not be held open on
  // an HTTP request.
  trigger: authedProcedure
    .input(TriggerDigestInput)
    .output(TriggerDigestOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.digest.trigger(input ?? {});
    }),
});
