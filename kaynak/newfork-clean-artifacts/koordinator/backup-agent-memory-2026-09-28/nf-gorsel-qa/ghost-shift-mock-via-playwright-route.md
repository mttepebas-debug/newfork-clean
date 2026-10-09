---
name: ghost-shift-mock-via-playwright-route
description: How to fabricate ghost/out-of-scope shift data for Schedule screen QA when the local fixture has none, and how to launch a Playwright script standalone in this repo
metadata:
  type: reference
---

Schedule read model comes from `GET /schedule/reference?date=...&view=week` (`apps/web/src/schedule/schedule-data.ts:210`). The frontend computes ghosts itself in `apps/web/src/schedule/hooks/useCellState.ts:49` (`buildScheduleCellState`): any real (or `ghost_shifts`-listed) shift for an employee auto-creates a ghost placeholder in every OTHER location the schedule model lists — you do not need to fabricate a fake `ghost_shifts` entry to see a ghost card. Just add one real shift (`data.shifts.push({...})`) for an employee whose `location_ids` covers ≥2 locations already in the model's `locations` array, and ghosts appear automatically in the other location columns/cells.

The `model.ghost_shifts` field (`scheduleGhostShiftSchema`) is ONLY for a location that is *not* in `model.locations` at all (line 78-80: `.filter(ghost => !gridLocationIds.has(ghost.location_id))`). Since an owner/full-scope account has every location in `model.locations`, mocking `ghost_shifts` with a real location id does nothing — it gets filtered out. To test the true out-of-scope path you need a location id that genuinely isn't in the response's `locations` list.

**To reproduce without touching the DB**: use a standalone Playwright script (not `pnpm e2e`, that needs its own DB-locked fixture world) with `context.route('**/schedule/reference*', ...)` intercepting and mutating the JSON response, same technique the task briefs call "page.route". Notes for running one in this repo:
- `playwright` (not `@playwright/test`) is only in the pnpm virtual store, not hoisted to a normal `node_modules/playwright`. Import it via `file:///.../node_modules/.pnpm/playwright@<ver>/node_modules/playwright/index.mjs`.
- `chromium.launch()` with no args fails (missing headless-shell binary not installed for this pnpm-managed playwright version). Use `channel: 'chrome'` to reuse the real installed Chrome, same as `e2e/playwright.config.ts:71`.
- Reusing a live browser tab's `sb-127-auth-token` localStorage value in a fresh Playwright context does NOT work here — the app failed to bootstrap the workspace ("That workspace didn't load") even though "Signed in" showed. Just log in fresh instead: local owner is `owner@newfork.test` / `newfork-local` (`supabase/seed.sql:22-23`), via the real `/login` form.
- `page.locator(...).tap()` needs `hasTouch` context option; use `.click()` on a small mobile viewport instead — it's equivalent for a11y/visual QA purposes.

Related: [[vite-stale-dep-cache-gates-missing]].

**BL-186 availability corner icon**: `GhostShiftCard` (apps/web/src/schedule/components/ShiftCard.tsx) hardcodes `data-has-markers={false}` and never renders the `.schedule-shift-badge-markers` span at all — so an auto-ghost of a shift with `warning_codes:["availability"]` can never show the amber corner icon and can never collide with it. Confirmed from source, 2026-09-26, no live repro needed.
