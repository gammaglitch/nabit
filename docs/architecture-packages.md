# Shared Package Architecture

This doc explains the purpose of the current packages under `packages/`.

## Current Packages

### `packages/trpc`

Purpose:

- own the client-safe tRPC contract
- export DTOs, router shape, context types, middleware, and type-only entrypoints

Important rules:

- frontend apps import tRPC types from `@repo/trpc/types`
- frontend apps must not import from `apps/api`
- keep this package free of server-runtime-only dependencies

### `packages/auth`

Purpose:

- own shared auth-domain helpers that are safe for both web and mobile

Current examples:

- callback parsing
- config validation helpers
- session/user mapping helpers

Important rules:

- keep it framework-agnostic where possible
- do not put web-only or mobile-only client setup here
- do not put API JWT verification here

### `packages/shared`

Purpose:

- own truly generic shared helpers that do not belong to a stronger domain package

Important rules:

- do not turn this into a junk drawer
- if logic is auth-specific, it belongs in `@repo/auth`
- if logic is API-contract-specific, it belongs in `@repo/trpc`

## Build and Watch Pattern

All current shared packages follow the same basic shape:

- `typecheck`
  - validate the package TypeScript source
- `build`
  - emit declarations via `tsconfig.build.json`
- `dev`
  - run declaration-focused `tsc --watch`

This makes shared package changes easy to validate in isolation and in the repo-wide pipeline.

## Import Rules

- Use relative imports within a package.
- Use workspace package names across workspace boundaries.
- Avoid TS path aliases for cross-platform shared code.

## When To Create A New Package

Create a new package only when there is a real boundary:

- a client-safe contract
- an auth domain
- a reusable cross-app module with clear ownership

Do not create packages for trivial reuse.

The goal is a small number of intentional packages, not dozens of tiny ones.
