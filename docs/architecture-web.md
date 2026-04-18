# Web Architecture

This doc explains the current architecture of `apps/web`.

The current shape is a Next.js app that acts as a real client of the API, with browser-side tRPC querying as the default.

## Current Source Layout

```txt
apps/web/
  app/
    layout.tsx
    page.tsx
    auth/callback/page.tsx
  features/
    auth/
      components/
        AuthPanel.tsx
      hooks/
        use-auth-panel.ts
    hello/
      components/
        HelloPanel.tsx
      hooks/
        use-hello-panel.ts
    home/
      screens/
        HomePage.tsx
  components/
    ui/
      button.tsx
      card.tsx
      input.tsx
    providers.tsx
  hooks/
    use-browser-supabase-session.ts
  lib/
    supabase/
      auth.ts
      client.ts
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

- `features/auth`
- `features/hello`
- `features/home`

Keep route files thin and keep feature logic in these folders.

### `components/ui` is the shared web UI kit

Keep generic design-system-like components in `components/ui`.

Do not place route-specific panels there.

### `hooks/` is for cross-feature browser hooks

If a hook is used by more than one web feature, move it to `apps/web/hooks`.

Current example:

- `use-browser-supabase-session`

### `lib/trpc` owns client plumbing

Current responsibilities:

- browser tRPC client creation
- React Query integration
- server-only helper for special cases

Do not duplicate transport/header logic in route components.

### `lib/supabase` owns web auth client wiring

Current responsibilities:

- browser Supabase client
- auth helpers for web callback/session behavior

Keep web-specific auth behavior here, not in shared packages.

## Shared Package Boundaries

The web app may import from:

- `@repo/auth`
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
