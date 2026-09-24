import { router } from "../../lib/trpc/core";
import { authedProcedure } from "../../lib/trpc/middlewares";
import { FindSearchInput, FindSearchOutput } from "./dto";

export const findRouter = router({
  // A mutation rather than a query: each call is a paid model request, and it
  // should run when the user presses Enter, not whenever React Query refetches.
  search: authedProcedure
    .input(FindSearchInput)
    .output(FindSearchOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.find.search(input, { userId: ctx.user.userId });
    }),
});
