<p align="center">
  <img src="./apps/web/public/logo/mark.png" width="140" alt="nabit" />
</p>

<h1 align="center">Nabit</h1>

<p align="center"><em>just nab it.</em></p>

Content archival and retrieval app. Captures, stores, and organizes content
from across the web — articles, Hacker News threads, Reddit threads, tweets.

## Features

- **Full-fidelity captures.** Articles, HN threads, and Reddit threads are
  stored end-to-end — article body, original post, full threaded comment
  tree — and kept verbatim even if the source later edits, deletes, or
  paywalls.
- **Passive X/Twitter bookmark sync.** A Tampermonkey userscript
  ([`scripts/tampermonkey/x-bookmarks-exporter.user.js`](./scripts/tampermonkey/x-bookmarks-exporter.user.js))
  intercepts X's own bookmark API responses while you scroll through
  your bookmarks and forwards them to the ingest endpoint in batches.
  No polling, no API key, no "export your data" ritual.
- **Bulk Hacker News favorites import.** The browser extension takes your
  HN username, walks every page of `favorites?id=<you>` — submissions or
  comments — and queues each thread. Re-run it whenever: items are keyed by
  their HN id, so a repeat import refreshes the existing archive rather than
  duplicating it. Since each favorite is queued as its HN thread, the
  ingestor archives the discussion *and*, where the submission links
  off-site, the article it points at, filed as the thread's child. Give the
  import a tag and everything it queues — threads and their articles — lands
  under it.
- **Purpose-built ingestors per source.** HN, Reddit, and tweet
  extractors pull structured metadata (points, score, subreddit, author,
  timestamps) plus the full comment tree — not just the raw HTML
  fallback most archivers settle for. Articles fall through to a
  Readability-based extractor.
- **Search-first brutalist UI.** Dense list + split-view triage with
  keyboard navigation, tags, and a ⌘K capture command from anywhere.

## Roadmap

Rough sketch of what's on deck. Not committed, not ordered.

- ~~**Queue-mode ingestion.** Submit a URL and forget it. A background
  worker drains the queue, so slow extractors don't block the caller.~~
- **Ingest by email.** Forward or BCC a message to a dedicated address
  and any URLs inside get nabbed. Useful for newsletters, share sheets
  on devices without the extension, and mail-based workflows.
- **TL;DR mode.** Optional LLM-generated summaries per item.
- **Obsidian plugin.** One-way sync from nabit into an Obsidian vault.
- **Browser extension, act II.** Figure out what the extension should
  actually be.

## Stack

- **API**: Fastify + tRPC + Drizzle ORM (Bun runtime)
- **Web**: Next.js + React 19 + Tailwind CSS v4
- **Database**: PostgreSQL (with `ltree` + `tsvector`)
- **Auth**: Supabase JWT

## Local development

```bash
bun install
# copy apps/api/.env.example → apps/api/.env and fill in values
# copy apps/web/.env.example → apps/web/.env and fill in values
bun run dev
```

`bun run dev` starts every workspace, the Discord bot and the extension
included. For just the two you need to click around the library:

```bash
bun run dev:web
```

Web comes up on `http://127.0.0.1:3002`, the API on `http://127.0.0.1:3001`.
Neither starts the ingest worker, so captures queue but are not processed —
run `bun run start:worker` in `apps/api` alongside it, or use the Docker stack
below.

Useful scripts (run from the repo root):

- `bun run check` — lint + typecheck
- `bun run test` — test suite
- `bun run verify` — full validation: check + builds

## Running in Docker

For a local, one-command stack:

```bash
cp .env.example .env
# fill in the Supabase values in .env
docker compose up --build
```

This starts:

- `db` on local Postgres
- `api` on `http://127.0.0.1:3001`
- `ingest-worker` for background captures
- `web` on `http://127.0.0.1:3000`

If you want to use a hosted Postgres instance instead of the local `db`
container, set `DATABASE_URL` in `.env` and use:

```bash
docker compose -f compose.yml -f compose.hosted-db.yml up --build
```

### Routing ingest traffic through a VPN

The ingest worker fetches arbitrary third-party pages (reddit, Hacker News,
and anything the `generic` readability ingestor is handed). To make those
requests exit through a VPN instead of your server's own IP, add the
Gluetun overlay:

```bash
# fill in the VPN_* values in .env
docker compose -f compose.yml -f compose.vpn.yml up -d
```

This puts `ingest-worker` inside Gluetun's network namespace, so its
traffic either goes through the tunnel or is dropped — if the tunnel dies,
the worker loses connectivity rather than silently falling back to your
real IP. `api`, `web`, and `db` are untouched, so published ports and any
reverse proxy in front of the stack keep working.

Three caveats worth knowing:

- **Gluetun is an egress tunnel, not a reverse proxy.** It cannot accept
  inbound traffic for your domains; this overlay only changes where the
  worker's *outbound* requests come from.
- **DNS lookups are not tunneled.** Docker forbids `dns:` and
  `extra_hosts:` on a container that shares another's network namespace,
  so the worker keeps Docker's embedded resolver in order to resolve `db`.
  Sites the worker scrapes still see the VPN's exit IP; your host's
  resolver still sees which hostnames were looked up.
- **Some sites block shared VPN exits.** Commercial VPN IPs are shared, so
  targets like `web.archive.org` may answer `429` where your own IP works
  fine. Pin `VPN_SERVER_COUNTRIES` to an exit that your sources tolerate.

You can still build the images manually from the repo root:

```bash
docker build -f docker/api.Dockerfile -t nabit-api .
docker build \
  -f docker/web.Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:3001/trpc \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key \
  --build-arg NEXT_PUBLIC_AUTH_REQUIRED=true \
  -t nabit-web .
```

## Environment variables

### API (`nabit-api`)

| Var | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. Use a direct (non-pooled) URL for migrations; the running API can use either. |
| `HOST` | no | Bind host, defaults to `0.0.0.0`. |
| `PORT` | no | Bind port, defaults to `3001`. |
| `SUPABASE_URL` | yes | Supabase project URL. |
| `SUPABASE_JWT_AUDIENCE` | no | Defaults to `authenticated`. |
| `SUPABASE_JWT_ISSUER` | no | Override if your Supabase instance uses a non-standard issuer. |
| `SUPABASE_JWKS_URL` | no | Override if you host your own JWKS. |
| `ALLOWED_EMAILS` | when auth required | Comma-separated list of emails permitted to sign in. Ignored when `AUTH_REQUIRED=false`. |
| `API_TOKEN` | no | Static bearer token for browser-extension / automation calls that don't carry a Supabase JWT. |
| `AUTH_REQUIRED` | no | Set to `false` to run single-user: the API skips JWT verification and treats every request as an admin. Only safe behind a trusted network boundary (localhost, VPN, Tailscale). Defaults to `true`. Pair with `NEXT_PUBLIC_AUTH_REQUIRED=false` on the web. |
| `OPENROUTER_API_KEY` | no | Enables the reader's **Ask** panel, which streams answers about the open article from an LLM. Leave unset to keep the feature off — `POST /chat` then returns 503 and the rest of the API is unaffected. |
| `OPENROUTER_MODEL` | no | OpenRouter model slug used by the Ask panel. Defaults to `anthropic/claude-sonnet-5`. See [openrouter.ai/models](https://openrouter.ai/models). |

### Web (`nabit-web`)

Web env vars are baked into the client bundle at **build time**, not runtime.
Pass them as `--build-arg` when building the Docker image (or as environment
variables to `next build` if you're building without Docker).

| Var | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | Public tRPC endpoint, e.g. `https://api.example.com/trpc`. |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anonymous key. |
| `NEXT_PUBLIC_AUTH_REQUIRED` | no | Set to `false` to skip the sign-in gate. Must match the API's `AUTH_REQUIRED`. Defaults to `true`. |

### Database migrations

Run migrations against the API's `DATABASE_URL` (must be a direct, non-pooled
connection) before starting the API container:

```bash
cd apps/api
bun run db:push
```

## Known issues

### The Docker image build is broken on the current `oven/bun` tag

`docker/api.Dockerfile` uses `FROM oven/bun:1-alpine`. That floating tag now
resolves to **Bun 1.4.2**, while the repo declares `packageManager: bun@1.3.10`.
Bun 1.4 switched to isolated (pnpm-style) installs and leaves dangling workspace
symlinks here — the link and the store disagree on the peer hash:

```
/app/apps/api/node_modules/drizzle-orm
  -> ../../../node_modules/.bun/drizzle-orm@0.45.1+af9538742efbc90b/...   (missing)
actual store entry:
     /app/node_modules/.bun/drizzle-orm@0.45.1+e7873dd7fba7ff2f
```

`api` and `ingest-worker` then crash-loop on `Cannot find module
'drizzle-orm/postgres-js'`. It survives `--no-cache`, so it is not stale layers.
**This blocks `docker compose up` and any deploy that rebuilds the image.**

Pinning the base image to the declared version (`FROM oven/bun:1.3.10-alpine`)
fixes it and has been verified; staying on latest Bun would instead need
`bun install --linker=hoisted`. Neither is committed yet.

Running the API and worker on the host against only the `db` container sidesteps
it entirely, which is the faster loop for development anyway:

```bash
docker compose up -d db
export DATABASE_URL=postgresql://nabit:$POSTGRES_PASSWORD@127.0.0.1:5432/nabit
cd apps/api && bun src/index.ts     # API
cd apps/api && bun src/worker.ts    # ingest worker
```

### Reddit can only be archived through the browser extension

Reddit answers `.json` with a `403` "blocked by network security" page for every
unauthenticated client. This is **not** a datacenter-IP block — a residential
connection gets the same response, so `compose.vpn.yml` does not help — and
`robots.txt` is now `Disallow: /` for all agents. Self-service API signup also
closed in November 2025 behind Reddit's Responsible Builder Policy, so an OAuth
client cannot simply be registered.

The browser extension captures threads from the user's own logged-in session
instead. Everything else that ingests a reddit URL — the web UI, the Discord
bot, REST clients, bookmark and HN-favorite imports, and the linked-item
recursion under an HN thread — still takes the server path and still fails.
See [Browser-captured reddit
threads](/docs/features/ingest.md#browser-captured-reddit-threads).

### Reddit threads capture fewer comments than reddit reports

Reddit truncates comment trees with `more` placeholders, and those branches are
dropped. Measured: a thread reporting 627 comments stored 486, with 138 behind
stubs. Nothing is lost between snapshot and database — reddit never sends the
rest — and the official API behaves identically. See [Known
gaps](/docs/features/ingest.md#known-gaps) for the numbers and the two possible
fixes.

### `.env` backups are not gitignored

`.gitignore` covers `.env`, `.env.local` and `.env.*.local`, but not names like
`.env.staging.bak`. Since these files carry `API_TOKEN` and
`WXT_API_TOKEN`, a copy made for safekeeping is one `git add -A` away from being
committed. Keep backups outside the repo.

## Agent-friendly docs

If you're reading this as or with an LLM coding agent, see
[`AGENTS.md`](./AGENTS.md) for an entry guide pointing to the right
architecture docs per task.
