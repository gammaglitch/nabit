import { publicProcedure, router } from "../../lib/trpc/core";
import { authedProcedure } from "../../lib/trpc/middlewares";
import { HelloWorldInput, HelloWorldOutput, PrivateHelloOutput } from "./dto";

export const helloRouter = router({
  world: publicProcedure
    .input(HelloWorldInput)
    .output(HelloWorldOutput)
    .query(async ({ ctx, input }) => {
      return ctx.services.hello.sayHello(input, {
        requestId: ctx.requestId,
        source: "trpc",
        user: ctx.user,
      });
    }),
  me: authedProcedure.output(PrivateHelloOutput).query(async ({ ctx }) => {
    return ctx.services.hello.sayHelloToAuthenticatedUser({
      requestId: ctx.requestId,
      user: ctx.user,
    });
  }),
});
