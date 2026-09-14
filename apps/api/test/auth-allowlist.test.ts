import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { buildApp } from "../src/server";

/**
 * ALLOWED_EMAILS used to be checked only by the tRPC middleware, so every REST
 * route accepted any token the Supabase project would sign. These run real
 * JWTs through the auth plugin, verified against a JWKS served locally.
 *
 * Over a real socket rather than `app.inject`: under Bun, light-my-request
 * never reports a reply sent from an onRequest hook as finished, so Fastify
 * carries on into the route and the test sees a spurious double send.
 */
describe("ALLOWED_EMAILS on REST routes", () => {
  const issuer = "https://auth.test/auth/v1";
  let privateKey: CryptoKey;
  let jwksServer: ReturnType<typeof Bun.serve>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let enqueued: Array<{ actor: unknown; input: Record<string, unknown> }>;

  const envKeys = [
    "ALLOWED_EMAILS",
    "API_TOKEN",
    "AUTH_REQUIRED",
    "DATABASE_URL",
    "SUPABASE_JWKS_URL",
    "SUPABASE_JWT_ISSUER",
    "SUPABASE_URL",
  ] as const;
  const previousEnv = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  );

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    const jwk = {
      ...(await exportJWK(pair.publicKey)),
      alg: "RS256",
      kid: "k1",
    };
    jwksServer = Bun.serve({
      fetch: () => Response.json({ keys: [jwk] }),
      port: 0,
    });
  });

  afterAll(() => {
    jwksServer.stop(true);
  });

  beforeEach(async () => {
    process.env.ALLOWED_EMAILS = "Alice@example.com";
    process.env.API_TOKEN = "operator-secret";
    process.env.AUTH_REQUIRED = "true";
    process.env.DATABASE_URL = "";
    process.env.SUPABASE_JWKS_URL = `http://localhost:${jwksServer.port}/jwks`;
    process.env.SUPABASE_JWT_ISSUER = issuer;
    process.env.SUPABASE_URL = "https://auth.test";
    app = await buildApp();
    await app.listen({ host: "127.0.0.1", port: 0 });

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

  function tokenFor(email: string) {
    return new SignJWT({ email, role: "authenticated" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setSubject(`sub-${email}`)
      .setIssuer(issuer)
      .setAudience("authenticated")
      .setExpirationTime("5m")
      .sign(privateKey);
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

  test("rejects a valid login whose email is not on the list", async () => {
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
