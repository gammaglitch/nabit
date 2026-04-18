# Agent Entry Guide

This file exists to help an LLM or coding agent quickly load only the documentation that is relevant to the task at hand.

Do not ingest every file under `docs/` by default. Read the smallest useful set.

## Critical Commands

These are the only repo-level commands you should keep in working memory by default:

- `bun install`
  - Installs dependencies and respects the 7-day minimum package age rule.
- `bun run check`
  - Fast correctness gate: `lint + typecheck`.
- `bun run test`
  - Runs the repo test suite.
- `bun run verify`
  - Full validation pass: `check` plus meaningful builds.

Use workspace-local commands only when you are working in one workspace and do not need the full repo pipeline.

## Always Start Here

Read [`docs/scripts.md`](/docs/scripts.md) when the task involves:

- running or changing scripts
- validation steps
- CI-like checks
- deciding between `check`, `test`, `build`, or `verify`
- dependency installation or Bun workflow

## Read These By Task

### API work

Read:

1. [`docs/architecture-api.md`](/docs/architecture-api.md)
2. [`docs/adding-api-features.md`](/docs/adding-api-features.md) if adding or restructuring a feature
3. [`docs/scaffold-feature.md`](/docs/scaffold-feature.md) if you need the scaffold helper

Use for:

- Fastify changes
- plugins
- services
- REST endpoints
- auth verification in the API
- Drizzle setup
- event bus work
- tRPC runtime wiring

### Mobile work

Read:

1. [`docs/architecture-mobile.md`](/docs/architecture-mobile.md)
2. [`docs/adding-mobile-features.md`](/docs/adding-mobile-features.md) if adding or restructuring a feature
3. [`docs/scaffold-feature.md`](/docs/scaffold-feature.md) if you need the scaffold helper

Use for:

- Expo / React Native changes
- feature folder placement
- shared UI primitives
- mobile auth flows
- mobile tests
- service/config boundaries

### Desktop work

Read:

1. [`docs/architecture-desktop.md`](/docs/architecture-desktop.md)
2. [`docs/adding-desktop-features.md`](/docs/adding-desktop-features.md) if adding or restructuring a feature

Use for:

- Tauri frontend structure
- Rust/native bridge changes
- desktop shell decisions
- offline vs backend-integrated desktop features

### Web work

Read:

1. [`docs/architecture-web.md`](/docs/architecture-web.md)
2. [`docs/adding-web-features.md`](/docs/adding-web-features.md) if adding or restructuring a feature

Use for:

- Next.js routes/components
- browser-side tRPC usage
- web auth flows
- web testing

### Shared package work

Read:

1. [`docs/architecture-packages.md`](/docs/architecture-packages.md)
2. The app-specific architecture doc for the consumer you are changing

Use for:

- `@repo/auth`
- `@repo/shared`
- `@repo/trpc`
- package boundary questions
- deciding whether new code belongs in a package or an app

## Loading Strategy

- If the task is only about one app, read only that app’s architecture doc.
- If the task adds a feature, also read the matching `adding-*.md` doc.
- If the task changes shared code used by multiple apps, read `architecture-packages.md` first.
- If the task changes scripts or validation, read `docs/scripts.md` first.

## Important Repo Rules

- Let Bun resolve dependency versions. Do not write `latest`.
- Respect the 7-day package age rule from `bunfig.toml`.
- Frontend apps must not import from `apps/api`.
- Shared packages should remain intentional and few in number.
