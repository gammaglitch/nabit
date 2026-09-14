import { describe, expect, test } from "bun:test";
import { isUserAllowed } from "../src/lib/trpc/middlewares";

const supabaseUser = (email: string | null) => ({
  email,
  tokenKind: "supabase" as const,
});

describe("isUserAllowed", () => {
  test("lets everyone in when no allowlist is configured", () => {
    expect(isUserAllowed(supabaseUser("anyone@example.com"), null)).toBe(true);
    expect(isUserAllowed(supabaseUser("anyone@example.com"), [])).toBe(true);
  });

  test("admits listed emails and rejects the rest", () => {
    const allowed = ["alice@example.com", "bob@example.com"];
    expect(isUserAllowed(supabaseUser("bob@example.com"), allowed)).toBe(true);
    expect(isUserAllowed(supabaseUser("eve@example.com"), allowed)).toBe(false);
  });

  test("matches case-insensitively on both sides", () => {
    // The env var is not lowercased when parsed, so an entry typed with
    // capitals used to never match anything.
    expect(
      isUserAllowed(supabaseUser("alice@example.com"), ["Alice@Example.com"]),
    ).toBe(true);
    expect(
      isUserAllowed(supabaseUser("ALICE@example.com"), ["alice@example.com"]),
    ).toBe(true);
  });

  test("rejects a provider login that carries no email", () => {
    expect(isUserAllowed(supabaseUser(null), ["alice@example.com"])).toBe(
      false,
    );
  });

  test("never gates the operator's API token or the auth-disabled user", () => {
    const allowed = ["alice@example.com"];
    expect(
      isUserAllowed({ email: null, tokenKind: "api-token" }, allowed),
    ).toBe(true);
    expect(isUserAllowed({ email: null, tokenKind: "local" }, allowed)).toBe(
      true,
    );
  });
});
