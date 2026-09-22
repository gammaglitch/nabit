import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import LoginPage from "@/app/login/page";

const replace = vi.fn();
const signInEmail = vi.fn();
const signUpEmail = vi.fn();
const getSession = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/auth/client", () => ({
  getAuthClient: () => ({
    getSession: () => getSession(),
    signIn: { email: (body: unknown) => signInEmail(body) },
    signUp: { email: (body: unknown) => signUpEmail(body) },
  }),
}));

function fillAndSubmit(buttonName: string) {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "me@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "correct horse" },
  });
  fireEvent.click(screen.getByRole("button", { name: buttonName }));
}

describe("LoginPage", () => {
  beforeEach(() => {
    replace.mockReset();
    signInEmail.mockReset();
    signUpEmail.mockReset();
    getSession.mockReset();
    getSession.mockResolvedValue({
      data: {
        session: { expiresAt: new Date(Date.now() + 60_000).toISOString() },
      },
    });
    window.history.replaceState({}, "", "/login");
  });

  test("signs in and goes to where the visitor was headed", async () => {
    window.history.replaceState({}, "", "/login?next=%2Fsites%2F2");
    signInEmail.mockResolvedValue({ data: {}, error: null });

    render(<LoginPage />);
    fillAndSubmit("Sign in");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sites/2"));
    expect(signInEmail).toHaveBeenCalledWith({
      email: "me@example.com",
      password: "correct horse",
    });
    // Set before navigating, or the proxy bounces the next page back here.
    expect(document.cookie).toContain("nf-session=1");
  });

  test("shows the server's reason when sign-in fails", async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { message: "Invalid email or password" },
    });

    render(<LoginPage />);
    fillAndSubmit("Sign in");

    expect(
      await screen.findByText("Invalid email or password"),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  test("creates an account from the sign-up mode", async () => {
    signUpEmail.mockResolvedValue({ data: {}, error: null });

    render(<LoginPage />);
    fireEvent.click(
      screen.getByRole("button", { name: "New here? Create an account" }),
    );
    fillAndSubmit("Create account");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/items"));
    expect(signUpEmail).toHaveBeenCalledWith({
      email: "me@example.com",
      name: "me",
      password: "correct horse",
    });
  });
});
