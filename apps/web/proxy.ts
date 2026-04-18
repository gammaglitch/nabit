import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  hasUsableAccessToken,
} from "@/lib/supabase/auth-cookie";

const PUBLIC_PATH_PREFIXES = ["/login", "/auth/callback"];

// Mirror of <@/lib/auth/required.ts>. Duplicated because the edge proxy
// runs before any of the React tree, so it can't import a "use client"
// helper. `NEXT_PUBLIC_AUTH_REQUIRED` is inlined here at build time.
const AUTH_REQUIRED = process.env.NEXT_PUBLIC_AUTH_REQUIRED !== "false";

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest) {
  // Single-user / self-hosted mode: no gate at any layer.
  if (!AUTH_REQUIRED) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get(AUTH_COOKIE_NAME)?.value ?? null;
  const hasSession = hasUsableAccessToken(accessToken);

  if (!isPublicPath(pathname) && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && hasSession) {
    const itemsUrl = new URL("/items", request.url);
    return NextResponse.redirect(itemsUrl);
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
