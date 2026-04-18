import { describe, expect, test } from "bun:test";
import {
  getAuthProviders,
  getUserAvatarUrl,
  getUserDisplayName,
  toAuthSessionSummary,
} from "../src";

describe("@repo/auth session helpers", () => {
  test("derives providers from app metadata and identities", () => {
    const providers = getAuthProviders({
      app_metadata: {
        provider: "github",
        providers: ["github"],
      },
      email: "alice@example.com",
      id: "user-1",
      identities: [
        {
          provider: "github",
        },
        {
          provider: "discord",
        },
      ],
    });

    expect(providers).toEqual(["github", "discord"]);
  });

  test("creates a stable session summary and profile fallbacks", () => {
    const session = {
      access_token: "token",
      expires_at: 123,
      user: {
        email: "alice@example.com",
        id: "user-1",
        user_metadata: {
          avatar_url: "https://example.com/avatar.png",
          full_name: "Alice Example",
        },
      },
    };

    expect(toAuthSessionSummary(session)).toEqual({
      email: "alice@example.com",
      expiresAt: 123,
      isAnonymous: false,
      providers: ["email"],
      userId: "user-1",
    });
    expect(getUserDisplayName(session.user)).toBe("Alice Example");
    expect(getUserAvatarUrl(session.user)).toBe(
      "https://example.com/avatar.png",
    );
  });
});
