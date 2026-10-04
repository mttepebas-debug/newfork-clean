---
name: schedule-edit-mode-qa-traps
description: How to reach Schedule edit mode in a world account for QA, and the resume-session trap that silently opens the wrong draft
metadata:
  type: reference
---

World accounts (`e2e<ts>.ayse.<hash>@world.test` manager, `.ali.` employee) sign in with the password grant (`world-pass-2026`, `e2e/global-setup.ts`), then open `/sign-in#access_token=...&expires_in&expires_at&token_type=bearer&type=magiclink` and reload. Playwright: `playwright-core` from `C:/Users/TheWe/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.mjs`, `channel:"chrome"`.

Edit mode has no URL shortcut: Schedule -> `New Schedule` -> pencil button `Edit <draft name>` (aria-label). Add shift: hover the cell, click `[data-schedule-add-shift-control]`. Time inputs are masked text: click, Ctrl+A, type `0600PM`.

**Trap (2026-10-04):** an *active* edit session of the same user is resumed by any later "Edit <other draft>" click, so the grid shows the OLD draft (the toolbar draft label tells you). Every page load re-extends `expires_at` (+~4 min). Release it only from inside edit mode: strip `Discard` (one click, no confirm; the app then jumps to the current week). A crashed script leaves the session behind. Always `Discard` in a `finally`.

Phone (375): the grid scrolls horizontally under a sticky 200px name column; a tap near the left lands on the employee name (opens the profile drawer). Scroll the target cell to x~212 first and tap near its right edge.

Read-model injection for red time off: `schedule/reference` response, `employees[].weekly_availability[].leave_intervals` (UTC `start_at/end_at`) plus `days[].has_unavailable`; guard for other weeks where the employee may be absent.
