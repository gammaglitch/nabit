import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("root page", () => {
  test("redirects to /items", async () => {
    const { redirect } = await import("next/navigation");
    const { default: Page } = await import("@/app/page");

    try {
      Page();
    } catch {
      // redirect may throw in some Next.js versions
    }

    expect(redirect).toHaveBeenCalledWith("/items");
  });
});
