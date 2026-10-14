---
name: e2e-in-workspace-since-bl146
description: e2e/ joined pnpm-workspace.yaml (BL-146); pnpm lint/typecheck now cover it like any package
metadata:
  type: project
---

**Superseded 2026-09-26 (branch `fb61-12`, FB-6.1.12):** `e2e/` is now listed
in `pnpm-workspace.yaml` (alongside `apps/*` and `packages/*`), has its own
`package.json` with `typecheck`/`lint` scripts and its own `e2e/tsconfig.json`.
`pnpm.cmd --filter @newfork/e2e typecheck` (bare `tsc --noEmit`) and
`pnpm.cmd --filter @newfork/e2e lint` (`eslint .`) both ran clean against the
existing specs plus two new ones, with no `.world.json` or live Supabase
needed — confirming these are proper static-only gates now, unlike before
BL-146.

**How to apply:** for an e2e-only change, `pnpm.cmd --filter @newfork/e2e
typecheck` and `pnpm.cmd --filter @newfork/e2e lint` are real, fast checks —
run them, don't skip to `playwright --list`. The old workaround (scratch
tsconfig, `--list` filtering, running eslint by hand outside the workspace) no
longer applies; keep `playwright test -c e2e/playwright.config.ts --list
<file-filter>` only as a second opinion when you want to confirm Playwright
itself parses a new spec.
