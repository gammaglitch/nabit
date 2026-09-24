import { fireEvent, render, screen } from "@testing-library/react";
import { TRPCClientError } from "@trpc/client";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ErrorScreen } from "@/components/error-screen";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie";
import {
  endRejectedSession,
  isRejectedSessionError,
  resetSessionRecoveryForTests,
} from "@/lib/auth/session-recovery";
import { getAccessToken, setAccessToken } from "@/lib/auth/token";

const { signOutMock } = vi.hoisted(() => ({
  signOutMock: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock("@/lib/auth/client", () => ({
  getAuthClient: () => ({ signOut: signOutMock }),
}));

function trpcError(code: string) {
  const error = new TRPCClientError("nope");
  // The shape the client attaches from the server's error envelope.
  (error as { data?: unknown }).data = { code };
  return error;
}

function setLocation(pathname: string, search = "") {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: vi.fn(), pathname, protocol: "http:", search },
  });
  return window.location.assign as ReturnType<typeof vi.fn>;
}

describe("isRejectedSessionError", () => {
  test("only an unusable session counts, not an ordinary failure", () => {
    expect(isRejectedSessionError(trpcError("UNAUTHORIZED"))).toBe(true);
    expect(isRejectedSessionError(trpcError("FORBIDDEN"))).toBe(true);

    expect(isRejectedSessionError(trpcError("NOT_FOUND"))).toBe(false);
    expect(isRejectedSessionError(trpcError("INTERNAL_SERVER_ERROR"))).toBe(
      false,
    );
    expect(isRejectedSessionError(new Error("offline"))).toBe(false);
  });
});

describe("endRejectedSession", () => {
  beforeEach(() => {
    resetSessionRecoveryForTests();
    signOutMock.mockClear();
    // Seeding the very thing the code under test has to clear; jsdom has no
    // Cookie Store API to seed it through.
    // biome-ignore lint/suspicious/noDocumentCookie: test fixture
    document.cookie = `${SESSION_COOKIE_NAME}=1; Path=/`;
    setAccessToken("stale-token");
  });

  test("drops the cookie and token, signs out, and returns to login with the way back", async () => {
    const assign = setLocation("/items", "?tag=rust");
    // The token must still be there when the API is asked to revoke it.
    signOutMock.mockImplementationOnce(async () => {
      expect(getAccessToken()).toBe("stale-token");
      return { data: null, error: null };
    });

    await endRejectedSession();

    expect(document.cookie).not.toContain(`${SESSION_COOKIE_NAME}=1`);
    expect(getAccessToken()).toBeNull();
    expect(signOutMock).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/login?next=%2Fitems%3Ftag%3Drust");
  });

  test("clears the session even when sign-out throws", async () => {
    signOutMock.mockRejectedValueOnce(new Error("network"));
    const assign = setLocation("/items");

    await endRejectedSession();

    expect(document.cookie).not.toContain(`${SESSION_COOKIE_NAME}=1`);
    expect(getAccessToken()).toBeNull();
    expect(assign).toHaveBeenCalled();
  });

  test("does not bounce a page that never needed a session", async () => {
    const assign = setLocation("/login");

    await endRejectedSession();

    expect(assign).not.toHaveBeenCalled();
  });

  test("runs once however many queries report the dead session", async () => {
    const assign = setLocation("/items");

    await Promise.all([
      endRejectedSession(),
      endRejectedSession(),
      endRejectedSession(),
    ]);

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledTimes(1);
  });
});

describe("ErrorScreen", () => {
  beforeEach(() => {
    resetSessionRecoveryForTests();
    signOutMock.mockClear();
  });

  test("shows what broke instead of a blank page", () => {
    render(
      <ErrorScreen
        error={Object.assign(new Error("Boom"), { digest: "abc123" })}
      />,
    );

    expect(screen.getByText("Boom")).toBeInTheDocument();
    expect(screen.getByText(/Digest abc123/)).toBeInTheDocument();
    // Nothing to retry when the boundary gave no reset.
    expect(
      screen.queryByRole("button", { name: /try again/i }),
    ).not.toBeInTheDocument();
  });

  test("retries in place", () => {
    const reset = vi.fn();
    render(<ErrorScreen error={new Error("Boom")} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalled();
  });

  test("offers the way out of a session the app cannot use", async () => {
    setLocation("/items");
    render(<ErrorScreen error={new Error("Boom")} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await vi.waitFor(() => expect(signOutMock).toHaveBeenCalled());
  });
});
