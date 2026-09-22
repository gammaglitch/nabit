import { TRPCError } from "@trpc/server";
import type { AuthUser } from "../../context";
import { publicProcedure, trpc } from "./core";

export const EMAIL_NOT_ALLOWED_MESSAGE =
  "Your email is not authorized to access this application.";

/**
 * The ALLOWED_EMAILS gate. An empty or missing list lets everyone in.
 *
 * Only signed-in sessions are checked. The API token is the operator's own
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

  if (user.tokenKind !== "session") {
    return true;
  }

  return isEmailListed(user.email, allowedEmails);
}

/**
 * Whether `email` is on the list, case-insensitively. Unlike `isUserAllowed`
 * an empty list matches nothing: this is the strict check sign-up uses, where
 * no list means nobody may create an account.
 */
export function isEmailListed(
  email: string | null | undefined,
  allowedEmails: string[] | null,
) {
  const normalized = email?.trim().toLowerCase();
  return Boolean(
    normalized &&
      allowedEmails?.some((entry) => entry.toLowerCase() === normalized),
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
