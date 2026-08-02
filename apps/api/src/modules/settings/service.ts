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

// Bounds are enforced here rather than only in the DTO so a value written by
// an older client, or edited straight in the table, still cannot push the
// instance into a request that costs a fortune or sends no context at all.
export const CHAT_LIMITS = {
  historyTurns: { min: 1, max: 50, fallback: 10 },
  maxContextChars: { min: 1_000, max: 500_000, fallback: 120_000 },
} as const;

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
    const stored = await this.readStored();

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

    if (writes.length > 0) {
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

    return this.getChatSettings();
  }

  private async readStored(): Promise<Record<string, string>> {
    // Settings are optional everywhere they are read, so an unconfigured
    // instance falls back to env/defaults rather than failing the request.
    if (!this.database.db) {
      return {};
    }

    const rows = await this.database.db
      .select()
      .from(settingsTable)
      .where(inArray(settingsTable.key, Object.values(SETTING_KEYS)));

    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }
}
