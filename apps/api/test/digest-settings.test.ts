import { describe, expect, test } from "bun:test";
import type { DatabaseState } from "../src/db/client";
import type { AppEnv } from "../src/lib/config/env";
import {
  DIGEST_FALLBACK_TIMEZONE,
  DIGEST_LIMITS,
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

// As with the chat settings tests: no database is the state an instance is in
// before anyone opens the settings menu, and the digest must still resolve.
const noDatabase: DatabaseState = { configured: false, db: null };

describe("SettingsService.getDigestSettings", () => {
  test("falls back to built-in defaults with nothing stored", async () => {
    const service = new SettingsService(noDatabase, makeEnv());
    const settings = await service.getDigestSettings();

    expect(settings.dayOfWeek).toBe(DIGEST_LIMITS.dayOfWeek.fallback);
    expect(settings.hour).toBe(DIGEST_LIMITS.hour.fallback);
    expect(settings.maxItems).toBe(DIGEST_LIMITS.maxItems.fallback);
    expect(settings.maxContextChars).toBe(
      DIGEST_LIMITS.maxContextChars.fallback,
    );
    expect(settings.timezone).toBe(DIGEST_FALLBACK_TIMEZONE);
  });

  test("both models default to the env model", async () => {
    const service = new SettingsService(noDatabase, makeEnv());
    const settings = await service.getDigestSettings();

    expect(settings.summaryModel).toBe("env/model");
    expect(settings.digestModel).toBe("env/model");
  });

  test("reports whether a key is configured without exposing it", async () => {
    const configured = await new SettingsService(
      noDatabase,
      makeEnv(),
    ).getDigestSettings();
    expect(configured.apiKeyConfigured).toBe(true);
    // These settings go straight to the client, so the live billing
    // credential must not appear anywhere in them.
    expect(JSON.stringify(configured)).not.toContain("test-key");

    const unconfigured = await new SettingsService(
      noDatabase,
      makeEnv({ apiKey: null, enabled: false }),
    ).getDigestSettings();
    expect(unconfigured.apiKeyConfigured).toBe(false);
  });

  test("the resolved defaults are a sane weekly schedule", async () => {
    const settings = await new SettingsService(
      noDatabase,
      makeEnv(),
    ).getDigestSettings();

    // 0-6 and 0-23 respectively, or the boundary math would throw or silently
    // resolve to the wrong week.
    expect(settings.dayOfWeek).toBeGreaterThanOrEqual(0);
    expect(settings.dayOfWeek).toBeLessThanOrEqual(6);
    expect(settings.hour).toBeGreaterThanOrEqual(0);
    expect(settings.hour).toBeLessThanOrEqual(23);
  });
});

describe("DIGEST_LIMITS", () => {
  test("caps the per-run spend at both ends", () => {
    // maxItems bounds how many model calls one digest can make and
    // maxContextChars bounds how large each one is; together they are the
    // ceiling on what a single run can cost.
    expect(DIGEST_LIMITS.maxItems.max).toBeLessThanOrEqual(500);
    expect(DIGEST_LIMITS.maxItems.min).toBeGreaterThan(0);
    expect(DIGEST_LIMITS.maxContextChars.max).toBeLessThanOrEqual(200_000);
    expect(DIGEST_LIMITS.maxContextChars.min).toBeGreaterThan(0);
  });

  test("every fallback sits inside its own bounds", () => {
    for (const limits of Object.values(DIGEST_LIMITS)) {
      expect(limits.fallback).toBeGreaterThanOrEqual(limits.min);
      expect(limits.fallback).toBeLessThanOrEqual(limits.max);
    }
  });
});
