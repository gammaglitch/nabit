import { afterEach, describe, expect, test } from "vitest";
import {
  hasSessionCookie,
  SESSION_COOKIE_NAME,
  syncSessionCookie,
} from "@/lib/auth/session-cookie";

function readCookie() {
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split("=")[1];
}

describe("session cookie", () => {
  afterEach(() => {
    syncSessionCookie(null);
  });

  test("only the marker value counts as a session", () => {
    expect(hasSessionCookie("1")).toBe(true);
    expect(hasSessionCookie(undefined)).toBe(false);
    expect(hasSessionCookie("")).toBe(false);
    // The old cookie held a JWT; nothing but the marker may pass for one.
    expect(hasSessionCookie("eyJhbGciOiJIUzI1NiJ9.e30.sig")).toBe(false);
  });

  test("is set while the session lasts", () => {
    syncSessionCookie(new Date(Date.now() + 60_000));

    expect(hasSessionCookie(readCookie())).toBe(true);
  });

  test("accepts the ISO string the API sends", () => {
    syncSessionCookie(new Date(Date.now() + 60_000).toISOString());

    expect(hasSessionCookie(readCookie())).toBe(true);
  });

  test("is cleared when there is no session, or it has expired", () => {
    syncSessionCookie(new Date(Date.now() + 60_000));
    syncSessionCookie(null);
    expect(readCookie()).toBeUndefined();

    syncSessionCookie(new Date(Date.now() + 60_000));
    syncSessionCookie(new Date(Date.now() - 1_000));
    expect(readCookie()).toBeUndefined();
  });
});
