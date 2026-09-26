---
name: e2e-not-in-typecheck-gate
description: e2e/ is outside pnpm-workspace.yaml, so pnpm lint/typecheck (turbo) never touch it
metadata:
  type: project
---

`e2e/` has its own `package.json` but `pnpm-workspace.yaml` only lists
`apps/*` and `packages/*` — turbo's `lint`/`typecheck` tasks never see e2e
files, and there is no `e2e/tsconfig.json`. Confirmed 2026-09-26: running
`tsc -p` against `e2e/**/*.ts` with a scratch tsconfig (extending
`tsconfig.base.json`, `typeRoots` pointed at `apps/api/node_modules/@types`
for node types) surfaces pre-existing errors in `e2e/playwright.config.ts`
(`noUncheckedIndexedAccess` turns the `localSupabase()` Record's property
reads into `string | undefined`) that predate any of my changes — so e2e was
never actually clean under strict mode, just never checked.

**Why:** a task's "Done when: typecheck temiz" cannot mean turbo's typecheck
for an e2e-only change — it does not run those files at all.

**How to apply:** for an e2e-only change, don't rely on `pnpm typecheck`
covering it. Validate with (a) `pnpm exec playwright test -c
e2e/playwright.config.ts --list <file-filter>` (catches import/syntax errors,
confirms Playwright parses the new spec), and (b) `node_modules/.bin/eslint`
run directly on the new file (root `eslint.config.mjs` has no project
restriction, so it lints any `**/*.{ts,tsx}` you point it at even outside the
workspace). A full unfiltered `--list` across all of `e2e/flows` will itself
fail with `ENOENT .world.json` whenever `e2e/global-setup.ts` hasn't run
(needs `db.lock` + a live local Supabase) — that failure is pre-existing and
unrelated to a new spec; filter `--list` to the new file to judge it alone.
