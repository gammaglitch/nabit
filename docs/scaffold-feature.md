# Feature Scaffold Helper

Use this helper to generate the repetitive starter files for a new feature.

## Command

```sh
bun run scaffold:feature <feature-name> [--api --trpc] [--mobile] [--web] [--dry-run]
```

## Default Behavior

If you do not pass target flags, it scaffolds:

- `api`
- `trpc`
- `mobile`
- `web`

## Valid Target Modes

- `--api --trpc`
  - scaffold backend module plus shared tRPC contract together
- `--mobile`
  - scaffold a mobile feature only
- `--web`
  - scaffold a web feature only
- `--dry-run`
  - preview changes without writing files

`api` and `trpc` must be generated together in this repo.

## What It Creates

### API

- `apps/api/src/modules/<feature>/dto.ts`
- `apps/api/src/modules/<feature>/service.ts`
- updates `apps/api/src/lib/services.ts`

### tRPC

- `packages/trpc/src/modules/<feature>/dto.ts`
- `packages/trpc/src/modules/<feature>/router.ts`
- updates `packages/trpc/src/context.ts`
- updates `packages/trpc/src/routers/_app.ts`

### Mobile

- `apps/mobile/src/features/<feature>/hooks/use<Feature>.ts`
- `apps/mobile/src/features/<feature>/components/<Feature>Section.tsx`
- `apps/mobile/src/features/<feature>/screens/<Feature>Screen.tsx`

### Web

- `apps/web/features/<feature>/hooks/use-<feature>.ts`
- `apps/web/features/<feature>/components/<Feature>Section.tsx`
- `apps/web/features/<feature>/screens/<Feature>Page.tsx`

## Examples

```sh
bun run scaffold:feature user-profile
bun run scaffold:feature user-profile --api --trpc
bun run scaffold:feature user-profile --mobile
bun run scaffold:feature user-profile --web
bun run scaffold:feature user-profile --dry-run
```

## Limitations

- It creates placeholders, not finished feature logic.
- It does not add tests automatically.
- It does not wire new mobile screens into the current app flow.
- It does not wire new web pages into the current app router.

## Recommended Follow-up

1. Replace placeholder DTOs and service logic.
2. Add tests.
3. Wire the feature into the app where needed.
4. Run `bun run check`.
5. Run `bun run test`.
