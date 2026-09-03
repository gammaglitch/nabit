# Crawl

How one URL becomes a whole archived site. This doc reflects the code in
`apps/api/src/modules/crawl/` and `apps/web/features/sites/` as of writing —
when the crawler changes, update this file alongside it.

Read [`ingest.md`](/docs/features/ingest.md) first. A crawl does not capture or
extract anything itself; it decides *which* URLs get ingested and records how
they relate, and every page it queues goes through the ordinary ingest
pipeline.

## Why not httrack

httrack and friends produce an offline **mirror**: files on disk plus rewritten
hrefs. nabit needs normalized items keyed by `(sourceType, externalId)`, graded
extractions, and a `tsvector`. The only genuinely useful part of a mirroring
tool is its frontier logic, which is the small part. Shelling out would also
add a second fetch stack that does not share the egress `ingest-worker` has
(`compose.vpn.yml` tunnels that container and nothing else).

## Entry points

| Surface | Procedure | Notes |
| --- | --- | --- |
| tRPC | `crawl.start` | Creates the crawl, queues the root page, returns immediately. |
| tRPC | `crawl.list` / `crawl.get` | `get` returns the crawl plus every page, ordered parents-before-children. |
| tRPC | `crawl.cancel` | Stops the fan-out. In-flight pages finish. |
| tRPC | `crawl.delete` | Removes the crawl; `deleteItems` decides whether the archived pages go too. |

There is no REST surface. Crawling is a deliberate, interactive act, and the
headless clients (userscripts, discord bot) nab single URLs.

**Crawls are `generic`-only.** `start` refuses any URL that resolves to another
ingestor. `tweet`, `reddit` and `hacker_news` key off an API payload or a thread
id and have no notion of "the pages this one links to", so a crawl rooted there
could only ever archive its single page.

## Storage

Two tables, in `apps/api/src/db/schema.ts`:

- **`crawls`** — the root URL, the scope config, the budgets, a status, and
  denormalized page counters. The counters are only ever a summary of
  `crawl_pages`; they are recomputed rather than incremented (see *Progress*).
- **`crawl_pages`** — the frontier, the visited set and the tree, in one table.

`ingest_jobs` gains a nullable `crawl_id` and `crawl_page_id`. Their presence is
the only thing that distinguishes a crawl fetch from an ordinary one.

### `crawl_pages` earns its keep three times over

- **Visited set.** `unique (crawl_id, url)` plus `ON CONFLICT DO NOTHING` on
  every insert. A page linked from twenty siblings is queued once, and a
  re-expansion after a retry is a no-op rather than a duplicate.
- **Frontier.** A row with `status = 'queued'` is work outstanding.
- **Tree.** `parent_page_id` records which page linked here and
  `discovery_index` where in that page's link list it appeared.

That last one is the reason the site view reads well: the tree follows
**discovery**, not URL nesting, so a table-of-contents page produces the
author's own ordering rather than a shape derived from path segments.

## Scope

`apps/api/src/modules/crawl/scope.ts` is pure — no database, no network, no
clock — and unit-tested in `apps/api/test/crawl-scope.test.ts`.
`createLinkClassifier()` is built once per expansion and returns a verdict per
link:

| Verdict | Meaning |
| --- | --- |
| `expand` | In scope. Archived, and its own links are harvested in turn. |
| `leaf` | Archived, but never expanded. |
| `skip` | Not archived at all, with a reason. |

Checks run in this order: parse and reject non-`http(s)` (`mailto:`,
`javascript:`, `tel:`, `data:`) → normalize with the pipeline's own
`normalizeSourceUrl()` → reject non-document extensions → `exclude` → `include`
→ depth budget → in-scope test.

Normalizing before anything else is what makes `/a`, `/a/`, `/a#section` and
`/a?utm_source=toc` one URL, so the unique index actually dedupes.

### Modes

- **`host`** (default) — same hostname exactly. `docs.site.com` stays on
  `docs.site.com`; `api.site.com` and the apex are out.
- **`path`** — same host, and the path must sit under the root's directory,
  stored as `crawls.path_prefix`.

`path_prefix` is a column rather than something derived at classify time
because `normalizeSourceUrl` trims the trailing slash, and that slash is the
only thing distinguishing the directory `/guide/` from the page `/guide`. It is
computed by `resolvePathPrefix()` from the URL **as the user typed it**.

A registrable-domain mode (so `api.site.com` counts as the same site) would
need a public-suffix list to handle `site.co.uk`, which means a new dependency
and the 7-day package age rule in `bunfig.toml`. Not offered yet.

`www.` is stripped for host comparison only. A page on `www.site.com` linking
to `site.com` is linking to itself, and treating that as off-site would strand
half a crawl.

### External links

`followExternal` archives an off-scope page as a **leaf**: it gets the full
capture-and-extract treatment, and its own links are never harvested. This is
the whole safety property — expanding externals is how "archive this handbook"
becomes "archive everything the handbook cites, and everything *those* pages
cite".

### Depth

`maxDepth` is the maximum depth of an *archived* page; the root is depth 0. A
link found on a page at depth `d` produces a page at `d + 1`, which is skipped
if it exceeds `maxDepth`. A page landing exactly *on* `maxDepth` is archived as
a leaf, since harvesting its links would only produce rows we would discard.

## Harvesting links

`harvestOutboundLinks()` in `apps/api/src/modules/ingest/ingestors.ts` reads
the whole JSDOM document, **before Readability runs**.

This is the single most important detail in the feature. Readability's entire
job is discarding nav, sidebars and link lists — which on a table-of-contents
page is the whole page. Harvesting its output would return nothing for exactly
the pages a crawl exists to walk. Such a page also grades `failed` under the
word-count rules (< 20 words), so `outboundLinks` is attached to the failure
return paths too, and expansion keys off *links found*, never extraction status.

It uses `anchor.href` rather than resolving `getAttribute("href")` by hand, so a
document's own `<base href>` is honoured. Capped at 2000 links per page.

The links ride out on `ExtractionAttempt.outboundLinks` (distinct from
`linkedUrls`, which keeps its narrow meaning: the one off-site article a
discussion thread points at) and then on an internal-only result type inside
`IngestService`. `toPublicResult()` strips them before anything is stored or
returned — a few hundred URLs per row would bloat `ingest_jobs.result`, and the
`IngestOutput` DTO would drop them anyway.

## The loop

1. `crawl.start` inserts the crawl and its root page, then enqueues one
   ordinary ingest job carrying `crawl_id` / `crawl_page_id`.
2. The worker claims that job like any other and runs the full pipeline.
3. On success, **before the job is marked successful**, `processNextJob` calls
   the registered crawl hook with the page's outbound links.
4. `CrawlService.expand()` marks the page done, classifies every link, writes
   the surviving rows, and enqueues a job per genuinely-new row.
5. Progress is recomputed. When nothing is pending, the crawl is `done`.

### Expansion runs before the job is marked successful

Deliberately. If a crash landed between "job marked success" and "links
walked", the page would be recorded as done with its links never followed, and
the crawl would stall — silently, and in a way nothing could detect after the
fact. Failing the job instead means the reaper requeues it and the re-fetch
harvests the links again. Safe to repeat, because every frontier insert is
`ON CONFLICT DO NOTHING`.

### Wiring

`IngestService` never imports `CrawlService`. It exposes `setCrawlHooks()`,
called from `apps/api/src/lib/services.ts` and `apps/api/src/worker.ts`.
`CrawlService` depends on `IngestService` for its enqueueing, so constructor
injection either way round would be a cycle.

The worker is the process that actually runs a crawl — the API only ever queues
the root page.

## Budgets and politeness

- **`maxPages`** counts non-`skipped` rows. Once spent, further discoveries are
  still **recorded** as `skipped` with a reason, so the site view can say the
  crawl hit its cap rather than looking mysteriously short.
- **robots.txt** is fetched once per origin and cached for an hour
  (`RobotsCache`, with in-flight collapsing so one expansion does not stampede).
  Disallowed URLs are written as `skipped`, not queued and quietly dropped.
  Parsing (`parseRobots`, `isPathAllowed`) is split from fetching and tested in
  `apps/api/test/crawl-robots.test.ts`: named groups beat `*`, `Allow` beats
  `Disallow` on a longer match, `*` and `$` are honoured, and an empty
  `Disallow:` means allow-all rather than block-all.
- **Pacing.** New jobs are spaced with `ingest_jobs.run_after`, continuing from
  whatever the crawl already has queued, using the host's `Crawl-delay` or a
  one-second floor. The worker is serial anyway, so this is a floor rather than
  a scheduler.

This repo already fights egress reputation — reddit 403s the host IP, which is
why `compose.vpn.yml` tunnels the worker — and a blocked host costs far more
than the pages skipped.

## Progress and completion

`refreshProgress()` recomputes `pages_done` / `pages_failed` / `pages_queued`
with one aggregate over `crawl_pages` and closes the crawl out when nothing is
pending. Counted rather than incremented so the numbers cannot drift when a
page is retried, re-expanded after a crash, or reached from two parents.

`CrawlService.sweep()` runs on the worker's existing reap tick and handles what
the loop cannot notice on its own:

- a page stuck at `queued` with no live job (the process died between writing
  the row and enqueueing it) — re-enqueued;
- a crawl whose last page settled while the hook was failing — closed out.

A permanently failed job marks its page `failed`, but only once retries are
spent: doing it on the first attempt would let a crawl report itself finished
while a job was still queued for another go.

## Cancelling and deleting

`cancel` deletes the crawl's still-`queued` jobs first, then marks its queued
pages `skipped` and the crawl `cancelled`. In-flight jobs are left to finish;
their expansion sees a cancelled crawl and records the page without fanning out.

`delete` drops the crawl. `crawl_pages` and the crawl's `ingest_jobs` follow via
`ON DELETE CASCADE`. The archived **items** survive unless `deleteItems` is set
— dropping someone's archive should not be a side effect of tidying up a crawl.

## The library and the site view

Crawled sub-pages are excluded from `ingest.list` by a `NOT EXISTS` against
`crawl_pages` where `is_root = false`. Filtered server-side on purpose: that
query is still unpaginated, so a 200-page crawl would otherwise ship 200 rows
for the browser to throw away.

The crawl **root** stays a normal library row and carries a `crawl` summary
(`{ id, label, pageCount, pageId, pagesQueued, status }`) so it can render as a
site. `ingest.get` attaches the same summary for **any** crawl page, not just
roots — the reader needs the breadcrumb most on a sub-page, which is exactly the
item the library never shows.

`subjectItemId` is deliberately **not** reused for crawl membership.
`ItemsPage` filters out every item with a non-null `subjectItemId` and
`ReaderPage` redirects such an item to its parent: that relation means "not
independently viewable", which is the opposite of a browsable sub-page.

Web side, in `apps/web/features/sites/`:

- `/sites` — one card per crawl, with progress, stop, and delete.
- `/sites/[id]` — the site browser. Tree on the left, archived page on the
  right. Selection lives in the URL (`?page=`) so a sub-page is linkable and
  survives a reload; `j` / `k` move through readable pages; `Escape` goes back.
- `buildSiteTree()` (`features/sites/utils/tree.ts`) assembles the tree in one
  pass. It is pure and tested — including the cases that matter for not losing
  a page from the view: an orphan whose parent is missing is shown at the root,
  and a page claiming itself as its own parent does not hang the walk.

## Known gaps

- **No registrable-domain scope.** Needs a public-suffix list; see *Modes*.
- **`crawl.get` returns every page.** Fine for the 200-page default cap,
  wasteful at the 5000 ceiling. Same unpaginated shape as `ingest.list`.
- **No resume.** A cancelled crawl cannot be continued; re-running means
  starting a new one over the same URL. The ingest side is idempotent, so the
  pages update in place rather than duplicating, but the old crawl's tree stays
  behind.
- **`page.title` is denormalized.** `crawl.get` prefers the item's live title
  and falls back to the stored one, so a re-extraction that changes a title is
  reflected on read, but the stored copy goes stale.
- **Politeness is crawl-wide, not host-wide.** Two concurrent crawls of the
  same host do not coordinate their spacing.
- **Overlapping crawls re-fetch.** Job dedup is scoped to a single crawl, so a
  URL in two live crawls is fetched twice — a shared job would leave one crawl
  never receiving the page's links, which is the worse failure.
