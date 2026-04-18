import { TRPCError } from "@trpc/server";
import { publicProcedure, trpc } from "./core";

export const isAuthed = trpc.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication is required for this procedure.",
    });
  }

  if (ctx.allowedEmails && ctx.allowedEmails.length > 0) {
    if (
      !ctx.user.email ||
      !ctx.allowedEmails.includes(ctx.user.email.toLowerCase())
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Your email is not authorized to access this application.",
      });
    }
  }

  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

export const authedProcedure = publicProcedure.use(isAuthed);
