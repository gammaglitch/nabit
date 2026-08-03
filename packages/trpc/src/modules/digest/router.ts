import { router } from "../../lib/trpc/core";
import { authedProcedure } from "../../lib/trpc/middlewares";
import {
  GetDigestInput,
  GetDigestOutput,
  ListDigestsInput,
  ListDigestsOutput,
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
});
