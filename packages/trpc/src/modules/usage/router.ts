import { router } from "../../lib/trpc/core";
import { authedProcedure } from "../../lib/trpc/middlewares";
import { UsageSummaryInput, UsageSummaryOutput } from "./dto";

export const usageRouter = router({
  summary: authedProcedure
    .input(UsageSummaryInput)
    .output(UsageSummaryOutput)
    .query(async ({ ctx, input }) => {
      return ctx.services.usage.summary(input);
    }),
});
