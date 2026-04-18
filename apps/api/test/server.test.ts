import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildApp } from "../src/server";

const previousEnv = {
  databaseUrl: process.env.DATABASE_URL,
  supabaseUrl: process.env.SUPABASE_URL,
  tursoAuthToken: process.env.TURSO_AUTH_TOKEN,
  tursoDatabaseUrl: process.env.TURSO_DATABASE_URL,
  websocketsEnabled: process.env.WEBSOCKETS_ENABLED,
};

describe("API server", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    process.env.DATABASE_URL = "";
    process.env.SUPABASE_URL = "";
    process.env.TURSO_AUTH_TOKEN = "";
    process.env.TURSO_DATABASE_URL = "";
    process.env.WEBSOCKETS_ENABLED = "";

    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();

    process.env.DATABASE_URL = previousEnv.databaseUrl;
    process.env.SUPABASE_URL = previousEnv.supabaseUrl;
    process.env.TURSO_AUTH_TOKEN = previousEnv.tursoAuthToken;
    process.env.TURSO_DATABASE_URL = previousEnv.tursoDatabaseUrl;
    process.env.WEBSOCKETS_ENABLED = previousEnv.websocketsEnabled;
  });

  test("responds from /healthz", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();

    expect(body.ok).toBe(true);
    expect(body.service).toBe("@repo/api");
    expect(body.database.configured).toBe(false);
    expect(body.websockets.enabled).toBe(false);
  });

  test("responds from /hello", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/hello?name=Boilerplate",
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();

    expect(body.message).toBe("Hello, Boilerplate!");
    expect(typeof body.requestId).toBe("string");
    expect(typeof body.servedAt).toBe("string");
  });
});
