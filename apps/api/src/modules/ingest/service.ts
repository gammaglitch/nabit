import type { TrpcServices } from "@repo/trpc";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, lt, type SQL, sql } from "drizzle-orm";
import type { DatabaseState } from "../../db/client";
import {
  commentsTable,
  crawlPagesTable,
  crawlsTable,
  extractionsTable,
  ingestJobsTable,
  itemsTable,
  itemTagsTable,
  rawSnapshotsTable,
  tagsTable,
} from "../../db/schema";
import type { AppEnv } from "../../lib/config/env";
import type { AssetService } from "../assets/service";
import type {
  ExtractionAttempt,
  ExtractionStatus,
  Ingestor,
  IngestorName,
  ItemIdentity,
} from "./ingestors";
import {
  getIngestor,
  normalizeSourceUrl,
  resolveIngestorName,
} from "./ingestors";

type IngestServiceContract = TrpcServices["ingest"];
type Database = NonNullable<DatabaseState["db"]>;

type IngestJobStatus = "queued" | "processing" | "success" | "failed";

type IngestResult = {
  created: boolean;
  extractionId: number | null;
  ingestor: IngestorName;
  itemId: number;
  normalizedUrl: string;
  snapshotId: number;
  sourceItem: IngestResult | null;
  sourceType: string;
  status: ExtractionStatus;
  subjectItemId: number | null;
};

// Everything a crawl needs to fan out from a page it just archived.
export type CrawlExpansion = {
  crawlId: number;
  crawlPageId: number;
  itemId: number;
  outboundLinks: string[];
  title: string | null;
};

// Registered via setCrawlHooks, so IngestService stays unaware of crawl
// internals while CrawlService keeps depending on this one for its enqueueing.
export type CrawlHooks = {
  onPageIngested: (input: CrawlExpansion) => Promise<void>;
  onPageFailed: (input: {
    crawlId: number;
    crawlPageId: number;
    errorMessage: string;
  }) => Promise<void>;
};

// Carries two things the public result has no use for: the page's outbound
// links, and its title. Both exist only to feed a crawl, and both are stripped
// by toPublicResult before anything is stored or returned — a few hundred URLs
// per row would bloat `ingest_jobs.result`, and the IngestOutput DTO would drop
// them on the way out anyway.
type InternalIngestResult = Omit<IngestResult, "sourceItem"> & {
  outboundLinks: string[];
  sourceItem: InternalIngestResult | null;
  title: string | null;
};

function toPublicResult(result: InternalIngestResult): IngestResult {
  const { outboundLinks: _links, title: _title, ...rest } = result;
  return {
    ...rest,
    sourceItem: result.sourceItem ? toPublicResult(result.sourceItem) : null,
  };
}

type IngestJobRow = typeof ingestJobsTable.$inferSelect;

type ClaimedIngestJob = {
  attempts: number;
  crawlId: number | null;
  crawlPageId: number | null;
  digestOptIn: boolean;
  id: number;
  ingestor: string | null;
  maxAttempts: number;
  payload: unknown;
  url: string;
};

type InternalIngestInput = {
  digestOptIn?: boolean;
  ingestor?: IngestorName | null;
  payload?: unknown;
  skipLinkedUrls?: boolean;
  url: string;
};

type WorkerResult =
  | {
      jobId: number;
      processed: true;
      status: "success" | "failed" | "queued";
    }
  | {
      processed: false;
    };

function requireDatabase(database: DatabaseState): Database {
  if (!database.db) {
    throw new Error("Database not configured");
  }

  return database.db;
}

function rankStatus(status: ExtractionStatus) {
  switch (status) {
    case "success":
      return 3;
    case "partial":
      return 2;
    default:
      return 1;
  }
}

function pickFirstLinkedUrl(linkedUrls: string[] | undefined) {
  if (!linkedUrls?.length) return null;
  for (const candidate of linkedUrls) {
    try {
      normalizeSourceUrl(candidate);
      return candidate;
    } catch {
      // Skip unparseable URLs and try the next one.
    }
  }
  return null;
}

function preferExtraction(
  current: ExtractionAttempt | null,
  candidate: ExtractionAttempt,
) {
  if (!current) {
    return candidate;
  }

  const currentRank = rankStatus(current.status);
  const candidateRank = rankStatus(candidate.status);

  if (candidateRank !== currentRank) {
    return candidateRank > currentRank ? candidate : current;
  }

  const currentLength = current.contentText?.length ?? 0;
  const candidateLength = candidate.contentText?.length ?? 0;

  return candidateLength > currentLength ? candidate : current;
}

type StoredSnapshot = {
  body: string;
  contentType: string;
  id: number;
};

/**
 * Replays an ingestor's extractor over snapshots we already archived and picks
 * the best result, using the same preference rules as a fresh ingest.
 *
 * Deliberately offline. The snapshot body is the exact bytes captured at
 * ingest time, so an extractor fix can be rolled out across the archive
 * without re-fetching the original sites — which would mean re-hammering
 * them, and would silently swap the archived copy for whatever the page says
 * today (or a 404, or a paywall).
 *
 * Exported so the selection logic is testable; `reextract` around it is
 * database I/O.
 */
export async function reextractSnapshots(input: {
  ingestor: Pick<Ingestor, "extract">;
  snapshots: StoredSnapshot[];
  url: string;
}) {
  const attempts: Array<{ attempt: ExtractionAttempt; snapshotId: number }> =
    [];
  let preferred: ExtractionAttempt | null = null;
  let preferredSnapshotId: number | null = null;

  for (const snapshot of input.snapshots) {
    const attempt = await input.ingestor.extract({
      snapshot: { body: snapshot.body, contentType: snapshot.contentType },
      url: input.url,
    });
    attempts.push({ attempt, snapshotId: snapshot.id });

    const winner = preferExtraction(preferred, attempt);
    if (winner !== preferred) {
      preferred = winner;
      preferredSnapshotId = snapshot.id;
    }
  }

  return { attempts, preferred, preferredSnapshotId };
}

type ItemRow = typeof itemsTable.$inferSelect;

function toSummary(
  row: ItemRow,
  counts: {
    commentCount: number;
    latestExtractionStatus: ExtractionStatus | null;
    snapshotCount: number;
  },
) {
  return {
    author: row.author,
    commentCount: counts.commentCount,
    contentMarkdown: row.contentMarkdown,
    contentText: row.contentText,
    digestOptIn: row.digestOptIn,
    externalId: row.externalId,
    id: row.id,
    ingestedAt: row.ingestedAt.toISOString(),
    latestExtractionStatus: counts.latestExtractionStatus,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    snapshotCount: counts.snapshotCount,
    sourceCreatedAt: row.sourceCreatedAt?.toISOString() ?? null,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    subjectItemId: row.subjectItemId,
    title: row.title,
  };
}

function toJob(row: IngestJobRow) {
  return {
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
    errorMessage: row.errorMessage,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    id: row.id,
    ingestor: row.ingestor as IngestorName | null,
    itemId: row.itemId,
    maxAttempts: row.maxAttempts,
    result: (row.result as IngestResult | null) ?? null,
    runAfter: row.runAfter.toISOString(),
    status: row.status as IngestJobStatus,
    updatedAt: row.updatedAt.toISOString(),
    url: row.url,
  };
}

function retryDelayMs(attempts: number) {
  return Math.min(60_000, 2 ** Math.max(0, attempts - 1) * 5_000);
}

// While a job is being processed we periodically refresh `locked_at` so the
// reaper can distinguish a slow-but-alive worker from a dead one. Reaper's
// stale threshold must comfortably exceed this — see worker.ts defaults.
const HEARTBEAT_MS = 30_000;

export class IngestService implements IngestServiceContract {
  private crawlHooks: CrawlHooks | null = null;

  constructor(
    private readonly database: DatabaseState,
    private readonly env: AppEnv,
    private readonly assets: AssetService | null = null,
  ) {}

  async ingest(input: {
    digestOptIn?: boolean;
    ingestor?: IngestorName | null;
    payload?: unknown;
    url: string;
  }): Promise<IngestResult> {
    return toPublicResult(
      await this.ingestInternal({ ...input, skipLinkedUrls: false }),
    );
  }

  /**
   * Register what a crawl should do when one of its pages lands or gives up.
   *
   * Wired from lib/services.ts rather than injected, because CrawlService
   * depends on this service for its enqueueing — taking it in the constructor
   * would make the pair impossible to build.
   */
  setCrawlHooks(hooks: CrawlHooks) {
    this.crawlHooks = hooks;
  }

  async enqueue(input: {
    crawlId?: number | null;
    crawlPageId?: number | null;
    digestOptIn?: boolean;
    ingestor?: IngestorName | null;
    payload?: unknown;
    runAfter?: Date;
    url: string;
  }) {
    const db = requireDatabase(this.database);
    const requestedUrl = normalizeSourceUrl(input.url);
    const ingestorName = resolveIngestorName(
      requestedUrl,
      input.ingestor ?? null,
    );

    // Dedup: if there is already an in-flight job for this URL, reuse it
    // rather than queueing duplicate work. Best-effort — there is a small
    // race between SELECT and INSERT, but the downstream `ensureItem` is
    // idempotent so duplicates are merely wasteful, not incorrect.
    //
    // Note this also means a second enqueue for the same URL keeps the first
    // job's `digestOptIn`. Re-nabbing with the box ticked won't enroll an
    // already-queued item; use setDigestOptIn once it lands.
    //
    // Crawl jobs dedup within their own crawl only. Two crawls that overlap
    // would otherwise share one job, and only the crawl that happened to own
    // it would ever get the page's links back — the other would silently stop
    // fanning out. Re-fetching the shared page is the cheaper mistake.
    const [existing] = await db
      .select()
      .from(ingestJobsTable)
      .where(
        and(
          eq(ingestJobsTable.url, requestedUrl),
          inArray(ingestJobsTable.status, ["queued", "processing"]),
          input.crawlId == null
            ? isNull(ingestJobsTable.crawlId)
            : eq(ingestJobsTable.crawlId, input.crawlId),
        ),
      )
      .orderBy(desc(ingestJobsTable.createdAt))
      .limit(1);

    if (existing) {
      return { job: toJob(existing), reused: true };
    }

    const [job] = await db
      .insert(ingestJobsTable)
      .values({
        crawlId: input.crawlId ?? null,
        crawlPageId: input.crawlPageId ?? null,
        digestOptIn: input.digestOptIn ?? false,
        ingestor: ingestorName,
        payload: input.payload,
        // Lets a crawl space out its own fetches without holding the worker
        // in a sleep; the claim query already filters on `run_after <= now()`.
        runAfter: input.runAfter ?? new Date(),
        status: "queued",
        url: requestedUrl,
      })
      .returning();

    return { job: toJob(job), reused: false };
  }

  async getJob(input: { id: number }) {
    const db = requireDatabase(this.database);
    const [job] = await db
      .select()
      .from(ingestJobsTable)
      .where(eq(ingestJobsTable.id, input.id))
      .limit(1);

    if (!job) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Ingest job ${input.id} not found`,
      });
    }

    return toJob(job);
  }

  async listJobs(input: { limit?: number } = {}) {
    const db = requireDatabase(this.database);
    const jobs = await db
      .select()
      .from(ingestJobsTable)
      .orderBy(desc(ingestJobsTable.createdAt))
      .limit(input.limit ?? 50);

    return {
      jobs: jobs.map(toJob),
    };
  }

  async processNextJob(workerId: string): Promise<WorkerResult> {
    const db = requireDatabase(this.database);
    // Single CTE+UPDATE statement is implicitly atomic, so no explicit
    // transaction is needed. `FOR UPDATE SKIP LOCKED` lets multiple workers
    // claim distinct rows without blocking each other.
    const rows = (await db.execute(sql`
      with next_job as (
        select id
        from ${ingestJobsTable}
        where status = 'queued'
          and run_after <= now()
        order by created_at
        for update skip locked
        limit 1
      )
      update ${ingestJobsTable}
      set
        status = 'processing',
        locked_by = ${workerId},
        locked_at = now(),
        attempts = attempts + 1,
        updated_at = now()
      where id in (select id from next_job)
      returning
        id,
        url,
        ingestor,
        payload,
        digest_opt_in as "digestOptIn",
        crawl_id as "crawlId",
        crawl_page_id as "crawlPageId",
        attempts,
        max_attempts as "maxAttempts"
    `)) as unknown as ClaimedIngestJob[];

    const job = rows[0];
    if (!job) {
      return { processed: false };
    }

    // Refresh `locked_at` while the job runs so the reaper doesn't requeue
    // a slow-but-alive capture. If the heartbeat itself fails we just log;
    // a sustained DB outage will eventually trip the reaper, which is the
    // desired behavior at that point anyway.
    const heartbeat = setInterval(async () => {
      try {
        await db
          .update(ingestJobsTable)
          .set({ lockedAt: new Date(), updatedAt: new Date() })
          .where(eq(ingestJobsTable.id, job.id));
      } catch (error) {
        console.error(error, "ingest job heartbeat failed");
      }
    }, HEARTBEAT_MS);

    try {
      const result = await this.ingestInternal({
        digestOptIn: job.digestOptIn,
        ingestor: job.ingestor as IngestorName | null,
        payload: job.payload,
        skipLinkedUrls: false,
        url: job.url,
      });

      // Fan out *before* the job is marked successful, and let a throw here
      // fail the job. Expanding afterwards would mean a crash in between
      // leaves the page marked done with its links never walked, quietly
      // stalling the crawl; this way the reaper requeues the job and the
      // re-fetch harvests them again. Re-expansion is safe because the
      // frontier inserts are ON CONFLICT DO NOTHING.
      if (job.crawlId !== null && job.crawlPageId !== null) {
        await this.crawlHooks?.onPageIngested({
          crawlId: job.crawlId,
          crawlPageId: job.crawlPageId,
          itemId: result.itemId,
          outboundLinks: result.outboundLinks,
          title: result.title,
        });
      }

      await db
        .update(ingestJobsTable)
        .set({
          errorMessage: null,
          finishedAt: new Date(),
          itemId: result.itemId,
          lockedAt: null,
          lockedBy: null,
          result: toPublicResult(result),
          status: "success",
          updatedAt: new Date(),
        })
        .where(eq(ingestJobsTable.id, job.id));

      return {
        jobId: job.id,
        processed: true,
        status: "success",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const willRetry = job.attempts < job.maxAttempts;
      const status = willRetry ? "queued" : "failed";

      await db
        .update(ingestJobsTable)
        .set({
          errorMessage: message,
          finishedAt: willRetry ? null : new Date(),
          lockedAt: null,
          lockedBy: null,
          runAfter: new Date(Date.now() + retryDelayMs(job.attempts)),
          status,
          updatedAt: new Date(),
        })
        .where(eq(ingestJobsTable.id, job.id));

      // Only once the retries are spent. Marking the page failed on the first
      // attempt would let the crawl finish while the job is still queued for
      // another go — the page count would be wrong and the crawl would report
      // itself done early.
      if (!willRetry && job.crawlId !== null && job.crawlPageId !== null) {
        try {
          await this.crawlHooks?.onPageFailed({
            crawlId: job.crawlId,
            crawlPageId: job.crawlPageId,
            errorMessage: message,
          });
        } catch (hookError) {
          // The job is already recorded as failed; losing the bookkeeping is
          // not worth masking the original error. The crawl sweep in the
          // worker will notice the stalled page and close the crawl out.
          console.error(hookError, "crawl failure hook failed");
        }
      }

      return {
        jobId: job.id,
        processed: true,
        status,
      };
    } finally {
      clearInterval(heartbeat);
    }
  }

  // Recovers jobs whose worker died mid-processing. Without this, a crashed
  // worker leaves rows stuck in `processing` forever — no other worker will
  // claim them because the SELECT only looks at `queued`. Jobs that have
  // already exhausted their retries are flipped to `failed`; the rest go
  // back to `queued`.
  async reapStuckJobs(stuckMs: number) {
    const db = requireDatabase(this.database);
    const cutoff = new Date(Date.now() - stuckMs);

    const failedRows = await db
      .update(ingestJobsTable)
      .set({
        errorMessage: "Worker timed out",
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        status: "failed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ingestJobsTable.status, "processing"),
          lt(ingestJobsTable.lockedAt, cutoff),
          sql`${ingestJobsTable.attempts} >= ${ingestJobsTable.maxAttempts}`,
        ),
      )
      .returning({ id: ingestJobsTable.id });

    const requeuedRows = await db
      .update(ingestJobsTable)
      .set({
        lockedAt: null,
        lockedBy: null,
        status: "queued",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ingestJobsTable.status, "processing"),
          lt(ingestJobsTable.lockedAt, cutoff),
        ),
      )
      .returning({ id: ingestJobsTable.id });

    return { failed: failedRows.length, requeued: requeuedRows.length };
  }

  private async ingestInternal(
    input: InternalIngestInput,
  ): Promise<InternalIngestResult> {
    const db = requireDatabase(this.database);
    const requestedUrl = normalizeSourceUrl(input.url);
    const ingestorName = resolveIngestorName(
      requestedUrl,
      input.ingestor ?? null,
    );
    const ingestor = getIngestor(ingestorName);
    const capture = await ingestor.capture({
      env: this.env,
      payload: input.payload,
      url: requestedUrl,
    });

    const normalizedUrl = normalizeSourceUrl(
      capture.normalizedUrl ?? requestedUrl,
    );
    const identity = ingestor.identify({
      payload: input.payload,
      snapshots: capture.snapshots,
      url: normalizedUrl,
    });

    const extractions: Array<{
      attempt: ExtractionAttempt;
      snapshot: (typeof capture.snapshots)[number];
    }> = [];
    let preferredExtraction: ExtractionAttempt | null = null;
    for (const snapshot of capture.snapshots) {
      const attempt = await ingestor.extract({
        payload: input.payload,
        snapshot,
        url: normalizedUrl,
      });
      extractions.push({ attempt, snapshot });
      preferredExtraction = preferExtraction(preferredExtraction, attempt);
    }

    // The archived item is always primary (subjectItemId=null). If the ingestor
    // surfaces a linked off-site URL (e.g. the article an HN thread points at),
    // we auto-fetch it and attach it as a child pointing back at this item.
    const { created, itemId } = await this.ensureItem(db, {
      ...identity,
      digestOptIn: input.digestOptIn ?? false,
      sourceUrl: normalizedUrl,
      subjectItemId: null,
    });

    let latestExtractionId: number | null = null;
    let latestSnapshotId = 0;
    for (const { attempt, snapshot } of extractions) {
      const [storedSnapshot] = await db
        .insert(rawSnapshotsTable)
        .values({
          body: snapshot.body,
          contentType: snapshot.contentType,
          itemId,
        })
        .returning({ id: rawSnapshotsTable.id });
      latestSnapshotId = storedSnapshot.id;

      const [storedExtraction] = await db
        .insert(extractionsTable)
        .values({
          errorMessage: attempt.errorMessage ?? null,
          extractor: attempt.extractor,
          extractorVersion: attempt.extractorVersion ?? null,
          itemId: attempt.status === "failed" ? null : itemId,
          snapshotId: storedSnapshot.id,
          status: attempt.status,
        })
        .returning({ id: extractionsTable.id });
      latestExtractionId = storedExtraction.id;
    }

    let sourceItem: InternalIngestResult | null = null;
    let linkedFetchError: string | null = null;
    const linkedUrl = !input.skipLinkedUrls
      ? pickFirstLinkedUrl(preferredExtraction?.linkedUrls)
      : null;
    if (linkedUrl) {
      try {
        // No `digestOptIn` here on purpose: the user opted the thing they
        // nabbed into the digest, not whatever it happens to link out to.
        sourceItem = await this.ingestInternal({
          skipLinkedUrls: true,
          url: linkedUrl,
        });
        // Only link newly-created children. If the user had already archived
        // this URL standalone, respect that earlier intent and leave it as a
        // top-level item rather than silently demoting it.
        if (sourceItem.created) {
          await db
            .update(itemsTable)
            .set({ subjectItemId: itemId })
            .where(eq(itemsTable.id, sourceItem.itemId));
          sourceItem = { ...sourceItem, subjectItemId: itemId };
        }
      } catch (error) {
        linkedFetchError =
          error instanceof Error ? error.message : "Unknown error";
      }
    }

    if (preferredExtraction && preferredExtraction.status !== "failed") {
      const withAssets = await this.processExtractionAssets(
        preferredExtraction,
        { itemId, sourceUrl: normalizedUrl },
      );
      await this.applyExtraction(db, {
        extraction: withAssets,
        extraMetadata: linkedFetchError ? { linkedFetchError } : undefined,
        fallbackIdentity: {
          ...identity,
          sourceUrl: normalizedUrl,
        },
        itemId,
      });
    }

    return {
      created,
      extractionId: latestExtractionId,
      ingestor: ingestorName,
      itemId,
      normalizedUrl,
      // Taken from the winning extraction rather than the stored item so a
      // crawl sees the links of the capture it just made. Empty for every
      // ingestor but `generic` — only that one walks HTML.
      outboundLinks: preferredExtraction?.outboundLinks ?? [],
      snapshotId: latestSnapshotId,
      sourceItem,
      sourceType: preferredExtraction?.sourceType ?? identity.sourceType,
      status: preferredExtraction?.status ?? "failed",
      subjectItemId: null,
      title: preferredExtraction?.title ?? null,
    };
  }

  async ingestBatch(input: {
    items: Array<Parameters<IngestService["ingest"]>[0]>;
  }) {
    const results = [];
    for (const item of input.items) {
      results.push(await this.ingest(item));
    }
    return { results };
  }

  async list(
    input: {
      includeCrawledPages?: boolean;
      search?: string;
      sourceType?: string;
      tagIds?: number[];
    } = {},
  ) {
    const db = requireDatabase(this.database);

    const conditions: SQL[] = [];

    if (input.sourceType) {
      conditions.push(eq(itemsTable.sourceType, input.sourceType));
    }

    if (input.search?.trim()) {
      conditions.push(
        sql`${itemsTable.searchVector} @@ plainto_tsquery('english', ${input.search.trim()})`,
      );
    }

    if (input.tagIds && input.tagIds.length > 0) {
      const tagSubquery = db
        .select({ itemId: itemTagsTable.itemId })
        .from(itemTagsTable)
        .where(inArray(itemTagsTable.tagId, input.tagIds))
        .groupBy(itemTagsTable.itemId)
        .having(
          sql`count(distinct ${itemTagsTable.tagId}) = ${input.tagIds.length}`,
        );

      conditions.push(inArray(itemsTable.id, tagSubquery));
    }

    // Hide the sub-pages a crawl collected: the library shows one row for the
    // site (its root page), and the pages themselves are browsed in the site
    // view. Filtered here rather than in the client because this query is
    // still unpaginated — a 200-page crawl would otherwise ship 200 rows over
    // the wire for the browser to throw away.
    if (!input.includeCrawledPages) {
      conditions.push(sql`not exists (
        select 1
        from ${crawlPagesTable}
        where ${crawlPagesTable.itemId} = ${itemsTable.id}
          and ${crawlPagesTable.isRoot} = false
      )`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(itemsTable)
      .where(whereClause)
      .orderBy(desc(itemsTable.ingestedAt));

    if (rows.length === 0) {
      return {
        items: [],
        total: 0,
      };
    }

    const itemIds = rows.map((row) => row.id);

    const [
      countRows,
      commentRows,
      extractionRows,
      totalRows,
      tagRows,
      crawlRows,
    ] = await Promise.all([
        db
          .select({
            count: sql<number>`count(*)`,
            itemId: rawSnapshotsTable.itemId,
          })
          .from(rawSnapshotsTable)
          .where(inArray(rawSnapshotsTable.itemId, itemIds))
          .groupBy(rawSnapshotsTable.itemId),
        db
          .select({
            count: sql<number>`count(*)`,
            itemId: commentsTable.itemId,
          })
          .from(commentsTable)
          .where(inArray(commentsTable.itemId, itemIds))
          .groupBy(commentsTable.itemId),
        db
          .select({
            extractedAt: extractionsTable.extractedAt,
            itemId: extractionsTable.itemId,
            status: extractionsTable.status,
          })
          .from(extractionsTable)
          .where(inArray(extractionsTable.itemId, itemIds))
          .orderBy(desc(extractionsTable.extractedAt)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(itemsTable)
          .where(whereClause),
        db
          .select({
            itemId: itemTagsTable.itemId,
            tagId: tagsTable.id,
            tagName: tagsTable.name,
          })
          .from(itemTagsTable)
          .innerJoin(tagsTable, eq(itemTagsTable.tagId, tagsTable.id))
          .where(inArray(itemTagsTable.itemId, itemIds)),
        // Root pages only — every other crawl page was filtered out above.
        // This is what turns one library row into "a site of N pages" rather
        // than a lone index page.
        db
          .select({
            id: crawlsTable.id,
            itemId: crawlPagesTable.itemId,
            label: crawlsTable.label,
            pageId: crawlPagesTable.id,
            pagesDone: crawlsTable.pagesDone,
            pagesQueued: crawlsTable.pagesQueued,
            status: crawlsTable.status,
          })
          .from(crawlPagesTable)
          .innerJoin(crawlsTable, eq(crawlsTable.id, crawlPagesTable.crawlId))
          .where(
            and(
              inArray(crawlPagesTable.itemId, itemIds),
              eq(crawlPagesTable.isRoot, true),
            ),
          ),
      ]);

    const snapshotCountByItem = new Map(
      countRows.map((row) => [row.itemId, Number(row.count)]),
    );
    const commentCountByItem = new Map(
      commentRows.map((row) => [row.itemId, Number(row.count)]),
    );
    const latestExtractionByItem = new Map<number, ExtractionStatus>();

    for (const row of extractionRows) {
      if (row.itemId && !latestExtractionByItem.has(row.itemId)) {
        latestExtractionByItem.set(row.itemId, row.status as ExtractionStatus);
      }
    }

    const tagsByItem = new Map<number, Array<{ id: number; name: string }>>();
    for (const row of tagRows) {
      const existing = tagsByItem.get(row.itemId) ?? [];
      existing.push({ id: row.tagId, name: row.tagName });
      tagsByItem.set(row.itemId, existing);
    }

    const crawlByRootItem = new Map(
      crawlRows
        .filter((row) => row.itemId !== null)
        .map((row) => [
          row.itemId as number,
          {
            id: row.id,
            label: row.label,
            // Pages actually archived, root included. Queued pages are
            // reported separately so the row can show a crawl still filling in.
            pageCount: row.pagesDone,
            pageId: row.pageId,
            pagesQueued: row.pagesQueued,
            status: row.status,
          },
        ]),
    );

    return {
      items: rows.map((row) => ({
        ...toSummary(row, {
          commentCount: commentCountByItem.get(row.id) ?? 0,
          latestExtractionStatus: latestExtractionByItem.get(row.id) ?? null,
          snapshotCount: snapshotCountByItem.get(row.id) ?? 0,
        }),
        crawl: crawlByRootItem.get(row.id) ?? null,
        tags: tagsByItem.get(row.id) ?? [],
      })),
      total: Number(totalRows[0]?.count ?? 0),
    };
  }

  async get(input: { id: number }) {
    const db = requireDatabase(this.database);
    const [item] = await db
      .select()
      .from(itemsTable)
      .where(eq(itemsTable.id, input.id))
      .limit(1);

    if (!item) {
      throw new Error(`Item ${input.id} not found`);
    }

    const [snapshots, comments, itemTagRows, linkedItemRows, crawlPageRows] =
      await Promise.all([
        db
          .select()
          .from(rawSnapshotsTable)
          .where(eq(rawSnapshotsTable.itemId, input.id))
          .orderBy(desc(rawSnapshotsTable.capturedAt)),
        db
          .select()
          .from(commentsTable)
          .where(eq(commentsTable.itemId, input.id))
          .orderBy(commentsTable.path),
        db
          .select({
            tagId: tagsTable.id,
            tagName: tagsTable.name,
          })
          .from(itemTagsTable)
          .innerJoin(tagsTable, eq(itemTagsTable.tagId, tagsTable.id))
          .where(eq(itemTagsTable.itemId, input.id)),
        db
          .select()
          .from(itemsTable)
          .where(eq(itemsTable.subjectItemId, input.id))
          .orderBy(desc(itemsTable.ingestedAt))
          .limit(1),
        // Unlike list(), this matches any crawl page rather than just roots:
        // the reader needs the breadcrumb most on a sub-page, which is exactly
        // the item the library never shows.
        db
          .select({
            id: crawlsTable.id,
            label: crawlsTable.label,
            pageId: crawlPagesTable.id,
            pagesDone: crawlsTable.pagesDone,
            pagesQueued: crawlsTable.pagesQueued,
            status: crawlsTable.status,
          })
          .from(crawlPagesTable)
          .innerJoin(crawlsTable, eq(crawlsTable.id, crawlPagesTable.crawlId))
          .where(eq(crawlPagesTable.itemId, input.id))
          .orderBy(crawlPagesTable.id)
          .limit(1),
      ]);

    const snapshotIds = snapshots.map((snapshot) => snapshot.id);
    const extractions =
      snapshotIds.length === 0
        ? []
        : await db
            .select()
            .from(extractionsTable)
            .where(inArray(extractionsTable.snapshotId, snapshotIds))
            .orderBy(desc(extractionsTable.extractedAt));

    const [linkedItem = null] = await this.summarizeItemRows(
      db,
      linkedItemRows,
    );

    return {
      item: {
        ...toSummary(item, {
          commentCount: comments.length,
          latestExtractionStatus:
            (extractions[0]?.status as ExtractionStatus | undefined) ?? null,
          snapshotCount: snapshots.length,
        }),
        tags: itemTagRows.map((row) => ({ id: row.tagId, name: row.tagName })),
        crawl: crawlPageRows[0]
          ? {
              id: crawlPageRows[0].id,
              label: crawlPageRows[0].label,
              pageCount: crawlPageRows[0].pagesDone,
              pageId: crawlPageRows[0].pageId,
              pagesQueued: crawlPageRows[0].pagesQueued,
              status: crawlPageRows[0].status,
            }
          : null,
        comments: comments.map((comment) => ({
          author: comment.author,
          contentMarkdown: comment.contentMarkdown,
          contentText: comment.contentText,
          externalId: comment.externalId,
          id: comment.id,
          metadata: (comment.metadata ?? {}) as Record<string, unknown>,
          parentExternalId: comment.parentExternalId,
          path: comment.path,
          sourceCreatedAt: comment.sourceCreatedAt?.toISOString() ?? null,
        })),
        linkedItem,
        extractions: extractions.map((extraction) => ({
          errorMessage: extraction.errorMessage,
          extractedAt: extraction.extractedAt.toISOString(),
          extractor: extraction.extractor,
          extractorVersion: extraction.extractorVersion,
          id: extraction.id,
          snapshotId: extraction.snapshotId,
          status: extraction.status as ExtractionStatus,
        })),
        snapshots: snapshots.map((snapshot) => ({
          body: snapshot.body,
          capturedAt: snapshot.capturedAt.toISOString(),
          contentType: snapshot.contentType,
          id: snapshot.id,
        })),
      },
    };
  }

  async delete(input: { id: number }) {
    const db = requireDatabase(this.database);
    const result = await db
      .delete(itemsTable)
      .where(eq(itemsTable.id, input.id))
      .returning({ id: itemsTable.id });

    return { deleted: result.length > 0 };
  }

  async setDigestOptIn(input: { digestOptIn: boolean; id: number }) {
    const db = requireDatabase(this.database);
    const [updated] = await db
      .update(itemsTable)
      .set({ digestOptIn: input.digestOptIn })
      .where(eq(itemsTable.id, input.id))
      .returning({
        digestOptIn: itemsTable.digestOptIn,
        id: itemsTable.id,
      });

    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Item ${input.id} not found`,
      });
    }

    return updated;
  }

  /**
   * Re-runs extraction for an item against its archived snapshots. Use after
   * an extractor fix to bring an already-captured item up to date.
   *
   * Never re-fetches the source. Every extraction attempt is recorded against
   * the snapshot it ran on, so the history of what the extractor did stays
   * intact rather than being overwritten.
   */
  async reextract(input: { id: number; ingestor?: IngestorName | null }) {
    const db = requireDatabase(this.database);

    const [item] = await db
      .select({
        externalId: itemsTable.externalId,
        id: itemsTable.id,
        sourceType: itemsTable.sourceType,
        sourceUrl: itemsTable.sourceUrl,
      })
      .from(itemsTable)
      .where(eq(itemsTable.id, input.id))
      .limit(1);

    if (!item) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Item ${input.id} not found`,
      });
    }

    // Extractors resolve relative URLs against this and Readability needs it
    // to build a document, so there is nothing sensible to re-extract without.
    if (!item.sourceUrl) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Item ${input.id} has no source URL to re-extract against`,
      });
    }

    const snapshots = await db
      .select({
        body: rawSnapshotsTable.body,
        contentType: rawSnapshotsTable.contentType,
        id: rawSnapshotsTable.id,
      })
      .from(rawSnapshotsTable)
      .where(eq(rawSnapshotsTable.itemId, item.id))
      .orderBy(rawSnapshotsTable.id);

    if (snapshots.length === 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Item ${input.id} has no archived snapshot to re-extract from`,
      });
    }

    const ingestorName = resolveIngestorName(
      item.sourceUrl,
      input.ingestor ?? null,
    );
    const { attempts, preferred, preferredSnapshotId } =
      await reextractSnapshots({
        ingestor: getIngestor(ingestorName),
        snapshots,
        url: item.sourceUrl,
      });

    let latestExtractionId: number | null = null;
    for (const { attempt, snapshotId } of attempts) {
      const [stored] = await db
        .insert(extractionsTable)
        .values({
          errorMessage: attempt.errorMessage ?? null,
          extractor: attempt.extractor,
          extractorVersion: attempt.extractorVersion ?? null,
          itemId: attempt.status === "failed" ? null : item.id,
          snapshotId,
          status: attempt.status,
        })
        .returning({ id: extractionsTable.id });
      latestExtractionId = stored.id;
    }

    // A re-extraction that fails leaves the item alone. The content we already
    // have came from a run that worked, and is better than nothing.
    const applied = Boolean(preferred && preferred.status !== "failed");
    if (preferred && applied) {
      const withAssets = await this.processExtractionAssets(preferred, {
        itemId: item.id,
        sourceUrl: item.sourceUrl,
      });
      await this.applyExtraction(db, {
        extraction: withAssets,
        fallbackIdentity: {
          externalId: item.externalId ?? item.sourceUrl,
          sourceType: item.sourceType,
          sourceUrl: item.sourceUrl,
        },
        itemId: item.id,
      });
    }

    return {
      applied,
      extractionId: latestExtractionId,
      ingestor: ingestorName,
      itemId: item.id,
      snapshotId: preferredSnapshotId,
      snapshotsExtracted: snapshots.length,
      status: preferred?.status ?? "failed",
    };
  }

  private async summarizeItemRows(db: Database, rows: ItemRow[]) {
    if (rows.length === 0) {
      return [];
    }

    const itemIds = rows.map((row) => row.id);

    const [snapshotCountRows, commentCountRows, extractionRows, tagRows] =
      await Promise.all([
        db
          .select({
            count: sql<number>`count(*)`,
            itemId: rawSnapshotsTable.itemId,
          })
          .from(rawSnapshotsTable)
          .where(inArray(rawSnapshotsTable.itemId, itemIds))
          .groupBy(rawSnapshotsTable.itemId),
        db
          .select({
            count: sql<number>`count(*)`,
            itemId: commentsTable.itemId,
          })
          .from(commentsTable)
          .where(inArray(commentsTable.itemId, itemIds))
          .groupBy(commentsTable.itemId),
        db
          .select({
            extractedAt: extractionsTable.extractedAt,
            itemId: extractionsTable.itemId,
            status: extractionsTable.status,
          })
          .from(extractionsTable)
          .where(inArray(extractionsTable.itemId, itemIds))
          .orderBy(desc(extractionsTable.extractedAt)),
        db
          .select({
            itemId: itemTagsTable.itemId,
            tagId: tagsTable.id,
            tagName: tagsTable.name,
          })
          .from(itemTagsTable)
          .innerJoin(tagsTable, eq(itemTagsTable.tagId, tagsTable.id))
          .where(inArray(itemTagsTable.itemId, itemIds)),
      ]);

    const snapshotCountByItem = new Map(
      snapshotCountRows.map((row) => [row.itemId, Number(row.count)]),
    );
    const commentCountByItem = new Map(
      commentCountRows.map((row) => [row.itemId, Number(row.count)]),
    );
    const latestExtractionByItem = new Map<number, ExtractionStatus>();
    for (const row of extractionRows) {
      if (row.itemId && !latestExtractionByItem.has(row.itemId)) {
        latestExtractionByItem.set(row.itemId, row.status as ExtractionStatus);
      }
    }
    const tagsByItem = new Map<number, Array<{ id: number; name: string }>>();
    for (const row of tagRows) {
      const existing = tagsByItem.get(row.itemId) ?? [];
      existing.push({ id: row.tagId, name: row.tagName });
      tagsByItem.set(row.itemId, existing);
    }

    return rows.map((row) => ({
      ...toSummary(row, {
        commentCount: commentCountByItem.get(row.id) ?? 0,
        latestExtractionStatus: latestExtractionByItem.get(row.id) ?? null,
        snapshotCount: snapshotCountByItem.get(row.id) ?? 0,
      }),
      // Always null here. This helper only ever summarizes an item nested
      // inside another one's detail view — a thread's attached article — and
      // that view has no room for a second site breadcrumb. The crawl a page
      // belongs to is reported on the item the reader actually opened.
      crawl: null,
      tags: tagsByItem.get(row.id) ?? [],
    }));
  }

  private async ensureItem(
    db: Database,
    identity: ItemIdentity & {
      digestOptIn: boolean;
      subjectItemId: number | null;
    },
  ) {
    const existing = await db
      .select({ id: itemsTable.id })
      .from(itemsTable)
      .where(
        and(
          eq(itemsTable.sourceType, identity.sourceType),
          eq(itemsTable.externalId, identity.externalId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      // Deliberately never updates `digestOptIn`. It is user-owned state, and
      // a re-ingest or replay carrying the capture-time default would silently
      // undo someone turning the flag off in the reader.
      const updates: Partial<typeof itemsTable.$inferInsert> = {
        sourceUrl: identity.sourceUrl,
      };
      if (identity.subjectItemId !== null) {
        updates.subjectItemId = identity.subjectItemId;
      }
      await db
        .update(itemsTable)
        .set(updates)
        .where(eq(itemsTable.id, existing[0].id));

      return {
        created: false,
        itemId: existing[0].id,
      };
    }

    const [item] = await db
      .insert(itemsTable)
      .values({
        digestOptIn: identity.digestOptIn,
        externalId: identity.externalId,
        metadata: {},
        sourceType: identity.sourceType,
        sourceUrl: identity.sourceUrl,
        subjectItemId: identity.subjectItemId,
      })
      .returning({ id: itemsTable.id });

    return {
      created: true,
      itemId: item.id,
    };
  }

  private async processExtractionAssets(
    extraction: ExtractionAttempt,
    context: { itemId: number; sourceUrl: string },
  ): Promise<ExtractionAttempt> {
    if (!this.assets || !extraction.contentMarkdown) {
      return extraction;
    }

    try {
      const { markdown, assetIds } = await this.assets.rewriteMarkdownImages(
        extraction.contentMarkdown,
        { baseUrl: context.sourceUrl },
      );
      if (assetIds.length > 0) {
        await this.assets.linkAssetsToItem(context.itemId, assetIds);
      }
      return { ...extraction, contentMarkdown: markdown };
    } catch (error) {
      console.error(error, "asset processing failed; keeping original URLs");
      return extraction;
    }
  }

  private async applyExtraction(
    db: Database,
    input: {
      extraction: ExtractionAttempt;
      extraMetadata?: Record<string, unknown>;
      fallbackIdentity: ItemIdentity;
      itemId: number;
    },
  ) {
    const metadata: Record<string, unknown> = {
      ...(input.extraction.metadata ?? {}),
      ...(input.extraMetadata ?? {}),
    };

    await db
      .update(itemsTable)
      .set({
        author: input.extraction.author ?? null,
        contentMarkdown: input.extraction.contentMarkdown ?? null,
        contentText: input.extraction.contentText ?? null,
        // This update + the comment replace below are the single write path
        // for an item's content, so bumping here covers both body and comment
        // changes for /export incremental sync.
        contentUpdatedAt: new Date(),
        externalId:
          input.extraction.externalId ?? input.fallbackIdentity.externalId,
        metadata,
        sourceCreatedAt: input.extraction.sourceCreatedAt
          ? new Date(input.extraction.sourceCreatedAt)
          : null,
        sourceType:
          input.extraction.sourceType ?? input.fallbackIdentity.sourceType,
        sourceUrl:
          input.extraction.sourceUrl ?? input.fallbackIdentity.sourceUrl,
        title: input.extraction.title ?? null,
      })
      .where(eq(itemsTable.id, input.itemId));

    await db
      .delete(commentsTable)
      .where(eq(commentsTable.itemId, input.itemId));

    if (!input.extraction.comments?.length) {
      return;
    }

    await db.insert(commentsTable).values(
      input.extraction.comments.map((comment) => ({
        author: comment.author ?? null,
        contentMarkdown: comment.contentMarkdown ?? null,
        contentText: comment.contentText,
        externalId: comment.externalId ?? null,
        itemId: input.itemId,
        metadata: comment.metadata ?? {},
        parentExternalId: comment.parentExternalId ?? null,
        path: comment.path,
        sourceCreatedAt: comment.sourceCreatedAt
          ? new Date(comment.sourceCreatedAt)
          : null,
      })),
    );
  }
}
