import { describe, expect, test, vi } from "vitest";

const createAuthClient = vi.fn((_options: unknown) => ({}));

vi.mock("better-auth/react", () => ({
  createAuthClient: (options: unknown) => createAuthClient(options),
}));

describe("getAuthClient", () => {
  // The API allows any origin but not credentials. A client that sends
  // cookies gets every /api/auth response blocked by the browser, which
  // tests that talk to the API directly never see.
  test("sends no cookies, only the bearer token", async () => {
    const { getAuthClient } = await import("@/lib/auth/client");

    getAuthClient();

    expect(createAuthClient).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchOptions: expect.objectContaining({ credentials: "omit" }),
      }),
    );
  });
});
