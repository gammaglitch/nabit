# Ingest

How URLs become items in `nabit`. This doc reflects the code in `apps/api/src/modules/ingest/` and `packages/trpc/src/modules/ingest/` as of writing — when the pipeline changes, update this file alongside it.

## Entry points

| Surface | Route / procedure | Notes |
| --- | --- | --- |
| REST | `POST /ingest` | Body `{ url, payload?, ingestor?, tags? }`. Auth required (`req.user`). Returns `201` on create, `200` if the item already existed. |
| REST | `POST /ingest/batch` | Body `{ items: IngestBody[], tags? }`. Loops `ingest()` sequentially; one throw aborts the rest. Batch-level `tags` apply to every item, on top of any the item carries. |
| tRPC | `ingest.ingest` / `ingest.batch` | Same shapes as REST, plus `ingest.list`, `ingest.get`, `ingest.delete` for read/delete. |

REST handlers live in `apps/api/src/server.ts`; the tRPC router is in `packages/trpc/src/modules/ingest/router.ts`.

Auth accepts either a Supabase JWT or the static `API_TOKEN` env var (used by the tampermonkey scripts and the discord bot). See `apps/api/src/lib/auth.ts`.

## The pipeline

`IngestService.ingest()` (`apps/api/src/modules/ingest/service.ts`) runs these steps in order:

1. **Normalize the URL.** `normalizeSourceUrl()` (`ingestors.ts`) lowercases protocol/host, drops the fragment, rewrites `twitter.com` → `x.com` and `www/old.reddit.com` → `reddit.com`, strips `utm_*` and tracking params (`fbclid`, `gclid`, `si`, `ref`, `ref_src`, `ref_url`, `mc_cid`, `mc_eid`), sorts the remaining query params, and trims trailing slashes.
2. **Pick an ingestor.** `resolveIngestorName()` walks the `INGESTORS` array (`tweet`, `reddit`, `hacker_news`, `generic`) in order. First `matches()` wins; `generic` is the fallback. Callers can force one via the `ingestor` field on the request body.
3. **Capture.** The ingestor returns one or more `SnapshotArtifact`s (raw `body` + `contentType`). Behavior per ingestor is in the next section.
4. **Identify.** Each ingestor returns `{ externalId, sourceType, sourceUrl }` from the URL and/or first snapshot.
5. **Upsert the item.** `ensureItem()` looks up by `(sourceType, externalId)`. If found, updates `sourceUrl` and returns `created: false`. Otherwise inserts a stub row and returns `created: true`. Either way it applies the request's `tags` — see [Tagging on ingest](#tagging-on-ingest).
6. **Per snapshot:** insert into `rawSnapshotsTable`, run `ingestor.extract()`, insert an `extractionsTable` row tagged `success` / `partial` / `failed`. Failed extractions are stored with `itemId = null` so they don't shadow good ones.
7. **Pick the best extraction.** `preferExtraction()` ranks `success > partial > failed` and breaks ties by `contentText.length`. The winner is applied via `applyExtraction()`, which writes `author/title/contentText/metadata/sourceCreatedAt` onto the item, then **deletes and re-inserts** all comments for that item from the extraction.
8. **Return** `{ created, itemId, normalizedUrl, ingestor, sourceType, status, snapshotId, extractionId }`.

When the job that triggered this carries a `crawl_id`, step 8 is preceded by handing the page's outbound links to the crawler — see [`crawl.md`](/docs/features/crawl.md). Ordinary ingests have no `crawl_id` and expand nothing.

## Ingestors

All ingestors live in `apps/api/src/modules/ingest/ingestors.ts`.

### `tweet` (`tweet_json_v1`)

- Matches `x.com` / `twitter.com` URLs with `/status/<id>`.
- **Does not fetch.** The caller must POST a JSON `payload` (the X GraphQL tweet object). Throws if the payload is missing — there is no server-side fetch path for X.
- Used by `scripts/tampermonkey/x-bookmarks-exporter.user.js`, which forwards bookmarks via `POST /ingest/batch`.
- Extracts: best tweet text, author screen name, media URLs, like / reply / retweet / bookmark counts, quoted tweet id.

### `reddit` (`reddit_json`)

- Matches `reddit.com/r/<sub>/comments/...`.
- **Two capture paths.** If the caller supplies the `.json` listing as `payload`, it is stored as-is and nothing is fetched. Otherwise `capture()` falls back to fetching `.json?limit=500&raw_json=1` server-side with `User-Agent: nabit/0.1`.
- **The server fetch no longer works against live reddit.** Reddit answers `.json` with a `403` "You've been blocked by network security" page for every unauthenticated client — this is not a datacenter-IP block, a residential IP gets the same response, so the `compose.vpn.yml` egress overlay does not help. `robots.txt` is `Disallow: /` for all agents. The fallback is kept only so the non-browser paths (web UI, discord bot, REST, the linked-item recursion under an HN thread) degrade to that error instead of hard-failing on a missing payload.
- **The working path is the browser extension**, which fetches the same URL from inside the user's reddit tab and forwards the response body verbatim. See [Browser-captured reddit threads](#browser-captured-reddit-threads).
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
- Also emits `outboundLinks`: every link on the page, harvested from the full document **before** Readability runs, and present even on `failed` extractions. Only crawls read it — see [`crawl.md`](/docs/features/crawl.md) for why it cannot come from Readability's output.

## Tagging on ingest

Callers can name tags on the request and have them applied when the item
lands. Names, not ids: the headless clients that use this — the browser
extension's bulk import, userscripts, the Discord bot — have no tag-lookup
round trip available, and `tags` has no REST surface at all.

- `enqueue()` normalizes and stores them on `ingest_jobs.tags` (jsonb, null
  when there are none), so a queued job still knows its tags whenever the
  worker gets to it.
- `normalizeTagNames()` trims, lowercases, de-duplicates, and caps at 20 tags
  of 64 characters. It matches `TagsService.create` exactly, so an
  ingest-applied tag reuses the row the reader would have made instead of
  creating a near-duplicate beside it. This is the only validation on the REST
  path, which never passes through the tRPC schema.
- `applyTags()` creates any missing tag (`onConflictDoNothing`, then read
  back) and attaches it. Both inserts tolerate conflicts, so a replayed job
  re-attaches harmlessly.
- Tags are applied to **existing** items too, unlike `digestOptIn`, which
  `ensureItem` sets only on insert. Adding a tag is additive and can't clobber
  user state, and re-importing an already-archived favorite under a tag is
  exactly when the tag should stick.
- A linked child item **inherits** the parent's tags — the article an HN
  thread points at is part of the same batch of reading. `digestOptIn` is
  deliberately not inherited, because it enrolls the item in paid LLM work.
- Reusing an in-flight job keeps the first job's tags. Re-importing a URL
  that is still queued under a new tag will not apply the new tag; once the
  job finishes, a re-import queues fresh and tags normally.

## Storage

Defined in `apps/api/src/db/schema.ts`:

- `itemsTable` — one row per `(sourceType, externalId)`. Holds the canonical author / title / contentText / metadata / sourceCreatedAt plus a Postgres `tsvector` `searchVector` column used by `list()`'s `plainto_tsquery`.
- `rawSnapshotsTable` — every captured byte stream. Re-extracting later is possible without re-fetching.
- `extractionsTable` — one row per extraction attempt, linked to a snapshot. Failed attempts have `itemId = null`.
- `commentsTable` — flattened comment tree with materialized paths.
- `itemTagsTable` / `tagsTable` — tagging, managed via the `tags` tRPC router and by `ensureItem` for tags supplied at ingest.
- `crawlsTable` / `crawlPagesTable` — site crawls. Not part of this pipeline; see [`crawl.md`](/docs/features/crawl.md).

## Read / delete

`ingest.list` supports `search` (full-text via `searchVector @@ plainto_tsquery`), `sourceType`, and `tagIds` (item must have *all* requested tags). Sub-pages collected by a crawl are excluded unless `includeCrawledPages` is set, and the crawl **root** carries a `crawl` summary so the library can render it as a site. It loads every matching row — there is currently no `limit` / `offset`. `ingest.get` returns one item with its snapshots, extractions, comments, and tags. `ingest.delete` removes by id (cascades via FK).

## Browser-captured reddit threads

Reddit's `.json` endpoint refuses every unauthenticated client, so the only way
to capture a thread is from a browser that is already logged in. The extension
does that, and the API accepts the result through the existing `payload` field.

- **Where the fetch runs.** Inside the thread's own tab, via
  `browser.scripting.executeScript` (`apps/extension/lib/reddit.ts`). A fetch
  issued from the background worker is cross-site relative to reddit.com, so
  `SameSite=Lax` session cookies are withheld and reddit returns its block page
  — the same URL that works in the address bar fails from the worker. Injected
  into the tab it is a same-origin request carrying the user's real session.
- **Permissions.** `scripting` is in the manifest; `*://*.reddit.com/*` is not,
  and is requested at runtime on the first thread save (the same treatment
  `news.ycombinator.com` gets, for the same reason — no install-time warning for
  a feature a given user may never touch).
- **The payload is the raw response body, as a string.** `stringifyPayload()`
  passes strings through unchanged, so the stored snapshot is byte-for-byte what
  reddit served that browser. This matters more here than elsewhere: these bytes
  transit the user's browser once and cannot be re-fetched server-side, and
  `reextract` can only ever be as good as the snapshot it replays.
- **Payload presence is not the signal; shape is.** `tabsToItems()` attaches tab
  provenance (`{ id, title, url, faviconUrl }`) to *every* tab it sends, reddit
  threads included. A listing is always the JSON array `[post, comments]` and
  provenance is always an object, so `asRedditListing()` discriminates on the
  array shape. A provenance payload falls through to the server fetch rather
  than being rejected.
- **Validation happens twice, on purpose.** The extension checks the content
  type, the array shape, and that the post id matches the tab before sending;
  the ingestor re-checks the shape and the id against the URL, because a client
  payload is untrusted input. The failure this guards against is specific and
  observed: a stale session makes reddit answer **200 with an HTML login page**,
  which would otherwise be archived as a successful capture holding a login form.
- **Comment permalinks are truncated to the thread root.** Requesting `.json` on
  a permalink returns only that comment's subtree, which would archive a
  fragment that looks like a whole thread.
- **Both paths request `?limit=500&raw_json=1`.** `buildThreadJsonUrl()` in the
  extension and `buildRedditJsonUrl()` in `@repo/ingestors` must stay in step, or
  a client capture and a server capture are not interchangeable.
- **Partial failure is a warning, not an error.** A thread whose in-tab capture
  fails is still sent without a listing, so one bad thread cannot sink a
  selection; the reason comes back in `IngestReply.warnings` and is shown in the
  popup.
- **Body size.** A busy thread at `limit=500` runs to megabytes and
  `/ingest/batch` sends up to 50 items, so the API sets `bodyLimit` to 32 MiB.
  Fastify's 1 MiB default would 413, presenting as "the extension fails on
  popular threads".

### What this does not cover

Only tabs carry a payload, so these still take the server path and still fail:

- bookmark and HN-favorite imports that happen to contain reddit URLs
- the web UI's capture modal, the discord bot, and REST clients
- the linked-item recursion when an HN thread points at a reddit thread
- re-ingesting threads that failed before this existed

## Linked items (HN / Reddit → article)

The item the user explicitly archived is always the **primary** (`subjectItemId = null`). When a Hacker News or Reddit ingest finds an off-site URL on the submission, that URL is auto-fetched as a **child** and its `subjectItemId` points back at the primary discussion item. This way the list view shows the thread (what the user asked for) with an "HN" / "RDT" badge, and the reader view pulls in the attached article body alongside the thread comments.

- **Off-site filter.** Each extractor filters before emitting `linkedUrls`. HN drops `news.ycombinator.com`. Reddit drops `reddit.com` / `www.reddit.com` / `old.reddit.com` / `redd.it` / `i.redd.it` / `v.redd.it` / `preview.redd.it`, and also skips self-posts (`post.is_self === true`). Only the first valid URL is used — a discussion has at most one attached article.
- **Order of operations inside `ingest()`.** The service runs `capture()` and `extract()` for the primary in memory, then `ensureItem` inserts/updates the primary with `subjectItemId = null`, then persists its snapshots and extractions. Only after that does it recursively call `ingestInternal({ skipLinkedUrls: true })` for the off-site URL and, if that ingest just **created** a new row, patch its `subjectItemId` to the primary's id via a direct `UPDATE`.
- **Depth cap.** `skipLinkedUrls: true` is only set on the internal child recursion, so a child ingest cannot itself trigger a further child ingest. Grandchildren can't happen, and the public `ingest()` method always kicks off a top-level call.
- **Respect pre-existing direct archives.** If the user had already archived the off-site URL standalone (`sourceItem.created === false`), the child link is **not** written — the pre-existing item stays a top-level row in the list. In that case there is no recorded link between the two items. Auto-fetched children that are newly created during an HN/Reddit ingest are the only items that end up with a non-null `subjectItemId`.
- **Linked-fetch failure isolation.** If the child ingest throws, the primary ingest still completes normally. The error is written onto the primary as `metadata.linkedFetchError`. Retry later by re-ingesting the discussion URL.
- **IngestResult shape.** Every successful ingest returns a `sourceItem` field — for HN/Reddit threads this is the nested `IngestResult` of the auto-fetched child article (or `null` if there was no off-site URL). The outer ingest's own `subjectItemId` is always `null`.

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
- **Comment merging is destructive.** Re-ingesting wipes and re-inserts all comments rather than merging — old comment ids and any downstream references are lost.
- **`tweet` requires an external capturer.** No server-side X fetch path; depends on the tampermonkey script having the GraphQL payload.
- **Generic has no headless fallback in production.** The hook is wired (`needsBrowserCapture` + `HEADLESS_BROWSER_CAPTURE_URL`) but there's no container running behind it yet, so JS-only pages still come back as `failed`.
- **`list()` is unpaginated.** It computes `total` but selects every matching row.
- **Linked fetch failures don't get a retry queue.** They surface as `metadata.linkedFetchError` on the primary item; there's no scheduled retry — you have to re-ingest manually.
