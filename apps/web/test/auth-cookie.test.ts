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
});
