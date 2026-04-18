# Architecture Specification — Content Archival & Extraction System

**Version:** 0.1.0 (MVP)
**Last updated:** 2026-04-04

---

## 1. Overview

A personal content archival system that captures and extracts structured content from web sources. The system follows a two-stage pipeline — **capture** (faithful snapshot) → **extract** (structured content) — treating these as independent, retriable concerns.

### Core Principles

- **Raw data is sacred.** Always store the original payload verbatim before any extraction. Extraction logic will improve; raw data lets you reprocess.
- **Detect, don't configure.** The ingestion endpoint auto-detects the source type from the URL and routes to the appropriate ingestor.
- **Don't abstract prematurely.** Build concrete implementations for 3+ sources before extracting a shared plugin interface.
- **Schema extends cheaply.** Prefer adding new tables over overloading existing columns.

---

## 2. Tech Stack

| Layer              | Technology                     |
| ------------------ | ------------------------------ |
| Application        | Next.js + tRPC                 |
| Database           | PostgreSQL (JSONB, ltree, GIN) |
| Article extraction | @mozilla/readability + JSDOM   |
| Headless browser   | Containerized service (Playwright or Puppeteer) |
| Ingestion clients  | Tampermonkey script (X/Twitter), browser extension (bookmarks/tabs) |

---

## 3. System Architecture

```
Tampermonkey / Browser Extension
        │
        ▼
   Next.js + tRPC
   (single ingest endpoint)
        │
        ├── URL matcher chain (first match wins)
        │     ├── x.com/*/status/*         → Tweet ingestor
        │     ├── reddit.com/r/*/comments  → Reddit ingestor
        │     ├── news.ycombinator.com     → HN ingestor
        │     ├── (future ingestors)
        │     └── *                        → Generic ingestor
        │
        ├── Direct extraction path
        │     (tweet JSON, Reddit .json API, HN Algolia API)
        │
        └── Browser-assisted path (generic URLs)
              ├── Try simple HTTP GET + Readability first
              ├── If fails → call headless browser service
              └── Retry Readability on rendered HTML
```

### 3.1 Microservice Boundary

Only one component is separated into its own service: the **headless browser**.

**Justification:**
- Resource-heavy, crash-prone, and security-sensitive (executes arbitrary web pages)
- Different scaling profile — queue many URLs, limit concurrent browser instances
- Heavy dependencies (browser binary, fonts, display libs) that bloat any image
- Most likely component to hang, OOM, or get stuck — must not take down the main app

**API contract:**

```
POST /capture
{
    "url": "https://example.com/article",
    "modes": ["html", "screenshot", "mhtml"]
}

→ Returns raw artifacts per requested mode
```

**Everything else runs in the Next.js application process**, including article extraction via @mozilla/readability.

### 3.2 Ingestor Resolution

The ingest endpoint receives a URL and an optional raw payload, then routes to the correct ingestor.

```
POST /ingest

{
    "url": "https://x.com/someone/status/123456",
    "payload": { ... },       // optional, e.g. from Tampermonkey intercept
    "ingestor": null           // auto-detect (default), or force: "tweet", "reddit", etc.
}
```

Resolution logic:

1. If `ingestor` is explicitly provided, use that ingestor.
2. Otherwise, run the URL through a matcher chain (first match wins).
3. If no matcher hits, fall back to the generic ingestor.

```python
# Conceptual (implementation will be in TypeScript)
INGESTORS = [
    (r"https?://(x|twitter)\.com/.+/status/\d+", TweetIngestor),
    (r"https?://(old\.|www\.)?reddit\.com/r/.+/comments/", RedditIngestor),
    (r"https?://news\.ycombinator\.com/item\?id=\d+", HNIngestor),
]
```

**URL normalization** must happen before matching: follow redirects, strip tracking parameters (UTM, fbclid, etc.), canonicalize domains. This is an explicit pre-processing step, not something each matcher regex handles.

### 3.3 Ingestor Interface

Each ingestor implements two methods:

- **`capture(url, payload?)`** → Returns the raw snapshot(s). For sources where the payload is provided by the client (e.g. Tampermonkey), this is essentially a pass-through. For generic sources, this fetches the page.
- **`extract(snapshot)`** → Returns a structured item (and optionally comments). Extraction is always performed on a stored snapshot, never directly on a live source.

### 3.4 Generic Ingestor Flow

For URLs with no specialized ingestor:

1. Attempt a plain HTTP GET.
2. Pass the HTML to `@mozilla/readability` via JSDOM.
3. If Readability returns a usable result → store as item.
4. If Readability fails or the page requires JavaScript rendering → call the headless browser service.
5. Retry Readability on the browser-rendered HTML.
6. Store the raw HTML snapshot regardless of extraction outcome.

Most web pages do not need a headless browser. Simple fetch + Readability handles the majority of blogs and news sites in sub-second time. The browser path is the expensive fallback (2–10 seconds), not the default.

---

## 4. Database Schema

**Requires:** PostgreSQL with `ltree` extension.

### 4.1 Items

The central entity representing any piece of captured content.

```sql
CREATE TABLE items (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_type       TEXT NOT NULL,              -- 'tweet', 'webpage', 'article', 'reddit_post', ...
    source_url        TEXT,                       -- canonical URL (nullable for edge cases)
    external_id       TEXT,                       -- platform's native ID, for dedup
    author            TEXT,
    title             TEXT,                       -- null for tweets, useful for articles
    content_text      TEXT,                       -- extracted plain text
    source_created_at TIMESTAMPTZ,               -- when the original was published
    ingested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata          JSONB NOT NULL DEFAULT '{}', -- structured extras, varies by source type

    UNIQUE (source_type, external_id)
);

-- Full-text search (generated column)
ALTER TABLE items ADD COLUMN fts tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english',
            coalesce(title, '') || ' ' || coalesce(content_text, '')
        )
    ) STORED;

CREATE INDEX idx_items_source_type  ON items (source_type);
CREATE INDEX idx_items_ingested_at  ON items (ingested_at);
CREATE INDEX idx_items_metadata     ON items USING gin (metadata);
CREATE INDEX idx_items_fts          ON items USING gin (fts);
```

**Design notes:**
- `external_id` + `source_type` is the uniqueness constraint (not `source_url`), because URLs can shift in form while platform IDs are stable.
- `metadata` as JSONB avoids adding a column for every field across every source type. For tweets: like_count, retweet_count, media URLs, quoted_tweet_id, thread info. For articles: og:image, site_name, word_count, etc. GIN index enables efficient queries into JSONB.

### 4.2 Raw Snapshots

Verbatim copies of the captured content. Separated from items because:
- One item may have multiple snapshots (re-captures over time, different formats).
- Snapshots can be large (full HTML pages) and shouldn't be loaded on every item query.

```sql
CREATE TABLE raw_snapshots (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id      BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,              -- 'application/json', 'text/html', 'image/png', ...
    body         TEXT NOT NULL,              -- raw payload
    captured_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_raw_snapshots_item_id ON raw_snapshots (item_id);
```

**Limitation:** `body` is `TEXT`, which works for JSON and HTML but not binary content (screenshots, PDFs, MHTML). If binary storage is needed later, migrate to `BYTEA` or external file storage. For MVP, `TEXT` is sufficient.

### 4.3 Extractions

Tracks which extractor processed which snapshot, enabling re-extraction when extractors improve.

```sql
CREATE TABLE extractions (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    snapshot_id       BIGINT NOT NULL REFERENCES raw_snapshots(id),
    item_id           BIGINT REFERENCES items(id), -- null if extraction failed
    extractor         TEXT NOT NULL,                -- 'readability', 'tweet_json_v1', 'reddit_json', ...
    extractor_version TEXT,                         -- semver or commit hash
    status            TEXT NOT NULL DEFAULT 'success', -- 'success', 'partial', 'failed'
    error_message     TEXT,
    extracted_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Key benefit:** When Readability improves or a better extractor is written, query `WHERE extractor_version < X` and reprocess. Raw data is never lost.

### 4.4 Comments

Hierarchical comments linked to an item. Uses PostgreSQL's `ltree` extension for tree storage.

```sql
CREATE EXTENSION IF NOT EXISTS ltree;

CREATE TABLE comments (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id            BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    external_id        TEXT,                       -- platform's comment ID
    parent_external_id TEXT,                       -- used during import to reconstruct tree
    path               LTREE NOT NULL,             -- e.g. '0001.0003.0012'
    author             TEXT,
    content_text       TEXT NOT NULL,
    source_created_at  TIMESTAMPTZ,
    metadata           JSONB NOT NULL DEFAULT '{}', -- score, upvotes, flair, etc.

    UNIQUE (item_id, external_id)
);

-- Full-text search on comments
ALTER TABLE comments ADD COLUMN fts tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(content_text, ''))
    ) STORED;

CREATE INDEX idx_comments_item_id ON comments (item_id);
CREATE INDEX idx_comments_path    ON comments USING gist (path);
CREATE INDEX idx_comments_fts     ON comments USING gin (fts);
```

**Design notes:**
- `ltree` was chosen over adjacency list, materialized path (TEXT), or closure table because the data is write-once/read-many (archived content is immutable) and `ltree` provides native GiST-indexed subtree queries.
- `parent_external_id` is kept for tree reconstruction during import. Reddit, HN, and X all provide parent IDs in their native formats; the extractor maps these into `ltree` paths.
- Each platform's extractor is responsible for converting platform hierarchy into `ltree` paths.
- **Edge case:** Deleted/removed comments that are still referenced as parents. Extractors should insert placeholder nodes to maintain path integrity.

### 4.5 Tags

Minimal tagging system. Both items and comments are taggable independently — a valuable comment may deserve its own tags regardless of the parent post.

```sql
CREATE TABLE tags (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE item_tags (
    item_id BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id  BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, tag_id)
);

CREATE TABLE comment_tags (
    comment_id BIGINT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    tag_id     BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (comment_id, tag_id)
);
```

**Deliberately omitted for MVP:** tag hierarchies, tag types/namespaces, collections, projects, saved searches, annotation layers. These should be designed after 2–3 weeks of real usage to avoid building the wrong abstraction. Full-text search on items and comments may cover 80% of retrieval needs that tags would otherwise serve.

Two separate join tables (item_tags, comment_tags) are preferred over a polymorphic taggings table because PostgreSQL enforces referential integrity via foreign keys. A third taggable entity type means a third join table, which is trivial.

---

## 5. Entity Relationship Diagram

```
┌──────────┐       ┌────────────────┐       ┌──────────────┐
│   items   │──1:N──│ raw_snapshots  │──1:N──│ extractions  │
│           │       │                │       │              │
│           │       └────────────────┘       └──────────────┘
│           │
│           │──1:N──┌──────────────┐
│           │       │   comments   │
│           │       │  (ltree)     │
│           │       └──────┬───────┘
│           │              │
│           │              │──N:M──┐
│           │              │       │
│           │──N:M──┌──────┴───┐   │
│           │       │   tags   │───┘
└───────────┘       └──────────┘
                (via item_tags and comment_tags)
```

---

## 6. Source-Specific Notes

### 6.1 X/Twitter
- **Capture:** Tampermonkey script intercepts XHR responses in the browser and sends the raw JSON payload to the ingest endpoint. No HTTP fetch needed — the payload arrives with the request.
- **Extract:** Parse the tweet JSON structure directly. Map fields to `items` columns; store engagement metrics, media URLs, quoted tweet info, etc. in `metadata`.

### 6.2 Reddit
- **Capture:** Append `.json` to any Reddit URL to get the JSON API response. No authentication required.
- **Extract:** Post becomes an `item`. Comments are parsed from the nested JSON tree and flattened into the `comments` table with `ltree` paths.

### 6.3 Hacker News
- **Capture:** HN Algolia API: `https://hn.algolia.com/api/v1/items/{id}` returns the full comment tree.
- **Extract:** Same pattern as Reddit — post is an `item`, comments are flattened into `comments` with `ltree` paths.

### 6.4 Generic Web Pages (articles, blog posts)
- **Capture:** HTTP GET first. If the page requires JavaScript rendering, fall back to headless browser service.
- **Extract:** `@mozilla/readability` via JSDOM. Extracts title, author, content, excerpt, and date. Store raw HTML snapshot regardless of extraction success.

---

## 7. Future Considerations (Not in MVP)

These are known future needs that the current schema can accommodate without breaking changes:

| Feature | Likely approach |
| --- | --- |
| Media storage (images, videos) | New `media` table with file paths, linked to items |
| Item-to-item relationships (quote tweets, threads) | Self-referential FK on `items` or a separate `item_edges` table |
| Collections / research projects | New `collections` table with N:M join to items — design after real usage patterns emerge |
| Tag hierarchies | `ltree` on `tags.path` or parent_id on tags — only if flat tags prove insufficient |
| Binary snapshots (screenshots, PDFs) | Migrate `raw_snapshots.body` to `BYTEA` or external file storage |
| Python extraction service (trafilatura) | New Docker container with REST API — `extractions` table already supports multiple extractors |
| Additional ingestors (GitHub, YouTube, etc.) | Add to matcher chain and implement capture + extract methods |

---

## 8. Open Questions

- **Rate limiting on the headless browser service:** How many concurrent captures? Queue strategy?
- **Deduplication strategy for generic URLs:** Same article syndicated across multiple domains — detect via content hash?
- **Retention policy for raw snapshots:** Keep forever, or prune after N days if extraction succeeded?
- **Search scope:** When searching across items and comments, should results be unified or separate?