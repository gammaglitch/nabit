import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthGate } from "@/components/auth-gate";

const replace = vi.fn();
const useSession = vi.fn();
const usePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
  useRouter: () => ({
    replace,
  }),
}));

vi.mock("@/hooks/use-session", () => ({
  useSession: () => useSession(),
}));

describe("AuthGate", () => {
  beforeEach(() => {
    replace.mockReset();
    useSession.mockReset();
    usePathname.mockReset();
  });

  test("does not crash or redirect before pathname is ready", () => {
    usePathname.mockReturnValue(null);
    useSession.mockReturnValue({ isPending: false, session: null });

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
    useSession.mockReturnValue({ isPending: false, session: null });

    render(
      <AuthGate>
        <div>login page</div>
      </AuthGate>,
    );

    expect(screen.getByText("login page")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  test("waits for the session check before sending anyone to /login", () => {
    usePathname.mockReturnValue("/items");
    useSession.mockReturnValue({ isPending: true, session: null });

    const { container } = render(
      <AuthGate>
        <div>private page</div>
      </AuthGate>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(replace).not.toHaveBeenCalled();
  });

  test("sends a visitor without a session to /login, keeping the destination", () => {
    usePathname.mockReturnValue("/items");
    useSession.mockReturnValue({ isPending: false, session: null });

    render(
      <AuthGate>
        <div>private page</div>
      </AuthGate>,
    );

    expect(screen.queryByText("private page")).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fitems");
  });

  test("renders private routes once signed in", () => {
    usePathname.mockReturnValue("/items");
    useSession.mockReturnValue({
      isPending: false,
      session: { session: {}, user: { email: "me@example.com" } },
    });

    render(
      <AuthGate>
        <div>private page</div>
      </AuthGate>,
    );

    expect(screen.getByText("private page")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
