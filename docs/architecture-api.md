# API Architecture

This doc explains the current architecture of `apps/api` and how it relates to the shared `@repo/trpc` contract package.

## Responsibilities

### `apps/api`

- Owns the Fastify server runtime
- Owns Drizzle database setup
- Owns Fastify plugins for infra concerns
- Owns service construction and runtime-only business logic
- Owns plain REST endpoints such as `/healthz`

### `packages/trpc`

- Owns the client-safe tRPC contract
- Owns shared router shape, DTOs, middleware, and exported types
- Is the only package web/mobile should import tRPC types from

Frontend apps should not import from `apps/api`.

## Current Source Layout

```txt
apps/api/src/
  db/
    client.ts
    schema.ts
  lib/
    auth.ts
    config/env.ts
    event-bus.ts
    services.ts
  modules/
    health/
      dto.ts
      service.ts
    hello/
      dto.ts
      handler.ts
      service.ts
  plugins/
    auth.ts
    bus.ts
    db.ts
    trpc.ts
    websocket.ts
  types/
    fastify.ts
  index.ts
  server.ts
```

## Current Contract Layout

```txt
packages/trpc/src/
  context.ts
  lib/trpc/
    core.ts
    middlewares.ts
  modules/
    health/
      dto.ts
      router.ts
    hello/
      dto.ts
      router.ts
  routers/
    _app.ts
  index.ts
  trpc-types.ts
```

## Design Rules

### Modules own domain logic

Each API domain belongs under `apps/api/src/modules/<feature>/`.

Typical files:

- `dto.ts`
  - Input/output schemas and small domain types
- `service.ts`
  - Runtime logic and orchestration
- `handler.ts`
  - Optional event-bus listeners

### Plugins own infra concerns

Use Fastify plugins for infrastructure:

- database setup
- auth request decoration
- tRPC registration
- event bus registration
- websocket registration

Avoid putting domain logic in plugins.

### Services are explicit

Services are wired manually in [`apps/api/src/lib/services.ts`](/apps/api/src/lib/services.ts).

That is the current service registry/container shape:

- explicit dependencies
- no magic DI
- easy to inspect and refactor

### tRPC contract stays client-safe

Client-facing tRPC DTOs and router types live in `packages/trpc`.

That package can be consumed by:

- `apps/web`
- `apps/mobile`
- tests

It must not pull in server-only API runtime code.

### REST endpoints stay in the API app

Plain Fastify routes like `/healthz` belong in `apps/api`, not in `packages/trpc`.

## Auth Shape

Current auth flow:

- web/mobile sign in through Supabase
- they send the access token as `Authorization: Bearer <token>`
- the API verifies the JWT against Supabase JWKS
- Fastify request auth state is then available to tRPC procedures

Keep auth verification in `apps/api`. Do not move JWT verification into shared frontend packages.

## Event Bus Shape

The event bus exists as a lightweight pattern, not as a mandatory architecture for every feature.

Use it when:

- one domain needs to react to another without tight coupling
- side effects should be handled outside the request path

Do not force every feature through events if a direct service call is simpler and clearer.

## Websocket Shape

Websocket support is currently scaffolded and optional.

Treat it as:

- opt-in infrastructure
- not the default path for new features

## Import Rules

- Within `apps/api`, use relative imports.
- From other workspaces, import shared packages by workspace name.
- Frontends should import tRPC types from `@repo/trpc/types`.
- Avoid TypeScript path aliases for shared/cross-platform code.

## Testing

Current API tests live in [`apps/api/test/server.test.ts`](/apps/api/test/server.test.ts).

Use Fastify `inject()` tests for:

- REST endpoints
- boot/runtime wiring
- basic contract smoke tests

Prefer these over spinning up a real HTTP server in tests.
