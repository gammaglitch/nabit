# Ingest

How URLs become items in `nabit`. This doc reflects the code in `apps/api/src/modules/ingest/` and `packages/trpc/src/modules/ingest/` as of writing — when the pipeline changes, update this file alongside it.

## Entry points

| Surface | Route / procedure | Notes |
| --- | --- | --- |
| REST | `POST /ingest` | Body `{ url, payload?, ingestor? }`. Auth required (`req.user`). Returns `201` on create, `200` if the item already existed. |
| REST | `POST /ingest/batch` | Body `{ items: IngestBody[] }`. Loops `ingest()` sequentially; one throw aborts the rest. |
| tRPC | `ingest.ingest` / `ingest.batch` | Same shapes as REST, plus `ingest.list`, `ingest.get`, `ingest.delete` for read/delete, and `ingest.reextract` / `ingest.refresh` for re-running an item. |

REST handlers live in `apps/api/src/server.ts`; the tRPC router is in `packages/trpc/src/modules/ingest/router.ts`.

Auth accepts either a Supabase JWT or the static `API_TOKEN` env var (used by the tampermonkey scripts and the discord bot). See `apps/api/src/lib/auth.ts`.

## The pipeline

`IngestService.ingest()` (`apps/api/src/modules/ingest/service.ts`) runs these steps in order:

1. **Normalize the URL.** `normalizeSourceUrl()` (`ingestors.ts`) lowercases protocol/host, drops the fragment, rewrites `twitter.com` → `x.com` and `www/old.reddit.com` → `reddit.com`, strips `utm_*` and tracking params (`fbclid`, `gclid`, `si`, `ref`, `ref_src`, `ref_url`, `mc_cid`, `mc_eid`), sorts the remaining query params, and trims trailing slashes.
2. **Pick an ingestor.** `resolveIngestorName()` walks the `INGESTORS` array (`tweet`, `reddit`, `hacker_news`, `generic`) in order. First `matches()` wins; `generic` is the fallback. Callers can force one via the `ingestor` field on the request body.
3. **Capture.** The ingestor returns one or more `SnapshotArtifact`s (raw `body` + `contentType`). Behavior per ingestor is in the next section.
4. **Identify.** Each ingestor returns `{ externalId, sourceType, sourceUrl }` from the URL and/or first snapshot.
5. **Upsert the item.** `ensureItem()` looks up by `(sourceType, externalId)`. If found, updates `sourceUrl` and returns `created: false`. Otherwise inserts a stub row and returns `created: true`.
6. **Per snapshot:** insert into `rawSnapshotsTable`, run `ingestor.extract()`, insert an `extractionsTable` row tagged `success` / `partial` / `failed`. Failed extractions are stored with `itemId = null` so they don't shadow good ones.
7. **Pick the best extraction.** `preferExtraction()` ranks `success > partial > failed`, breaks ties by `contentText.length`, and breaks those by comment count — threads tie on body length constantly, and the capture that saw more of the discussion is the better one. The winner is applied via `applyExtraction()`, which writes `author/title/contentText/metadata/sourceCreatedAt` onto the item, then **merges** the extraction's comments into whatever is already archived (see [Comment merging](#comment-merging)).
8. **Return** `{ created, itemId, normalizedUrl, ingestor, sourceType, status, snapshotId, extractionId }`.

## Ingestors

All ingestors live in `apps/api/src/modules/ingest/ingestors.ts`.

### `tweet` (`tweet_json_v1`)

- Matches `x.com` / `twitter.com` URLs with `/status/<id>`.
- **Does not fetch.** The caller must POST a JSON `payload` (the X GraphQL tweet object). Throws if the payload is missing — there is no server-side fetch path for X.
- Used by `scripts/tampermonkey/x-bookmarks-exporter.user.js`, which forwards bookmarks via `POST /ingest/batch`.
- Extracts: best tweet text, author screen name, media URLs, like / reply / retweet / bookmark counts, quoted tweet id.

### `reddit` (`reddit_json`)

- Matches `reddit.com/r/<sub>/comments/...`.
- Fetches the `.json` variant of the post URL with `User-Agent: nabit/0.1`.
- The first listing child is the post; the second is the comment tree, walked by `flattenRedditComments()` into a materialized-path list (`n0001.n0001…`).
- Extracts: title, selftext, author, score, subreddit, num_comments, permalink.

### `hacker_news` (`hn_algolia_json`)

- Matches `news.ycombinator.com/item`.
- Fetches `https://hn.algolia.com/api/v1/items/<id>` for the threaded post.
- Comment tree flattened the same way as reddit. HTML body converted to plain text via `htmlToText`.
- Extracts: title, text, author, points, source article URL.

### `generic` (`readability`)

- Fallback for everything else.
- `fetch()` the page, then if `env.headlessBrowser.enabled` and the HTML looks JS-rendered (`needsBrowserCapture`), capture a second rendered snapshot via the headless browser and append it as a separate snapshot.
- Extracts via JSDOM + Mozilla Readability. Status: `success` if extracted text ≥200 chars, `partial` if shorter, `failed` if Readability returned nothing.
- Metadata: `excerpt`, `siteName`, `language`, `wordCount`, `contentType`.

## Storage

Defined in `apps/api/src/db/schema.ts`:

- `itemsTable` — one row per `(sourceType, externalId)`. Holds the canonical author / title / contentText / metadata / sourceCreatedAt plus a Postgres `tsvector` `searchVector` column used by `list()`'s `plainto_tsquery`.
- `rawSnapshotsTable` — every captured byte stream. Re-extracting later is possible without re-fetching.
- `extractionsTable` — one row per extraction attempt, linked to a snapshot. Failed attempts have `itemId = null`.
- `commentsTable` — flattened comment tree with materialized paths.
- `itemTagsTable` / `tagsTable` — tagging, managed via the `tags` tRPC router.

## Read / delete

`ingest.list` supports `search` (full-text via `searchVector @@ plainto_tsquery`), `sourceType`, and `tagIds` (item must have *all* requested tags). It loads every matching row — there is currently no `limit` / `offset`. `ingest.get` returns one item with its snapshots, extractions, comments, and tags. `ingest.delete` removes by id (cascades via FK).

## Linked items (HN / Reddit → article)

The item the user explicitly archived is always the **primary** (`subjectItemId = null`). When a Hacker News or Reddit ingest finds an off-site URL on the submission, that URL is auto-fetched as a **child** and its `subjectItemId` points back at the primary discussion item. This way the list view shows the thread (what the user asked for) with an "HN" / "RDT" badge, and the reader view pulls in the attached article body alongside the thread comments.

- **Off-site filter.** Each extractor filters before emitting `linkedUrls`. HN drops `news.ycombinator.com`. Reddit drops `reddit.com` / `www.reddit.com` / `old.reddit.com` / `redd.it` / `i.redd.it` / `v.redd.it` / `preview.redd.it`, and also skips self-posts (`post.is_self === true`). Only the first valid URL is used — a discussion has at most one attached article.
- **Order of operations inside `ingest()`.** The service runs `capture()` and `extract()` for the primary in memory, then `ensureItem` inserts/updates the primary with `subjectItemId = null`, then persists its snapshots and extractions. Only after that does it recursively call `ingestInternal({ skipLinkedUrls: true })` for the off-site URL and, if that ingest just **created** a new row, patch its `subjectItemId` to the primary's id via a direct `UPDATE`.
- **Depth cap.** `skipLinkedUrls: true` is only set on the internal child recursion, so a child ingest cannot itself trigger a further child ingest. Grandchildren can't happen, and the public `ingest()` method always kicks off a top-level call.
- **Respect pre-existing direct archives.** If the user had already archived the off-site URL standalone (`sourceItem.created === false`), the child link is **not** written — the pre-existing item stays a top-level row in the list. In that case there is no recorded link between the two items. Auto-fetched children that are newly created during an HN/Reddit ingest are the only items that end up with a non-null `subjectItemId`.
- **Linked-fetch failure isolation.** If the child ingest throws, the primary ingest still completes normally. The error is written onto the primary as `metadata.linkedFetchError`. Retry later by re-ingesting the discussion URL.
- **IngestResult shape.** Every successful ingest returns a `sourceItem` field — for HN/Reddit threads this is the nested `IngestResult` of the auto-fetched child article (or `null` if there was no off-site URL). The outer ingest's own `subjectItemId` is always `null`.

## Re-running an item

Two different things can be done to an item that is already archived, and they are separate on purpose.

| | `ingest.reextract` | `ingest.refresh` |
| --- | --- | --- |
| Fetches the source | No | Yes |
| Reads | every `raw_snapshots` row for the item | one new capture |
| Runs | in the API process, synchronously | on the ingest worker, as a queued job |
| Use it for | an extractor fix reaching old captures | a thread that has grown comments since capture |

### `reextract`

`IngestService.reextract()` replays the current extractor over the bytes already archived and applies the best result, recording an `extractions` row per snapshot so the history of what the extractor did stays intact. It never touches the network: the snapshot is the archived copy, and re-fetching would silently swap it for whatever the page says today.

### `refresh`

`IngestService.refresh()` takes an item id, resolves its ingestor, and **enqueues an ingest job for the item's `sourceUrl`** — it does not fetch anything itself. Two reasons for the queue:

- The ingest worker is the process with the egress the scraped sites tolerate. `compose.vpn.yml` tunnels `ingest-worker` only, so a fetch from the API container would come from the host IP that reddit 403s.
- A capture plus extraction is too slow to hold a request open for.

From there it is an ordinary ingest of a URL that already has an item: `ensureItem` finds the existing row by `(sourceType, externalId)`, the new bytes land as an **additional** snapshot, and the fresh extraction is applied. The reader (`RefreshButton` + `useRefreshSource`) polls `ingest.job` and invalidates the item once the job lands.

Consequences worth knowing:

- **`refresh` is refused for `tweet`.** Ingestors carry a `refetchable` flag; `tweet` sets it false because its capture needs a payload from the tampermonkey script, so a job would only ever throw.
- **The body is whatever the fresh capture extracts**, exactly as if the URL had been nabbed again. Comments, by contrast, only ever accumulate.
- **A thread's linked article is refreshed too**, because the re-ingest walks `linkedUrls` like any other. `subjectItemId` survives — `ensureItem` only writes it when non-null.
- **`digestOptIn` survives.** `ensureItem` never updates it on an existing row.
- Refreshing a URL with a capture already in flight returns that job with `reused: true` rather than queueing a second fetch.

## Comment merging

A capture is a point-in-time view of a thread, not the thread itself. Reddit pages its comment tree, re-sorts it on every request, and replaces the body of a deleted comment with `[deleted]`. So "not in the bytes I just fetched" never means "did not exist" — it means the archive is the only place that comment still lives.

`planCommentMerge()` (`apps/api/src/modules/ingest/comment-merge.ts`, pure and unit-tested) turns a capture's comments plus the item's archived rows into a set of writes. Rows are **only ever inserted or updated, never deleted**. The rules:

| Case | What happens |
| --- | --- |
| In the capture, not archived | Inserted. |
| In the capture and archived | Updated in place — same row id, so its `comment_tags` survive. |
| In the capture as `[deleted]` / `[removed]`, archived with real text | The archived author, body and timestamp are **kept**; `metadata.removedFromSourceAt` is stamped. |
| In the capture with real text, archived as a tombstone | The real text wins and `removedFromSourceAt` is cleared (mods do approve removed comments). |
| Not in the capture at all | Kept as-is, with `metadata.missingFromSourceAt` stamped. Cleared if it shows up again. |
| Capture has no comments at all | Nothing is touched. An article extractor returning no comments is not evidence the thread lost its own. |

Matching is by `external_id` (positional paths get rewritten every time the source re-sorts). Metadata is merged rather than replaced, ignoring incoming nulls — a deleted comment reports `score: null` where it used to report a number, and the archived value is the better one.

**Paths.** Each capture rebuilds the materialized path from its own ordering, so a comment that only exists in the archive would otherwise collide with a live one. Those are re-anchored under wherever their parent ended up, with a `z0001`-style label — `z` sorts after the `n` labels a live capture produces, so archived-only replies land at the end of their parent's children. Orphans (parent never archived) go to the root.

**Writes.** Comments carrying an external id go through the `uq_comments_item_external` constraint as one `ON CONFLICT DO UPDATE` batch per 250 rows, so a re-fetch of a 500-comment thread is a couple of statements. Unchanged rows produce no write at all.

The reader marks `removedFromSourceAt` comments with a small `deleted at source` tag next to the archived body. `missingFromSourceAt` is deliberately not surfaced — a comment can go missing because the source paged or re-sorted, which is not worth a badge.

## Markdown

Items carry two body fields: `contentText` (plain text for search) and `contentMarkdown` (the Obsidian-ready version).

- **Generic (`readability`)** — parses `Readability.content` (the article HTML) through Turndown with ATX headings, hyphen bullet markers, inlined links, and fenced code blocks. Stored on the item as `content_markdown`.
- **Hacker News (`hn_algolia_json`)** — `post.text` is HTML; we turndown it. Self-posts get markdown; link posts leave it null (the article is a separate child item that points back at the thread via `subjectItemId`).
- **Reddit (`reddit_json`)** — `post.selftext` is already markdown, stored as-is in both `contentText` and `contentMarkdown`.
- **Tweet** — left as plain text for now.

## Article grading

The generic extractor grades by word count (not character count) to separate real prose from JS app shells and thin stubs:

| `wordCount` | Status |
| --- | --- |
| < 20 | `failed` with `errorMessage: "Extracted content is too short to be an article (N words)"` |
| 20 ≤ N < 100 | `partial` |
| ≥ 100 | `success` |

Non-`text/html` content types are short-circuited to `failed` before Readability runs, so PDFs and images don't produce junk extractions.

## Known gaps

- **Batch is serial and not isolated.** `ingestBatch` loops `ingest()` and propagates the first throw, so one bad URL fails the whole batch.
- **A refresh can downgrade a body.** Comments only accumulate, but the item's body is whatever the fresh capture extracts. Re-fetching an article that has since gone behind a soft paywall replaces good archived prose with the stub, as long as the stub still grades `success`. The old bytes are still in `raw_snapshots`, so `reextract` is not a recovery path for this — only reading the snapshot is.
- **`missingFromSourceAt` is not the same as deleted.** Reddit's `limit=500` truncates deep threads, so a comment can go missing because of pagination. The marker says "not in the last capture" and nothing more.
- **`tweet` requires an external capturer.** No server-side X fetch path; depends on the tampermonkey script having the GraphQL payload.
- **Generic has no headless fallback in production.** The hook is wired (`needsBrowserCapture` + `HEADLESS_BROWSER_CAPTURE_URL`) but there's no container running behind it yet, so JS-only pages still come back as `failed`.
- **`list()` is unpaginated.** It computes `total` but selects every matching row.
- **Linked fetch failures don't get a retry queue.** They surface as `metadata.linkedFetchError` on the primary item; there's no scheduled retry — you have to re-ingest manually.
