# Scripts

This file only covers the parts that are not obvious from `package.json`.

## Important Root Commands

- `bun install`
  - Installs workspace dependencies and respects the 7-day minimum package age in [`bunfig.toml`](/bunfig.toml).
- `bun run check`
  - Fast correctness gate. In practice: diagnostic `lint + typecheck` across workspaces.
- `bun run style:check`
  - Runs the Biome style gate across workspaces: formatter and import sorting checks, without the linter.
- `bun run fix`
  - Applies safe Biome fixes across workspaces, including formatting and import sorting.
- `bun run test`
  - Runs all workspace tests.
- `bun run verify`
  - Fuller validation pass. In practice: `check` everywhere, plus the style gate, plus `build` where build is meaningful.
- `bun run scaffold:feature <feature-name>`
  - Scaffolds the default API + tRPC + mobile + web feature shape.
  - Use `--api --trpc`, `--mobile`, or `--web` to limit targets.
  - Use `--dry-run` to preview changes.
  - Full reference: [`docs/scaffold-feature.md`](/docs/scaffold-feature.md)

## What Is Not Obvious

- `check` is intentionally faster than `verify`.
- `check` does not enforce formatter or import sorting. Those now live behind `style:check` and `fix`.
- Mobile `verify` currently does not perform a native packaging build. It runs `check` plus the style gate.
- Mobile tests use Jest with `jest-expo`, not `bun test`.
- Shared packages use declaration-oriented `tsc` build/watch scripts.
- Root `format` still runs `biome format --write .` only. Use `fix` when you also want import sorting and other safe Biome fixes.

## When To Use What

- While iterating:
  - `bun run check`
- When you want Biome to rewrite style issues:
  - `bun run fix`
- If runtime behavior changed:
  - `bun run test`
- Before merging or releasing boilerplate changes:
  - `bun run verify`

## Workspace-Specific Notes

- `apps/api`
  - `db:generate` and `db:push` are Drizzle commands.
- `apps/desktop`
  - `dev` runs `tauri dev`.
  - `build` validates the frontend bundle with Vite, not full desktop packaging.
  - `tauri:build` is the explicit desktop packaging command.
- `apps/mobile`
  - `doctor` is an extra Expo diagnostic, not part of the default repo gate.
- `packages/auth`, `packages/shared`, `packages/trpc`
  - `dev` runs declaration-focused `tsc --watch`.

For anything else, read the relevant `package.json` directly.
