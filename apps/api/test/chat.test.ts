import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { pipeUIMessageStreamToResponse, simulateReadableStream } from "ai";
import { buildApp } from "../src/server";

const previousEnv = {
  authRequired: process.env.AUTH_REQUIRED,
  databaseUrl: process.env.DATABASE_URL,
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
  supabaseUrl: process.env.SUPABASE_URL,
};

const WEB_ORIGIN = "http://localhost:3002";

function userMessage(text: string) {
  return {
    id: "m1",
    role: "user",
    parts: [{ type: "text", text }],
  };
}

// Replaces the model call with a canned UI message stream, but still routes it
// through the real `pipeUIMessageStreamToResponse` — the point of these tests
// is the Fastify hijack/header path, not the LLM.
function stubChatStream(app: Awaited<ReturnType<typeof buildApp>>) {
  const calls: Array<{ itemId: number }> = [];
  // The stub only implements the one method the route calls, so it is widened
  // back to the real signature rather than reconstructing a streamText result.
  type StreamArticleChat = typeof app.services.chat.streamArticleChat;

  app.services.chat.streamArticleChat = (async (input: { itemId: number }) => {
    calls.push({ itemId: input.itemId });
    return {
      pipeUIMessageStreamToResponse: (
        response: Parameters<
          typeof pipeUIMessageStreamToResponse
        >[0]["response"],
        options?: { headers?: Record<string, string> },
      ) =>
        pipeUIMessageStreamToResponse({
          response,
          headers: options?.headers,
          stream: simulateReadableStream({
            chunks: [
              { type: "start" },
              { type: "text-start", id: "0" },
              { type: "text-delta", id: "0", delta: "The article argues " },
              { type: "text-delta", id: "0", delta: "for caching." },
              { type: "text-end", id: "0" },
              { type: "finish" },
            ],
            initialDelayInMs: 0,
            chunkDelayInMs: 0,
          }),
        }),
    };
  }) as unknown as StreamArticleChat;

  return calls;
}

describe("POST /chat", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    process.env.DATABASE_URL = "";
    process.env.SUPABASE_URL = "";
    // Single-user mode: every request arrives with a synthetic admin user, so
    // these tests exercise the route rather than JWT verification.
    process.env.AUTH_REQUIRED = "false";
    process.env.OPENROUTER_API_KEY = "test-key";

    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();

    process.env.AUTH_REQUIRED = previousEnv.authRequired;
    process.env.DATABASE_URL = previousEnv.databaseUrl;
    process.env.OPENROUTER_API_KEY = previousEnv.openrouterApiKey;
    process.env.SUPABASE_URL = previousEnv.supabaseUrl;
  });

  test("streams the answer as SSE and keeps the CORS header", async () => {
    const calls = stubChatStream(app);

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      headers: { origin: WEB_ORIGIN },
      payload: { itemId: 42, messages: [userMessage("What is this about?")] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    // Hijacking the reply bypasses the hook that would normally flush this,
    // so its absence here is exactly the regression worth guarding.
    expect(response.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);
    expect(response.body).toContain("The article argues ");
    expect(response.body).toContain("for caching.");
    expect(calls).toEqual([{ itemId: 42 }]);
  });

  test("rejects a request with no itemId", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: { messages: [userMessage("hi")] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("itemId");
  });

  test("rejects a request with no messages", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: { itemId: 42, messages: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("messages");
  });

  test("reports 503 when no OpenRouter key is configured", async () => {
    await app.close();
    process.env.OPENROUTER_API_KEY = "";
    app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: { itemId: 42, messages: [userMessage("hi")] },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toContain("OPENROUTER_API_KEY");
  });

  test("requires authentication when auth is enabled", async () => {
    await app.close();
    process.env.AUTH_REQUIRED = "true";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: { itemId: 42, messages: [userMessage("hi")] },
    });

    expect(response.statusCode).toBe(401);
  });
});
