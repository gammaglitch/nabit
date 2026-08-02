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

### Running the Discord bot

`apps/discord-bot` lets you queue captures from Discord with `/nab <url>` or
`!nab <url>`. It is an opt-in overlay, because without Discord credentials
the bot exits immediately — folding it into the base stack would crash-loop
every deployment that doesn't want it:

```bash
# fill in DISCORD_TOKEN and DISCORD_CLIENT_ID in .env
docker compose -f compose.yml -f compose.discord.yml up -d
```

The bot reaches the API at `http://api:3001` over the compose network, so it
publishes no ports and needs no reverse-proxy wiring. It authenticates with
the static `API_TOKEN` rather than a Supabase JWT, so **`API_TOKEN` must be
set** unless you override `NABIT_API_TOKEN` to point at another deployment.

Two things to know before inviting it to a server:

- **There is no authorization inside the bot.** Anyone who can see a channel
  the bot is in can queue ingests, all under the one shared `API_TOKEN`.
  Restrict it with Discord's own channel permissions until per-user
  authorization exists.
- **`!nab` needs the privileged Message Content intent**, enabled on the Bot
  tab of your application. The `/nab` slash command works without it.

You can still build the images manually from the repo root:

```bash
docker build -f docker/api.Dockerfile -t nabit-api .
docker build -f docker/discord-bot.Dockerfile -t nabit-discord-bot .
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

### Discord bot (`nabit-discord-bot`)

| Var | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | yes | Bot token from the Discord developer portal. The process exits at startup without it. |
| `DISCORD_CLIENT_ID` | yes | The application's Application ID, used to register slash commands. |
| `NABIT_API_URL` | yes | Base URL of the API, no trailing slash. Defaults to `http://api:3001` under `compose.discord.yml`. |
| `NABIT_API_TOKEN` | yes | Bearer token sent to `/ingest`. Must equal the API's `API_TOKEN`; the overlay defaults it to exactly that. |

### Database migrations

Run migrations against the API's `DATABASE_URL` (must be a direct, non-pooled
connection) before starting the API container:

```bash
cd apps/api
bun run db:push
```

## Agent-friendly docs

If you're reading this as or with an LLM coding agent, see
[`AGENTS.md`](./AGENTS.md) for an entry guide pointing to the right
architecture docs per task.
