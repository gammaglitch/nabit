import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  isPublicAuthPath,
  NEXT_PARAM,
  safeNextPath,
  toNextPath,
} from "@/lib/auth/next-path";
import {
  AUTH_COOKIE_NAME,
  hasUsableAccessToken,
} from "@/lib/supabase/auth-cookie";

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
  const accessToken = request.cookies.get(AUTH_COOKIE_NAME)?.value ?? null;
  const hasSession = hasUsableAccessToken(accessToken);

  if (!isPublicAuthPath(pathname) && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    // Carry the destination through the bounce. An access token that has
    // expired but is still refreshable looks like no session here, so this
    // fires on a perfectly ordinary deep link — following one used to land on
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
