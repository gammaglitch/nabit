import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("ingest page", () => {
  test("redirects to /items", async () => {
    const { redirect } = await import("next/navigation");
    const { default: Page } = await import("@/app/ingest/page");

    try {
      Page();
    } catch {
      // redirect may throw in some Next.js versions
    }

    expect(redirect).toHaveBeenCalledWith("/items");
  });
});
