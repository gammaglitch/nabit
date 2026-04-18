import type { TrpcServices } from "@repo/trpc";
import { sql } from "drizzle-orm";
import type { DatabaseState } from "../../db/client";
import type { AppEnv } from "../../lib/config/env";

type HealthServiceOptions = {
  database: DatabaseState;
  env: AppEnv;
};

type HealthServiceContract = TrpcServices["health"];

const DB_PROBE_TIMEOUT_MS = 2000;

export class HealthService implements HealthServiceContract {
  constructor(private readonly options: HealthServiceOptions) {}

  async check(input: { requestId: string }) {
    const { configured, db } = this.options.database;
    let reachable = false;
    let error: string | null = null;

    if (configured && db) {
      try {
        await Promise.race([
          db.execute(sql`select 1`),
          new Promise((_resolve, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `db probe timed out after ${DB_PROBE_TIMEOUT_MS}ms`,
                  ),
                ),
              DB_PROBE_TIMEOUT_MS,
            ),
          ),
        ]);
        reachable = true;
      } catch (probeError) {
        error =
          probeError instanceof Error ? probeError.message : "Unknown error";
      }
    }

    const ok = configured ? reachable : true;

    return {
      ok,
      requestId: input.requestId,
      service: "@repo/api" as const,
      timestamp: new Date().toISOString(),
      database: {
        configured,
        reachable,
        error,
      },
      websockets: {
        enabled: this.options.env.websocketsEnabled,
      },
    };
  }
}
