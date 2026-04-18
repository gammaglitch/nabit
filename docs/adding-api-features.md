# Adding API Features

Use this flow when adding a new API domain.

## 1. Create the API module

Fast path:

```sh
bun run scaffold:feature <feature-name> --api --trpc
```

That creates the API module stubs, the tRPC contract stubs, updates the service registry, and mounts the new tRPC router.

See also: [`docs/scaffold-feature.md`](/docs/scaffold-feature.md)

Add a folder under:

```txt
apps/api/src/modules/<feature>/
```

Typical files:

- `dto.ts`
- `service.ts`
- optional `handler.ts`

If the feature owns database tables, update the Drizzle schema under `apps/api/src/db/`.

## 2. Create or extend the tRPC contract

Add the client-safe contract pieces under:

```txt
packages/trpc/src/modules/<feature>/
```

Typical files:

- `dto.ts`
- `router.ts`

Then mount the router in [`packages/trpc/src/routers/_app.ts`](/packages/trpc/src/routers/_app.ts).

## 3. Wire runtime services

Add the new service to [`apps/api/src/lib/services.ts`](/apps/api/src/lib/services.ts).

That file is the source of truth for service wiring.

## 4. Register runtime behavior

Depending on the feature, update:

- Fastify routes in `apps/api/src/server.ts`
- event handlers
- plugins only if infrastructure needs change

Do not put feature logic into plugins unless it is truly infra-level behavior.

## 5. Add tests

Start with:

- service tests if there is meaningful pure logic
- Fastify `inject()` tests for endpoints or boot wiring

## 6. Validate

Run:

1. `bun run check`
2. `bun run test`
3. `bun run verify`

## Rules To Keep

- Routers stay thin.
- Services own business logic.
- Shared tRPC contract stays in `packages/trpc`.
- Frontends never import from `apps/api`.
