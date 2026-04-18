import { publicProcedure, router } from "../../lib/trpc/core";
import { HealthCheckOutput } from "./dto";

export const healthRouter = router({
  check: publicProcedure.output(HealthCheckOutput).query(async ({ ctx }) => {
    return ctx.services.health.check({
      requestId: ctx.requestId,
    });
  }),
});
