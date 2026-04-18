import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthGate } from "@/components/auth-gate";

const replace = vi.fn();
const useBrowserSupabaseSession = vi.fn();
const usePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
  useRouter: () => ({
    replace,
  }),
}));

vi.mock("@/hooks/use-browser-supabase-session", () => ({
  useBrowserSupabaseSession: () => useBrowserSupabaseSession(),
}));

describe("AuthGate", () => {
  beforeEach(() => {
    replace.mockReset();
    useBrowserSupabaseSession.mockReset();
    usePathname.mockReset();
  });

  test("does not crash or redirect before pathname is ready", () => {
    usePathname.mockReturnValue(null);
    useBrowserSupabaseSession.mockReturnValue({
      session: null,
      supabaseClient: {},
      supabaseError: null,
    });

    const { container } = render(
      <AuthGate>
        <div>private page</div>
      </AuthGate>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(replace).not.toHaveBeenCalled();
  });

  test("renders public routes without an authenticated session", () => {
    usePathname.mockReturnValue("/login");
    useBrowserSupabaseSession.mockReturnValue({
      session: null,
      supabaseClient: {},
      supabaseError: null,
    });

    render(
      <AuthGate>
        <div>login page</div>
      </AuthGate>,
    );

    expect(screen.getByText("login page")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
