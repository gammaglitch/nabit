import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { EMAIL_NOT_ALLOWED_MESSAGE } from "@repo/trpc";
import { memoryAdapter } from "better-auth/adapters/memory";
import { assertSignupAllowed, configureAuth } from "../src/lib/better-auth";
import { buildApp } from "../src/server";

const ENV_KEYS = [
  "ALLOWED_EMAILS",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "DATABASE_URL",
] as const;

const SECRET = "test-secret-that-is-long-enough-for-better-auth";

describe("assertSignupAllowed", () => {
  test("lets a listed email through, whatever its case", () => {
    expect(() =>
      assertSignupAllowed("Me@Example.com", ["me@example.com"]),
    ).not.toThrow();
  });

  test("turns away an email that is not on the list", () => {
    expect(() =>
      assertSignupAllowed("stranger@example.com", ["me@example.com"]),
    ).toThrow(EMAIL_NOT_ALLOWED_MESSAGE);
  });

  test("closes sign-up when there is no list at all", () => {
    expect(() => assertSignupAllowed("me@example.com", null)).toThrow(
      EMAIL_NOT_ALLOWED_MESSAGE,
    );
    expect(() => assertSignupAllowed("me@example.com", [])).toThrow(
      EMAIL_NOT_ALLOWED_MESSAGE,
    );
  });
});

describe("/api/auth", () => {
  const previousEnv = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    process.env.ALLOWED_EMAILS = "me@example.com";
    process.env.BETTER_AUTH_SECRET = SECRET;
    process.env.BETTER_AUTH_URL = "http://localhost:3001";
    process.env.DATABASE_URL = "";
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    for (const key of ENV_KEYS) {
      // Assigning undefined would leave the string "undefined" behind.
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });

  // No database means no Better Auth, so sign-in is off.
  test("answers 503 when sign-in is not configured", async () => {
    expect(app.auth).toBeNull();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/ok",
      // A leftover token must not be judged by the API's own auth hook.
      headers: { authorization: "Bearer stale" },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().message).toBe(
      "Sign-in is not configured on the API.",
    );
  });

  describe("with an in-memory store", () => {
    beforeEach(() => {
      app.auth = configureAuth({
        database: memoryAdapter({
          account: [],
          session: [],
          user: [],
          verification: [],
        }),
        env: app.env,
        secret: SECRET,
      });
    });

    function signUp(email: string) {
      return app.inject({
        method: "POST",
        url: "/api/auth/sign-up/email",
        payload: { email, name: "Me", password: "correct horse battery" },
      });
    }

    test("signs up a listed email and hands back a bearer token", async () => {
      const signUpResponse = await signUp("me@example.com");
      expect(signUpResponse.statusCode).toBe(200);

      const token = signUpResponse.headers["set-auth-token"];
      expect(typeof token).toBe("string");

      const sessionResponse = await app.inject({
        method: "GET",
        url: "/api/auth/get-session",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(sessionResponse.statusCode).toBe(200);
      expect(sessionResponse.json().user.email).toBe("me@example.com");
    });

    test("refuses to sign up an email that is not listed", async () => {
      const response = await signUp("stranger@example.com");

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toBe(EMAIL_NOT_ALLOWED_MESSAGE);
    });

    test("signs in with the right password only", async () => {
      await signUp("me@example.com");

      const signIn = (password: string) =>
        app.inject({
          method: "POST",
          url: "/api/auth/sign-in/email",
          payload: { email: "me@example.com", password },
        });

      const good = await signIn("correct horse battery");
      expect(good.statusCode).toBe(200);
      expect(typeof good.headers["set-auth-token"]).toBe("string");

      const bad = await signIn("wrong password");
      expect(bad.statusCode).toBe(401);
    });
  });
});
