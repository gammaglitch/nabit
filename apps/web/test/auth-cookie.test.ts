import { describe, expect, test } from "vitest";
import {
  getAccessTokenExpiry,
  hasUsableAccessToken,
} from "@/lib/supabase/auth-cookie";

function createToken(payload: object) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );

  return `header.${encodedPayload}.signature`;
}

describe("auth cookie helpers", () => {
  test("reads jwt expiry from the payload", () => {
    const token = createToken({ exp: 1_900_000_000 });

    expect(getAccessTokenExpiry(token)).toBe(1_900_000_000);
  });

  test("rejects expired access tokens", () => {
    const token = createToken({ exp: 100 });

    expect(hasUsableAccessToken(token, 101_000)).toBe(false);
  });

  test("accepts tokens with a future expiry", () => {
    const token = createToken({ exp: 1_900_000_000 });

    expect(hasUsableAccessToken(token, 1_800_000_000_000)).toBe(true);
  });

  test("rejects a missing or empty cookie", () => {
    expect(hasUsableAccessToken(null)).toBe(false);
    expect(hasUsableAccessToken(undefined)).toBe(false);
    expect(hasUsableAccessToken("")).toBe(false);
  });

  // Every case below used to return true, which let proxy.ts wave the request
  // through while the client found no session and redirected to /login — where
  // the proxy saw the same cookie and bounced it back. Clearing site data was
  // the only escape, so these must stay false.
  test.each([
    ["not a jwt at all", "garbage"],
    ["only a header segment", "header"],
    ["an empty payload segment", "header..signature"],
    ["undecodable base64 in the payload", "header.!!!not-base64!!!.signature"],
    ["a payload that is not json", `header.${btoa("plain text")}.signature`],
  ])("treats %s as no session", (_case, token) => {
    expect(getAccessTokenExpiry(token)).toBeNull();
    expect(hasUsableAccessToken(token)).toBe(false);
  });

  test("rejects a payload whose exp is not a number", () => {
    // Shape-valid JWT, unusable claim — the permissive branch accepted it.
    const token = createToken({ exp: "1900000000" });

    expect(getAccessTokenExpiry(token)).toBeNull();
    expect(hasUsableAccessToken(token)).toBe(false);
  });

  test("rejects a payload with no exp claim", () => {
    const token = createToken({ sub: "user-123" });

    expect(hasUsableAccessToken(token)).toBe(false);
  });
});
