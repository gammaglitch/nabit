import { createDatabaseState } from "./db/client";
import { getAppEnv } from "./lib/config/env";
import { IngestService } from "./modules/ingest/service";

const workerId = process.env.WORKER_ID ?? `ingest-worker-${process.pid}`;
const pollIntervalMs = Number(process.env.INGEST_WORKER_POLL_MS ?? 3000);
const reapIntervalMs = Number(process.env.INGEST_WORKER_REAP_MS ?? 60_000);
const stuckJobMs = Number(process.env.INGEST_WORKER_STUCK_MS ?? 10 * 60_000);
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

  const service = new IngestService(database, getAppEnv());
  let lastReapAt = 0;

  console.info(
    { pollIntervalMs, reapIntervalMs, stuckJobMs, workerId },
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

    const result = await service.processNextJob(workerId);

    if (!result.processed) {
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
