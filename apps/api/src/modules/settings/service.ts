import type { TrpcServices } from "@repo/trpc";
import { inArray } from "drizzle-orm";
import type { DatabaseState } from "../../db/client";
import { settingsTable } from "../../db/schema";
import type { AppEnv } from "../../lib/config/env";

type SettingsServiceContract = TrpcServices["settings"];
type Database = NonNullable<DatabaseState["db"]>;

function requireDatabase(database: DatabaseState): Database {
  if (!database.db) {
    throw new Error("Database not configured");
  }

  return database.db;
}

export const SETTING_KEYS = {
  historyTurns: "chat.historyTurns",
  maxContextChars: "chat.maxContextChars",
  model: "chat.model",
} as const;

export const DIGEST_SETTING_KEYS = {
  dayOfWeek: "digest.dayOfWeek",
  digestModel: "digest.digestModel",
  hour: "digest.hour",
  maxContextChars: "digest.maxContextChars",
  maxItems: "digest.maxItems",
  summaryModel: "digest.summaryModel",
  timezone: "digest.timezone",
} as const;

// Bounds are enforced here rather than only in the DTO so a value written by
// an older client, or edited straight in the table, still cannot push the
// instance into a request that costs a fortune or sends no context at all.
export const CHAT_LIMITS = {
  historyTurns: { min: 1, max: 50, fallback: 10 },
  maxContextChars: { min: 1_000, max: 500_000, fallback: 120_000 },
} as const;

// Same reasoning as CHAT_LIMITS, with more at stake: these bound how many
// model calls one digest run can make and how much context each one carries,
// so a bad value here is a bill rather than a bad answer.
export const DIGEST_LIMITS = {
  // 0 = Sunday, matching Postgres `extract(dow ...)` and JS getDay().
  dayOfWeek: { min: 0, max: 6, fallback: 1 },
  hour: { min: 0, max: 23, fallback: 8 },
  maxContextChars: { min: 1_000, max: 200_000, fallback: 40_000 },
  maxItems: { min: 1, max: 500, fallback: 100 },
} as const;

export const DIGEST_FALLBACK_TIMEZONE = "UTC";

export interface ResolvedDigestSettings {
  /** Whether OPENROUTER_API_KEY is set. Without it no digest can be built. */
  apiKeyConfigured: boolean;
  /** 0 = Sunday. The digest for a period is built on/after this weekday. */
  dayOfWeek: number;
  /** Model used to synthesize the per-article summaries into one digest. */
  digestModel: string;
  /** Local hour of day the period closes. */
  hour: number;
  /** Ceiling on the rendered article text handed to the summarizer. */
  maxContextChars: number;
  /** Hard cap on articles summarized in a single digest run. */
  maxItems: number;
  /** Model used for each per-article TL;DR. */
  summaryModel: string;
  /** IANA zone the weekly boundary is computed in. */
  timezone: string;
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export interface ResolvedChatSettings {
  /** Whether OPENROUTER_API_KEY is set. The key itself is never exposed. */
  apiKeyConfigured: boolean;
  /** How many of the most recent messages accompany each question. */
  historyTurns: number;
  /** Ceiling on the rendered article + comments injected as context. */
  maxContextChars: number;
  model: string;
}

export function clampInt(
  value: number,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export class SettingsService implements SettingsServiceContract {
  constructor(
    private readonly database: DatabaseState,
    private readonly env: AppEnv,
  ) {}

  /**
   * Resolves each setting DB value -> env var -> built-in default, so an
   * instance that has never opened the settings menu behaves exactly as it
   * did when these were env-only.
   */
  async getChatSettings(): Promise<ResolvedChatSettings> {
    const stored = await this.readStored(Object.values(SETTING_KEYS));

    return {
      apiKeyConfigured: this.env.openrouter.enabled,
      historyTurns: clampInt(
        Number(stored[SETTING_KEYS.historyTurns] ?? Number.NaN),
        CHAT_LIMITS.historyTurns,
      ),
      maxContextChars: clampInt(
        Number(stored[SETTING_KEYS.maxContextChars] ?? Number.NaN),
        CHAT_LIMITS.maxContextChars,
      ),
      model: stored[SETTING_KEYS.model]?.trim() || this.env.openrouter.model,
    };
  }

  /**
   * Resolves the digest knobs DB value -> built-in default. Kept separate from
   * getChatSettings because the two features have independent lifecycles and
   * ChatSettingsOutput requires every field it declares.
   */
  async getDigestSettings(): Promise<ResolvedDigestSettings> {
    const stored = await this.readStored(Object.values(DIGEST_SETTING_KEYS));
    const timezone = stored[DIGEST_SETTING_KEYS.timezone]?.trim();

    return {
      apiKeyConfigured: this.env.openrouter.enabled,
      dayOfWeek: clampInt(
        Number(stored[DIGEST_SETTING_KEYS.dayOfWeek] ?? Number.NaN),
        DIGEST_LIMITS.dayOfWeek,
      ),
      digestModel:
        stored[DIGEST_SETTING_KEYS.digestModel]?.trim() ||
        this.env.openrouter.model,
      hour: clampInt(
        Number(stored[DIGEST_SETTING_KEYS.hour] ?? Number.NaN),
        DIGEST_LIMITS.hour,
      ),
      maxContextChars: clampInt(
        Number(stored[DIGEST_SETTING_KEYS.maxContextChars] ?? Number.NaN),
        DIGEST_LIMITS.maxContextChars,
      ),
      maxItems: clampInt(
        Number(stored[DIGEST_SETTING_KEYS.maxItems] ?? Number.NaN),
        DIGEST_LIMITS.maxItems,
      ),
      summaryModel:
        stored[DIGEST_SETTING_KEYS.summaryModel]?.trim() ||
        this.env.openrouter.model,
      // An unparseable zone would make every boundary computation throw, so
      // fall back rather than trusting a hand-edited row.
      timezone:
        timezone && isValidTimezone(timezone)
          ? timezone
          : DIGEST_FALLBACK_TIMEZONE,
    };
  }

  async updateDigest(input: {
    dayOfWeek?: number;
    digestModel?: string;
    hour?: number;
    maxContextChars?: number;
    maxItems?: number;
    summaryModel?: string;
    timezone?: string;
  }): Promise<ResolvedDigestSettings> {
    const writes: Array<{ key: string; value: string }> = [];

    const pushModel = (key: string, value: string | undefined) => {
      const trimmed = value?.trim();
      if (trimmed) {
        writes.push({ key, value: trimmed });
      }
    };
    pushModel(DIGEST_SETTING_KEYS.summaryModel, input.summaryModel);
    pushModel(DIGEST_SETTING_KEYS.digestModel, input.digestModel);

    if (input.timezone !== undefined) {
      const timezone = input.timezone.trim();
      if (timezone && isValidTimezone(timezone)) {
        writes.push({ key: DIGEST_SETTING_KEYS.timezone, value: timezone });
      }
    }

    const numeric: Array<
      [
        string,
        number | undefined,
        { fallback: number; max: number; min: number },
      ]
    > = [
      [DIGEST_SETTING_KEYS.dayOfWeek, input.dayOfWeek, DIGEST_LIMITS.dayOfWeek],
      [DIGEST_SETTING_KEYS.hour, input.hour, DIGEST_LIMITS.hour],
      [
        DIGEST_SETTING_KEYS.maxContextChars,
        input.maxContextChars,
        DIGEST_LIMITS.maxContextChars,
      ],
      [DIGEST_SETTING_KEYS.maxItems, input.maxItems, DIGEST_LIMITS.maxItems],
    ];
    for (const [key, value, limits] of numeric) {
      if (value !== undefined) {
        writes.push({ key, value: String(clampInt(value, limits)) });
      }
    }

    await this.writeSettings(writes);

    return this.getDigestSettings();
  }

  async get() {
    return this.getChatSettings();
  }

  async update(input: {
    historyTurns?: number;
    maxContextChars?: number;
    model?: string;
  }) {
    const writes: Array<{ key: string; value: string }> = [];

    if (input.model !== undefined) {
      const model = input.model.trim();
      if (model.length > 0) {
        writes.push({ key: SETTING_KEYS.model, value: model });
      }
    }
    if (input.maxContextChars !== undefined) {
      writes.push({
        key: SETTING_KEYS.maxContextChars,
        value: String(
          clampInt(input.maxContextChars, CHAT_LIMITS.maxContextChars),
        ),
      });
    }
    if (input.historyTurns !== undefined) {
      writes.push({
        key: SETTING_KEYS.historyTurns,
        value: String(clampInt(input.historyTurns, CHAT_LIMITS.historyTurns)),
      });
    }

    await this.writeSettings(writes);

    return this.getChatSettings();
  }

  private async writeSettings(writes: Array<{ key: string; value: string }>) {
    if (writes.length === 0) {
      return;
    }

    const db = requireDatabase(this.database);
    for (const write of writes) {
      await db
        .insert(settingsTable)
        .values(write)
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value: write.value, updatedAt: new Date() },
        });
    }
  }

  private async readStored(keys: string[]): Promise<Record<string, string>> {
    // Settings are optional everywhere they are read, so an unconfigured
    // instance falls back to env/defaults rather than failing the request.
    if (!this.database.db) {
      return {};
    }

    const rows = await this.database.db
      .select()
      .from(settingsTable)
      .where(inArray(settingsTable.key, keys));

    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }
}
