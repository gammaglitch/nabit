import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import type { DatabaseState } from "../src/db/client";
import type { AppEnv } from "../src/lib/config/env";
import { takeRecentMessages } from "../src/modules/chat/service";
import {
  CHAT_LIMITS,
  clampInt,
  SettingsService,
} from "../src/modules/settings/service";

function makeEnv(overrides: Partial<AppEnv["openrouter"]> = {}): AppEnv {
  return {
    allowedEmails: null,
    apiToken: null,
    assetStoragePath: "./data/assets",
    authRequired: false,
    headlessBrowser: { captureUrl: null, enabled: false },
    host: "127.0.0.1",
    openrouter: {
      apiKey: "test-key",
      enabled: true,
      model: "env/model",
      ...overrides,
    },
    port: 3001,
    supabase: {
      authEnabled: false,
      jwtAudience: ["authenticated"],
      jwtIssuer: null,
      jwksUrl: null,
      url: null,
    },
    websocketsEnabled: false,
  };
}

// No database configured is the normal state for these tests: it exercises
// the fallback path an instance takes before anyone opens the settings menu.
const noDatabase: DatabaseState = { configured: false, db: null };

function textMessage(id: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text: id }] };
}

describe("clampInt", () => {
  test("keeps a value inside the allowed range", () => {
    expect(clampInt(42, CHAT_LIMITS.historyTurns)).toBe(42);
  });

  test("clamps to the bounds rather than rejecting", () => {
    expect(clampInt(0, CHAT_LIMITS.historyTurns)).toBe(
      CHAT_LIMITS.historyTurns.min,
    );
    expect(clampInt(9999, CHAT_LIMITS.historyTurns)).toBe(
      CHAT_LIMITS.historyTurns.max,
    );
  });

  test("falls back when the stored value is not a number", () => {
    expect(clampInt(Number.NaN, CHAT_LIMITS.maxContextChars)).toBe(
      CHAT_LIMITS.maxContextChars.fallback,
    );
  });
});

describe("SettingsService.getChatSettings", () => {
  test("falls back to the env model and built-in limits", async () => {
    const service = new SettingsService(noDatabase, makeEnv());
    const settings = await service.getChatSettings();

    expect(settings.model).toBe("env/model");
    expect(settings.historyTurns).toBe(CHAT_LIMITS.historyTurns.fallback);
    expect(settings.maxContextChars).toBe(CHAT_LIMITS.maxContextChars.fallback);
  });

  test("reports whether the API key is configured without exposing it", async () => {
    const configured = await new SettingsService(
      noDatabase,
      makeEnv(),
    ).getChatSettings();
    expect(configured.apiKeyConfigured).toBe(true);

    const missing = await new SettingsService(
      noDatabase,
      makeEnv({ apiKey: null, enabled: false }),
    ).getChatSettings();
    expect(missing.apiKeyConfigured).toBe(false);

    // The resolved settings are handed straight to the client, so the key
    // itself must never appear anywhere in them.
    expect(JSON.stringify(configured)).not.toContain("test-key");
  });
});

describe("takeRecentMessages", () => {
  test("returns everything when the history is under the limit", () => {
    const messages = [textMessage("a"), textMessage("b")];
    expect(takeRecentMessages(messages, 10)).toEqual(messages);
  });

  test("keeps the most recent messages, not the oldest", () => {
    const messages = ["a", "b", "c", "d", "e"].map(textMessage);
    const trimmed = takeRecentMessages(messages, 2);

    expect(trimmed.map((m) => m.id)).toEqual(["d", "e"]);
  });
});
