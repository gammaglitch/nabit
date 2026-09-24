import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { configureAuth } from "../src/lib/better-auth";
import { buildApp } from "../src/server";

/**
 * ALLOWED_EMAILS used to be checked only by the tRPC middleware, so every REST
 * route accepted any signed-in account. These sign in for real against an
 * in-memory Better Auth and send the session token through the auth plugin.
 *
 * Over a real socket rather than `app.inject`: under Bun, light-my-request
 * never reports a reply sent from an onRequest hook as finished, so Fastify
 * carries on into the route and the test sees a spurious double send.
 */
describe("ALLOWED_EMAILS on REST routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let enqueued: Array<{ actor: unknown; input: Record<string, unknown> }>;

  const envKeys = [
    "ALLOWED_EMAILS",
    "API_TOKEN",
    "AUTH_REQUIRED",
    "BETTER_AUTH_URL",
    "DATABASE_URL",
  ] as const;
  const previousEnv = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  );

  beforeEach(async () => {
    process.env.ALLOWED_EMAILS = "Alice@example.com";
    process.env.API_TOKEN = "operator-secret";
    process.env.AUTH_REQUIRED = "true";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1";
    process.env.DATABASE_URL = "";
    app = await buildApp();
    await app.listen({ host: "127.0.0.1", port: 0 });

    app.auth = configureAuth({
      database: memoryAdapter({
        account: [],
        session: [],
        user: [],
        verification: [],
      }),
      // Eve signed up while she was still on the list, then was taken off it.
      env: {
        ...app.env,
        allowedEmails: ["alice@example.com", "eve@example.com"],
      },
      secret: "test-secret-that-is-long-enough-for-better-auth",
    });

    enqueued = [];
    // biome-ignore lint/suspicious/noExplicitAny: stubbing a service method
    (app.services.ingest as any).enqueue = async (
      input: { url: string },
      actor: unknown,
    ) => {
      enqueued.push({ actor, input });
      return {
        job: { id: enqueued.length, status: "queued", url: input.url },
        reused: false,
      };
    };
  });

  afterEach(async () => {
    await app.close();
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });

  async function tokenFor(email: string) {
    const response = await request("/api/auth/sign-up/email", {
      body: JSON.stringify({ email, name: email, password: "long password" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const token = response.headers.get("set-auth-token");
    if (!token) {
      throw new Error(`sign-up failed with ${response.status}`);
    }
    return token;
  }

  function ingestAs(authorization: string) {
    return request("/ingest", {
      body: JSON.stringify({ url: "https://example.com/a" }),
      headers: { authorization, "content-type": "application/json" },
      method: "POST",
    });
  }

  function request(path: string, init: RequestInit = {}) {
    const { port } = app.server.address() as { port: number };
    // No keep-alive, or app.close() in afterEach waits on the idle socket.
    return fetch(`http://127.0.0.1:${port}${path}`, {
      ...init,
      headers: { ...init.headers, connection: "close" },
    });
  }

  test("rejects a valid session whose email is not on the list", async () => {
    const response = await ingestAs(
      `Bearer ${await tokenFor("eve@example.com")}`,
    );

    expect(response.status).toBe(403);
    expect(enqueued).toHaveLength(0);
  });

  test("admits a listed email regardless of case", async () => {
    const response = await ingestAs(
      `Bearer ${await tokenFor("alice@example.com")}`,
    );

    expect(response.status).toBe(202);
    // No database in this test, so the user cannot be resolved to an id.
    expect(enqueued[0].actor).toEqual({ userId: null });
  });

  test("rejects a token that is not a session", async () => {
    const response = await ingestAs("Bearer not-a-session");

    expect(response.status).toBe(401);
    expect(enqueued).toHaveLength(0);
  });

  test("still accepts the operator's API token, unattributed", async () => {
    const response = await ingestAs("Bearer operator-secret");

    expect(response.status).toBe(202);
    expect(enqueued[0].actor).toEqual({ userId: null });
  });

  test("still leaves public routes open to anonymous callers", async () => {
    const response = await request("/healthz");

    expect(response.status).toBe(200);
  });
});
