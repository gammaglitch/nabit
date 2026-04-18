# Ingest

How URLs become items in `nabit`. This doc reflects the code in `apps/api/src/modules/ingest/` and `packages/trpc/src/modules/ingest/` as of writing — when the pipeline changes, update this file alongside it.

## Entry points

| Surface | Route / procedure | Notes |
| --- | --- | --- |
| REST | `POST /ingest` | Body `{ url, payload?, ingestor? }`. Auth required (`req.user`). Returns `201` on create, `200` if the item already existed. |
| REST | `POST /ingest/batch` | Body `{ items: IngestBody[] }`. Loops `ingest()` sequentially; one throw aborts the rest. |
| tRPC | `ingest.ingest` / `ingest.batch` | Same shapes as REST, plus `ingest.list`, `ingest.get`, `ingest.delete` for read/delete. |

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
7. **Pick the best extraction.** `preferExtraction()` ranks `success > partial > failed` and breaks ties by `contentText.length`. The winner is applied via `applyExtraction()`, which writes `author/title/contentText/metadata/sourceCreatedAt` onto the item, then **deletes and re-inserts** all comments for that item from the extraction.
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

When a Hacker News or Reddit ingest finds an off-site URL on the submission, the service ingests that URL **first** as a standalone article, then creates the discussion item with `subjectItemId` pointing at the article. One article, many possible discussions — the FK lives on the discussion side.

- **Off-site filter.** Each extractor filters before emitting `linkedUrls`. HN drops `news.ycombinator.com`. Reddit drops `reddit.com` / `www.reddit.com` / `old.reddit.com` / `redd.it` / `i.redd.it` / `v.redd.it` / `preview.redd.it`, and also skips self-posts (`post.is_self === true`). Only the first valid URL is used — discussions have at most one subject.
- **Two-phase flow inside `ingest()`.** The service runs `capture()` and `extract()` in memory first (no DB writes), then calls `ingestInternal({ skipLinkedUrls: true })` for the subject URL, then calls `ensureItem` for the discussion with `subjectItemId` already set, then persists snapshots and extractions.
- **Depth cap.** `skipLinkedUrls: true` is only set on the internal subject recursion, so the subject ingest cannot itself trigger a further subject ingest. Grandchildren can't happen, and the public `ingest()` method always kicks off a top-level call.
- **Subject-fetch failure isolation.** If the subject ingest throws, the discussion ingest still completes with `subjectItemId = null` and `metadata.subjectFetchError` set to the error message. Retry later by re-ingesting the discussion URL.
- **Last-writer-wins on update.** Re-ingesting a discussion updates its `subjectItemId` to whatever the current capture produces. `ensureItem` only writes `subjectItemId` during update when the new value is non-null, so a transient subject-fetch failure won't clobber an existing good link.
- **IngestResult shape.** Every successful ingest returns a `sourceItem` field — either the full nested `IngestResult` for the subject, or `null` for items without one (articles, tweets, self-posts).

## Markdown

Items carry two body fields: `contentText` (plain text for search) and `contentMarkdown` (the Obsidian-ready version).

- **Generic (`readability`)** — parses `Readability.content` (the article HTML) through Turndown with ATX headings, hyphen bullet markers, inlined links, and fenced code blocks. Stored on the item as `content_markdown`.
- **Hacker News (`hn_algolia_json`)** — `post.text` is HTML; we turndown it. Self-posts get markdown; link posts leave it null (the article is a separate item via `subjectItemId`).
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
- **Subject fetch failures don't get a retry queue.** They surface as `metadata.subjectFetchError` on the discussion; there's no scheduled retry — you have to re-ingest manually.
