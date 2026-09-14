import { TRPCError } from "@trpc/server";
import type { AuthUser } from "../../context";
import { publicProcedure, trpc } from "./core";

export const EMAIL_NOT_ALLOWED_MESSAGE =
  "Your email is not authorized to access this application.";

/**
 * The ALLOWED_EMAILS gate. An empty or missing list lets everyone in.
 *
 * Only provider logins are checked. The API token is the operator's own
 * credential and the auth-disabled user is the operator by definition; neither
 * has an email to match, and rejecting them would lock the operator out the
 * moment they invite someone else.
 *
 * Case-insensitive on both sides: addresses are case-insensitive in practice,
 * and an allowlist entry typed as "Alice@example.com" must still match.
 */
export function isUserAllowed(
  user: Pick<AuthUser, "email" | "tokenKind">,
  allowedEmails: string[] | null,
) {
  if (!allowedEmails || allowedEmails.length === 0) {
    return true;
  }

  if (user.tokenKind !== "supabase") {
    return true;
  }

  const email = user.email?.trim().toLowerCase();
  return Boolean(
    email && allowedEmails.some((entry) => entry.toLowerCase() === email),
  );
}

export const isAuthed = trpc.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication is required for this procedure.",
    });
  }

  if (!isUserAllowed(ctx.user, ctx.allowedEmails)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: EMAIL_NOT_ALLOWED_MESSAGE,
    });
  }

  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

export const authedProcedure = publicProcedure.use(isAuthed);
