# Adding Web Features

Use this flow when adding new web functionality.

## 1. Decide the right home

Use these rules:

- route file concerns
  - `app/`
- feature-specific UI and hooks
  - `features/<feature>/`
- generic UI primitives
  - `components/ui/`
- cross-feature browser hooks
  - `hooks/`
- transport/auth/client plumbing
  - `lib/`

The current default should be feature-first, not route-file-first.

Fast path:

```sh
bun run scaffold:feature <feature-name> --web
```

That creates a minimal web feature folder with `hooks/`, `components/`, and `screens/` stubs.

See also: [`docs/scaffold-feature.md`](/docs/scaffold-feature.md)

## 2. Keep App Router files light

Files under `app/` should mostly:

- define the route boundary
- assemble page components
- wire providers/layout

Avoid putting heavy API/auth logic directly in route files.

## 3. Create the feature folder

Add a folder under:

```txt
apps/web/features/<feature>/
```

Start with only the folders you need:

- `components/`
- `hooks/`
- `screens/`

## 4. Default to browser-side data fetching

Use browser-side tRPC querying by default.

Reach for server-side calls only when you specifically need:

- server-only access
- first-render data
- SEO/public rendering behavior

## 5. Use shared packages correctly

Web may import from:

- `@repo/auth`
- `@repo/shared`
- `@repo/trpc`

Do not import from `apps/api`.

## 6. Add tests

Default web tests should cover:

- client components
- UI state behavior
- small route-level render smoke tests

Current stack:

- Vitest
- Testing Library

## 7. Validate

Run:

1. `bun run check`
2. `bun run test`
3. `bun run verify`

## Rules To Keep

- Browser-side tRPC is the default.
- `components/ui` is for generic reusable primitives.
- `hooks/` is for cross-feature hooks, not feature-owned hooks.
- Keep auth and tRPC client plumbing centralized in `lib/`.
