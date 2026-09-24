import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  isPublicAuthPath,
  NEXT_PARAM,
  safeNextPath,
  toNextPath,
} from "@/lib/auth/next-path";
import {
  hasSessionCookie,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session-cookie";

// Mirror of <@/lib/auth/required.ts>. Duplicated because the edge proxy
// runs before any of the React tree, so it can't import a "use client"
// helper. `NEXT_PUBLIC_AUTH_REQUIRED` is inlined here at build time.
const AUTH_REQUIRED = process.env.NEXT_PUBLIC_AUTH_REQUIRED !== "false";

export function proxy(request: NextRequest) {
  // Single-user / self-hosted mode: no gate at any layer.
  if (!AUTH_REQUIRED) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const hasSession = hasSessionCookie(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  if (!isPublicAuthPath(pathname) && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    // Carry the destination through the bounce, so following a deep link
    // while signed out lands where it pointed once you sign in, not on
    // /items with no sign anything had been redirected.
    const next = toNextPath(pathname, request.nextUrl.search);
    if (next) loginUrl.searchParams.set(NEXT_PARAM, next);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && hasSession) {
    const next = safeNextPath(request.nextUrl.searchParams.get(NEXT_PARAM));
    return NextResponse.redirect(new URL(next ?? "/items", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip auth check on static assets. `.*\..*` matches any path containing
  // a dot (i.e., a file extension: .png, .svg, .css, .js, ...) — without
  // this, served static files like /logo/mark.png would also be redirected
  // to /login when the visitor isn't authenticated, breaking the login
  // screen itself.
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};
