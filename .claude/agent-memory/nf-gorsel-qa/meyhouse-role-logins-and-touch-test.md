---
name: meyhouse-role-logins-and-touch-test
description: Meyhouse workspace has owner + test.manager/test.employee/test.admin magic-link logins, but the manager does not see Main Dining (Alex/Jordan); phone tips need a real touch test (hasTouch + tap), mouse at 390px proves nothing
metadata:
  type: project
---

Meyhouse (`supabase/seed.sql`, Main Dining / Garden Room, Alex Kim / Jordan Lee) role logins, all via passwordless magic link:
`owner@newfork.test`, `test.manager@meyhouse.test`, `test.employee@meyhouse.test`, `test.admin@meyhouse.test`.
The manager is scoped to Palo Alto and Sunnyvale only, so Alex/Jordan availability and time off do not show for them.
For manager-role QA on that data, copy the owner's payload onto the manager's visible people with Playwright `page.route` (no DB write); see [[ghost-shift-mock-via-playwright-route]].
The employee's `/app/schedule` redirects to `/app/employee-hub`; the employee schedule is `/app/employee-hub/schedule`.

**Phone tooltips:** a 390px viewport driven by the mouse opens hover tips and hides touch bugs. Test with Playwright `hasTouch: true` + `page.touchscreen.tap`.
G14 (2026-10-01): the cell tip opened on tap and closed immediately on the emulated `mouseover`. The implementer's "phone" screenshot had been taken with the mouse.
The sticky name column covers the left of a cell, so tap near the cell's right edge. Clicking the empty strip under the toolbar jumps the week to today; that is old behaviour, not a regression.

Claude_Browser screenshots are not saved to disk; to name a path in `artifacts/nf-gorsel-qa/`, save via Playwright/CDP.
