import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseState } from "../../db/client";
import {
  crawlPagesTable,
  crawlsTable,
  ingestJobsTable,
  itemsTable,
} from "../../db/schema";
import { normalizeSourceUrl, resolveIngestorName } from "../ingest/ingestors";
import type { CrawlExpansion, IngestService } from "../ingest/service";
import { planExpansion, selectCandidates } from "./expansion";
import { isPathAllowed, RobotsCache } from "./robots";
import {
  type CrawlScopeMode,
  createLinkClassifier,
  resolvePathPrefix,
} from "./scope";

type Database = NonNullable<DatabaseState["db"]>;

// Floor between two fetches on the same host, when robots.txt states no
// Crawl-delay of its own. The worker processes jobs serially so real crawls
// are already slow, but a site of tiny pages could otherwise be hit as fast as
// the database hands out jobs.
const DEFAULT_CRAWL_DELAY_MS = 1_000;

const MAX_DEPTH_LIMIT = 10;
const MAX_PAGES_LIMIT = 5_000;

export type CrawlStatus =
  | "queued"
  | "running"
  | "paused"
  | "done"
  | "failed"
  | "cancelled";

export type CrawlPageStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "skipped";

export type StartCrawlInput = {
  excludePattern?: string | null;
  followExternal?: boolean;
  includePattern?: string | null;
  label?: string | null;
  maxDepth?: number;
  maxPages?: number;
  scope?: CrawlScopeMode;
  url: string;
};

type CrawlRow = typeof crawlsTable.$inferSelect;
type CrawlPageRow = typeof crawlPagesTable.$inferSelect;

function requireDatabase(database: DatabaseState): Database {
  if (!database.db) {
    throw new Error("Database not configured");
  }
  return database.db;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function scopeOf(crawl: CrawlRow) {
  return {
    excludePattern: crawl.excludePattern,
    followExternal: crawl.followExternal,
    includePattern: crawl.includePattern,
    maxDepth: crawl.maxDepth,
    mode: crawl.scope as CrawlScopeMode,
    pathPrefix: crawl.pathPrefix,
  };
}

export class CrawlService {
  constructor(
    private readonly database: DatabaseState,
    private readonly ingest: IngestService,
    private readonly robots: RobotsCache = new RobotsCache(),
  ) {}

  /**
   * Create a crawl and queue its root page. Returns as soon as the root is
   * queued — the fan-out happens on the worker, one page at a time.
   */
  async start(input: StartCrawlInput) {
    const db = requireDatabase(this.database);

    let normalizedRoot: string;
    try {
      normalizedRoot = normalizeSourceUrl(input.url);
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Not a usable URL: ${input.url}`,
      });
    }

    // Crawling means walking HTML links, which is the generic ingestor's job.
    // The others key off an API payload or a thread id and have no notion of
    // "the pages this one links to", so a crawl rooted there could only ever
    // archive its single page.
    const ingestorName = resolveIngestorName(normalizedRoot, null);
    if (ingestorName !== "generic") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Crawling only works on ordinary web pages, but ${normalizedRoot} is handled by the ${ingestorName} ingestor. Archive it on its own instead.`,
      });
    }

    const mode: CrawlScopeMode = input.scope ?? "host";
    // From the URL as typed, not the normalized one: normalization trims the
    // trailing slash that distinguishes the directory /guide/ from the page
    // /guide, and that slash decides what "under the root" means.
    const pathPrefix = mode === "path" ? resolvePathPrefix(input.url) : null;
    const maxDepth = clamp(input.maxDepth ?? 3, 0, MAX_DEPTH_LIMIT);
    const maxPages = clamp(input.maxPages ?? 200, 1, MAX_PAGES_LIMIT);

    // Compile the patterns now so an unusable regex is a failed request rather
    // than a crawl that dies on its first expansion.
    try {
      createLinkClassifier({
        rootUrl: normalizedRoot,
        scope: {
          excludePattern: input.excludePattern,
          followExternal: input.followExternal ?? false,
          includePattern: input.includePattern,
          maxDepth,
          mode,
          pathPrefix,
        },
      });
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Invalid crawl scope",
      });
    }

    const { crawl, rootPage } = await db.transaction(async (tx) => {
      const [createdCrawl] = await tx
        .insert(crawlsTable)
        .values({
          excludePattern: input.excludePattern ?? null,
          followExternal: input.followExternal ?? false,
          includePattern: input.includePattern ?? null,
          label: input.label ?? null,
          maxDepth,
          maxPages,
          pagesQueued: 1,
          pathPrefix,
          rootUrl: normalizedRoot,
          scope: mode,
          status: "running",
        })
        .returning();

      const [createdRoot] = await tx
        .insert(crawlPagesTable)
        .values({
          crawlId: createdCrawl.id,
          depth: 0,
          discoveryIndex: 0,
          isRoot: true,
          status: "queued",
          url: normalizedRoot,
        })
        .returning();

      return { crawl: createdCrawl, rootPage: createdRoot };
    });

    await this.ingest.enqueue({
      crawlId: crawl.id,
      crawlPageId: rootPage.id,
      url: normalizedRoot,
    });

    return { crawl: this.toCrawl(crawl), rootPageId: rootPage.id };
  }

  /**
   * Record that a crawl page landed, then queue whatever it linked to.
   *
   * Called from the ingest worker before the job is marked successful, so a
   * throw here retries the page rather than losing its links. Every insert is
   * ON CONFLICT DO NOTHING, which is what makes that retry safe.
   */
  async expand(input: CrawlExpansion) {
    const db = requireDatabase(this.database);

    const [page] = await db
      .select()
      .from(crawlPagesTable)
      .where(eq(crawlPagesTable.id, input.crawlPageId))
      .limit(1);
    if (!page) return;

    const [crawl] = await db
      .select()
      .from(crawlsTable)
      .where(eq(crawlsTable.id, input.crawlId))
      .limit(1);
    if (!crawl) return;

    await db
      .update(crawlPagesTable)
      .set({
        errorMessage: null,
        itemId: input.itemId,
        status: "done",
        title: input.title ?? page.title,
        updatedAt: new Date(),
      })
      .where(eq(crawlPagesTable.id, page.id));

    // Name the site after its front page, once we know it.
    if (page.isRoot) {
      await db
        .update(crawlsTable)
        .set({
          label: crawl.label ?? input.title ?? new URL(crawl.rootUrl).hostname,
          rootItemId: input.itemId,
          updatedAt: new Date(),
        })
        .where(eq(crawlsTable.id, crawl.id));
    }

    // A cancelled or failed crawl still records the page that was already in
    // flight, but must not grow any further.
    const stillRunning =
      crawl.status === "running" || crawl.status === "queued";
    if (stillRunning && !page.isLeaf && input.outboundLinks.length > 0) {
      await this.queueDiscoveredLinks({
        crawl,
        db,
        page,
        links: input.outboundLinks,
      });
    }

    await this.refreshProgress(db, crawl.id);
  }

  /** Record a page whose ingest job exhausted its retries. */
  async markPageFailed(input: {
    crawlId: number;
    crawlPageId: number;
    errorMessage: string;
  }) {
    const db = requireDatabase(this.database);
    await db
      .update(crawlPagesTable)
      .set({
        errorMessage: input.errorMessage,
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(crawlPagesTable.id, input.crawlPageId));

    await this.refreshProgress(db, input.crawlId);
  }

  private async queueDiscoveredLinks(input: {
    crawl: CrawlRow;
    db: Database;
    links: string[];
    page: CrawlPageRow;
  }) {
    const { crawl, db, links, page } = input;

    const candidates = selectCandidates({
      classify: createLinkClassifier({
        rootUrl: crawl.rootUrl,
        scope: scopeOf(crawl),
      }),
      links,
      parentDepth: page.depth,
    });
    if (candidates.length === 0) return;

    // Drop candidates this crawl already has a row for, before any budget is
    // spent on them. They would insert nothing (ON CONFLICT DO NOTHING) but
    // still consume budget, so on a site with a nav block repeated across
    // every page the budget is eaten by URLs already archived — and the
    // genuinely new pages behind them get written off permanently as
    // "limit reached" when the cap was never really hit.
    const known = new Set(
      (
        await db
          .select({ url: crawlPagesTable.url })
          .from(crawlPagesTable)
          .where(
            and(
              eq(crawlPagesTable.crawlId, crawl.id),
              inArray(
                crawlPagesTable.url,
                candidates.map((candidate) => candidate.url),
              ),
            ),
          )
      ).map((row) => row.url),
    );
    const fresh = candidates.filter((candidate) => !known.has(candidate.url));
    if (fresh.length === 0) return;

    const [{ counted }] = (await db.execute(sql`
      select count(*)::int as counted
      from ${crawlPagesTable}
      where crawl_id = ${crawl.id}
        and status <> 'skipped'
    `)) as unknown as Array<{ counted: number }>;

    // robots.txt is resolved up front, so the planner stays synchronous and
    // a disallowed URL is recorded as skipped rather than queued and then
    // quietly dropped. Rules are cached per origin, so this is one fetch per
    // host however many candidates share it.
    const robotsAllows = new Map<string, boolean>();
    for (const candidate of fresh) {
      const rules = await this.robots.rulesFor(candidate.url);
      const parsed = new URL(candidate.url);
      robotsAllows.set(
        candidate.url,
        isPathAllowed(rules, `${parsed.pathname}${parsed.search}`),
      );
    }

    const rows = planExpansion({
      candidates: fresh,
      isAllowedByRobots: (url) => robotsAllows.get(url) ?? true,
      maxPages: crawl.maxPages,
      pagesUsed: counted,
    }).map((row) => ({
      crawlId: crawl.id,
      depth: row.depth,
      discoveryIndex: row.discoveryIndex,
      errorMessage: row.errorMessage,
      isExternal: row.isExternal,
      isLeaf: row.isLeaf,
      parentPageId: page.id,
      status: row.status,
      url: row.url,
    }));

    // Only genuinely new rows come back, so a page reached from twenty
    // siblings is queued once — the unique index on (crawl_id, url) is the
    // visited set.
    const inserted = await db
      .insert(crawlPagesTable)
      .values(rows)
      .onConflictDoNothing({
        target: [crawlPagesTable.crawlId, crawlPagesTable.url],
      })
      .returning();

    const toFetch = inserted.filter((row) => row.status === "queued");
    if (toFetch.length === 0) return;

    await this.scheduleFetches(db, crawl, toFetch);
  }

  /**
   * Queue an ingest job per page, spaced out.
   *
   * The cursor continues from whatever this crawl already has queued, so
   * successive expansions don't all schedule themselves at "now" and the
   * per-host delay actually holds across the whole crawl rather than within
   * one batch. Every path that queues crawl work goes through here — a
   * recovery path that skipped it would fire a whole backlog at the host at
   * once, which is precisely what the robots handling exists to avoid.
   */
  private async scheduleFetches(
    db: Database,
    crawl: Pick<CrawlRow, "id">,
    pages: Array<{ id: number; url: string }>,
  ) {
    const [{ queuedUntil }] = (await db.execute(sql`
      select coalesce(max(run_after), now()) as "queuedUntil"
      from ${ingestJobsTable}
      where crawl_id = ${crawl.id}
        and status = 'queued'
    `)) as unknown as Array<{ queuedUntil: string | Date }>;

    let cursor = Math.max(new Date(queuedUntil).getTime(), Date.now());
    for (const page of pages) {
      const rules = await this.robots.rulesFor(page.url);
      const delay = Math.max(
        rules.crawlDelayMs ?? DEFAULT_CRAWL_DELAY_MS,
        DEFAULT_CRAWL_DELAY_MS,
      );
      cursor += delay;
      await this.ingest.enqueue({
        crawlId: crawl.id,
        crawlPageId: page.id,
        runAfter: new Date(cursor),
        url: page.url,
      });
    }
  }

  /**
   * Recompute a crawl's counters from its pages, and close it out when nothing
   * is left pending.
   *
   * Counted rather than incremented: the numbers are only ever a summary of
   * crawl_pages, and a recount cannot drift when a page is retried, re-expanded
   * after a crash, or reached from two parents at once.
   */
  private async refreshProgress(db: Database, crawlId: number) {
    const [progress] = (await db.execute(sql`
      select
        count(*) filter (where status in ('queued', 'running'))::int as pending,
        count(*) filter (where status = 'done')::int as done,
        count(*) filter (where status = 'failed')::int as failed
      from ${crawlPagesTable}
      where crawl_id = ${crawlId}
    `)) as unknown as Array<{ done: number; failed: number; pending: number }>;

    const [crawl] = await db
      .select({ status: crawlsTable.status })
      .from(crawlsTable)
      .where(eq(crawlsTable.id, crawlId))
      .limit(1);
    if (!crawl) return;

    const settled = crawl.status === "cancelled" || crawl.status === "failed";
    const finished = progress.pending === 0;

    await db
      .update(crawlsTable)
      .set({
        finishedAt: !settled && finished ? new Date() : undefined,
        pagesDone: progress.done,
        pagesFailed: progress.failed,
        pagesQueued: progress.pending,
        status: settled ? crawl.status : finished ? "done" : "running",
        updatedAt: new Date(),
      })
      .where(eq(crawlsTable.id, crawlId));
  }

  async cancel(input: { id: number }) {
    const db = requireDatabase(this.database);
    const crawl = await this.requireCrawl(db, input.id);

    await db.transaction(async (tx) => {
      // Drop the queue first, so nothing new is claimed while we mark up the
      // pages. In-flight jobs are left to finish; their expansion sees a
      // cancelled crawl and stops there.
      await tx
        .delete(ingestJobsTable)
        .where(
          and(
            eq(ingestJobsTable.crawlId, crawl.id),
            eq(ingestJobsTable.status, "queued"),
          ),
        );

      await tx
        .update(crawlPagesTable)
        .set({
          errorMessage: "Crawl cancelled",
          status: "skipped",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(crawlPagesTable.crawlId, crawl.id),
            eq(crawlPagesTable.status, "queued"),
          ),
        );

      await tx
        .update(crawlsTable)
        .set({
          finishedAt: new Date(),
          pagesQueued: 0,
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(eq(crawlsTable.id, crawl.id));
    });

    return this.get({ id: crawl.id });
  }

  async list(input: { limit?: number } = {}) {
    const db = requireDatabase(this.database);
    const rows = await db
      .select()
      .from(crawlsTable)
      .orderBy(desc(crawlsTable.createdAt))
      .limit(input.limit ?? 50);

    return { crawls: rows.map((row) => this.toCrawl(row)) };
  }

  async get(input: { id: number }) {
    const db = requireDatabase(this.database);
    const crawl = await this.requireCrawl(db, input.id);

    // Ordered so the client can build the tree in one pass: parents always
    // appear before the children that reference them.
    const pages = await db
      .select({
        depth: crawlPagesTable.depth,
        discoveryIndex: crawlPagesTable.discoveryIndex,
        errorMessage: crawlPagesTable.errorMessage,
        id: crawlPagesTable.id,
        isExternal: crawlPagesTable.isExternal,
        isLeaf: crawlPagesTable.isLeaf,
        isRoot: crawlPagesTable.isRoot,
        itemId: crawlPagesTable.itemId,
        itemTitle: itemsTable.title,
        parentPageId: crawlPagesTable.parentPageId,
        sourceType: itemsTable.sourceType,
        status: crawlPagesTable.status,
        title: crawlPagesTable.title,
        url: crawlPagesTable.url,
      })
      .from(crawlPagesTable)
      .leftJoin(itemsTable, eq(itemsTable.id, crawlPagesTable.itemId))
      .where(eq(crawlPagesTable.crawlId, crawl.id))
      .orderBy(
        crawlPagesTable.depth,
        crawlPagesTable.discoveryIndex,
        crawlPagesTable.id,
      );

    return {
      crawl: this.toCrawl(crawl),
      pages: pages.map(({ itemTitle, ...page }) => ({
        ...page,
        status: page.status as CrawlPageStatus,
        // The item's own title is the fresher of the two; the denormalized one
        // is what keeps the tree readable before, or without, an item.
        title: itemTitle ?? page.title,
      })),
    };
  }

  async delete(input: { deleteItems?: boolean; id: number }) {
    const db = requireDatabase(this.database);
    const crawl = await this.requireCrawl(db, input.id);

    const pages = await db
      .select({ itemId: crawlPagesTable.itemId })
      .from(crawlPagesTable)
      .where(eq(crawlPagesTable.crawlId, crawl.id));
    const itemIds = pages
      .map((page) => page.itemId)
      .filter((id): id is number => id !== null);

    // crawl_pages and this crawl's ingest_jobs go with it via ON DELETE
    // CASCADE. The archived items outlive it unless asked for explicitly —
    // dropping someone's archive is not a side effect of tidying up a crawl.
    await db.delete(crawlsTable).where(eq(crawlsTable.id, crawl.id));

    let deletedItems = 0;
    if (input.deleteItems && itemIds.length > 0) {
      const removed = await db
        .delete(itemsTable)
        .where(inArray(itemsTable.id, itemIds))
        .returning({ id: itemsTable.id });
      deletedItems = removed.length;
    }

    return { deletedItems, id: crawl.id };
  }

  /**
   * Close out crawls the worker cannot finish on its own.
   *
   * Runs on the worker's reap tick, alongside the ingest job reaper, and
   * handles two distinct cases that both leave a page sitting at `queued`:
   *
   * - **Never enqueued.** The process died between inserting the row and
   *   queueing its job, so no job exists at all. Genuinely lost work; requeue.
   * - **Job already gave up.** The job exists and is `failed` — it exhausted
   *   its retries, or the reaper timed it out. The page must be marked
   *   `failed`, *not* requeued.
   *
   * Telling those apart is what stops a page that reliably kills the worker
   * from being retried forever: `enqueue` inserts a **new** job row with
   * `attempts` back at zero, so requeueing a permanently-failed page resets
   * the retry cap on every tick and the crawl never settles.
   */
  async sweep() {
    const db = requireDatabase(this.database);
    const running = await db
      .select()
      .from(crawlsTable)
      .where(inArray(crawlsTable.status, ["queued", "running"]));

    let requeued = 0;
    let failed = 0;
    let finished = 0;

    for (const crawl of running) {
      // Backstop for a page whose failure hook threw: the job has given up,
      // so the page has too.
      const reconciled = (await db.execute(sql`
        update ${crawlPagesTable} p
        set status = 'failed',
            error_message = coalesce(
              (
                select j.error_message
                from ${ingestJobsTable} j
                where j.crawl_page_id = p.id and j.status = 'failed'
                order by j.id desc
                limit 1
              ),
              'Ingest job failed'
            ),
            updated_at = now()
        where p.crawl_id = ${crawl.id}
          and p.status = 'queued'
          and exists (
            select 1 from ${ingestJobsTable} j
            where j.crawl_page_id = p.id and j.status = 'failed'
          )
          and not exists (
            select 1 from ${ingestJobsTable} j
            where j.crawl_page_id = p.id
              and j.status in ('queued', 'processing')
          )
        returning p.id
      `)) as unknown as Array<{ id: number }>;
      failed += reconciled.length;

      // A page with no job row whatsoever — the only safe thing to requeue.
      const orphans = (await db.execute(sql`
        select p.id, p.url
        from ${crawlPagesTable} p
        where p.crawl_id = ${crawl.id}
          and p.status = 'queued'
          and not exists (
            select 1 from ${ingestJobsTable} j
            where j.crawl_page_id = p.id
          )
        order by p.id
      `)) as unknown as Array<{ id: number; url: string }>;

      if (orphans.length > 0) {
        // Spaced like any other batch. Firing every recovered page at `now`
        // would undo the politeness the rest of the crawl observes.
        await this.scheduleFetches(db, crawl, orphans);
        requeued += orphans.length;
      }

      const before = crawl.status;
      await this.refreshProgress(db, crawl.id);
      const [after] = await db
        .select({ status: crawlsTable.status })
        .from(crawlsTable)
        .where(eq(crawlsTable.id, crawl.id))
        .limit(1);
      if (after && after.status === "done" && before !== "done") {
        finished += 1;
      }
    }

    return { failed, finished, requeued };
  }

  private async requireCrawl(db: Database, id: number) {
    const [crawl] = await db
      .select()
      .from(crawlsTable)
      .where(eq(crawlsTable.id, id))
      .limit(1);

    if (!crawl) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Crawl ${id} not found`,
      });
    }

    return crawl;
  }

  private toCrawl(row: CrawlRow) {
    return {
      createdAt: row.createdAt.toISOString(),
      errorMessage: row.errorMessage,
      excludePattern: row.excludePattern,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      followExternal: row.followExternal,
      id: row.id,
      includePattern: row.includePattern,
      label: row.label,
      maxDepth: row.maxDepth,
      maxPages: row.maxPages,
      pagesDone: row.pagesDone,
      pagesFailed: row.pagesFailed,
      pagesQueued: row.pagesQueued,
      pathPrefix: row.pathPrefix,
      rootItemId: row.rootItemId,
      rootUrl: row.rootUrl,
      scope: row.scope as CrawlScopeMode,
      status: row.status as CrawlStatus,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
