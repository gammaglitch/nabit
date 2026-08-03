import { createDatabaseState } from "./db/client";
import { getAppEnv } from "./lib/config/env";
import { AssetService } from "./modules/assets/service";
import { DigestService } from "./modules/digest/service";
import { ExportService } from "./modules/export/service";
import { IngestService } from "./modules/ingest/service";
import { SettingsService } from "./modules/settings/service";

const workerId = process.env.WORKER_ID ?? `ingest-worker-${process.pid}`;
const pollIntervalMs = Number(process.env.INGEST_WORKER_POLL_MS ?? 3000);
const reapIntervalMs = Number(process.env.INGEST_WORKER_REAP_MS ?? 60_000);
const stuckJobMs = Number(process.env.INGEST_WORKER_STUCK_MS ?? 10 * 60_000);
// The digest only closes once a week, so this is just how promptly a completed
// period is noticed. Five minutes keeps the extra query rate negligible.
const digestIntervalMs = Number(process.env.DIGEST_CHECK_MS ?? 5 * 60_000);
let shuttingDown = false;

process.on("SIGINT", () => {
  shuttingDown = true;
});

process.on("SIGTERM", () => {
  shuttingDown = true;
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const database = createDatabaseState();
  if (!database.db) {
    throw new Error("DATABASE_URL is required for the ingest worker");
  }

  const env = getAppEnv();
  const assets = new AssetService(database, env.assetStoragePath);
  const service = new IngestService(database, env, assets);
  const settings = new SettingsService(database, env);
  const digests = new DigestService(
    database,
    env,
    new ExportService(database),
    settings,
  );
  let lastReapAt = 0;
  let lastDigestCheckAt = 0;

  console.info(
    { digestIntervalMs, pollIntervalMs, reapIntervalMs, stuckJobMs, workerId },
    "ingest worker started",
  );

  while (!shuttingDown) {
    if (Date.now() - lastReapAt > reapIntervalMs) {
      try {
        const reaped = await service.reapStuckJobs(stuckJobMs);
        if (reaped.failed > 0 || reaped.requeued > 0) {
          console.info({ ...reaped, workerId }, "reaped stuck ingest jobs");
        }
      } catch (error) {
        console.error(error, "reaper failed");
      }
      lastReapAt = Date.now();
    }

    // The only clock-driven work in the codebase. Materializing is a cheap
    // `insert ... on conflict do nothing`, so running it on a timer rather
    // than tracking "have I done this week yet" keeps the state in Postgres
    // instead of in this process.
    if (Date.now() - lastDigestCheckAt > digestIntervalMs) {
      try {
        const due = await digests.materializeDuePeriods();
        if (due.created) {
          console.info(
            { periodStart: due.periodStart.toISOString(), workerId },
            "materialized digest period",
          );
        }
      } catch (error) {
        console.error(error, "digest materialization failed");
      }
      lastDigestCheckAt = Date.now();
    }

    const result = await service.processNextJob(workerId);

    if (!result.processed) {
      // Ingest is idle, so this is the cheapest moment to spend minutes
      // building a digest without delaying a capture the user is waiting on.
      try {
        const digestResult = await digests.processNextDue(workerId);
        if (digestResult.processed) {
          console.info(
            {
              digestId: digestResult.digestId,
              status: digestResult.status,
              workerId,
            },
            "processed digest",
          );
          continue;
        }
      } catch (error) {
        console.error(error, "digest run failed");
      }

      await sleep(pollIntervalMs);
      continue;
    }

    console.info(
      {
        jobId: result.jobId,
        status: result.status,
        workerId,
      },
      "processed ingest job",
    );
  }

  console.info({ workerId }, "ingest worker stopped");
}

try {
  await main();
} catch (error) {
  console.error(error, "ingest worker failed");
  process.exit(1);
}
