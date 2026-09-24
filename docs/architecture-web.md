# Web Architecture

This doc explains the current architecture of `apps/web`.

The current shape is a Next.js app that acts as a real client of the API, with browser-side tRPC querying as the default.

## Current Source Layout

```txt
apps/web/
  app/
    layout.tsx
    page.tsx
    login/page.tsx
  features/
    items/
    reader/
    sites/
    ...
  components/
    ui/
      button.tsx
      card.tsx
      input.tsx
    auth-gate.tsx
    providers.tsx
  hooks/
    use-session.ts
  lib/
    auth/
      client.ts
      next-path.ts
      required.ts
      session-cookie.ts
      token.ts
    trpc/
      client.ts
      react.ts
      server.ts
    utils.ts
```

## Design Rules

### Browser-side querying is the default

The default web model is:

- browser-side tRPC calls
- React Query for client caching and request state

Use server-side tRPC calls only when there is a clear reason:

- first-render requirements
- SEO/public content
- secret-bearing server-only access

### App Router files stay thin

Keep files under `app/` light.

They should mostly:

- define route boundaries
- assemble page-level components
- mount providers/layouts

Avoid embedding heavy business logic directly in route files.

### Features own route-level UI and logic

The web app now follows the same general feature-first direction as mobile.

Use:

- `features/<feature>/components`
- `features/<feature>/hooks`
- `features/<feature>/screens`

Current examples:

- `features/items`
- `features/reader`
- `features/sites`

Keep route files thin and keep feature logic in these folders.

### `components/ui` is the shared web UI kit

Keep generic design-system-like components in `components/ui`.

Do not place route-specific panels there.

### `hooks/` is for cross-feature browser hooks

If a hook is used by more than one web feature, move it to `apps/web/hooks`.

Current example:

- `use-session`

### `lib/trpc` owns client plumbing

Current responsibilities:

- browser tRPC client creation
- React Query integration
- server-only helper for special cases

Do not duplicate transport/header logic in route components.

### `lib/auth` owns web auth client wiring

Current responsibilities:

- the Better Auth client, talking to the API's `/api/auth` routes (`client.ts`)
- the session token in localStorage, read by every call that sends `Authorization: Bearer` (`token.ts`)
- the `nf-session` marker cookie that tells `proxy.ts` a session exists (`session-cookie.ts`)
- where to return after sign-in (`next-path.ts`) and whether the gate is on at all (`required.ts`)

Keep web-specific auth behavior here, not in shared packages.

## Shared Package Boundaries

The web app may import from:

- `@repo/shared`
- `@repo/trpc`

Do not import from `apps/api`.

## Testing

Current web tests live in [`apps/web/test/page.test.tsx`](/apps/web/test/page.test.tsx).

Testing defaults:

- Vitest
- Testing Library

Use them for:

- client components
- pure UI logic
- small route-level render smoke tests

For heavier browser/user-flow validation, add E2E later rather than overloading unit tests.
