---
name: time-off-qa-login-and-dialogs
description: Local login world for owner/manager/employee QA, no pending time off in it (page.route needed), and how to pick the confirm dialog on Requests
metadata:
  type: feedback
---

FB-6.3.6 QA (2026-10-01):
- Owner can sign in locally on "World e2e1790693406000" (newer e2e worlds' owners cannot). Accounts `e2e1790693406000.<person>.<suffix>@world.test`, password from `e2e/global-setup.ts` (password path in `e2e/fixtures/world.ts`); magic links do not work for e2e accounts.
- That world has no pending time off: fill the Requests queue and Hub request rows with `page.route` fixtures and say so in the report.
- Requests has two dialogs at once (drawer + confirm); select the confirm one with `.app-confirm-layer`.
- Until the FB-6.3 database package is live, the local hub read does not send `time_off_timezone` / `time_off_lead_hours`.

**Why:** the first QA session lost time finding a world whose owner can log in.

**How to apply:** start time-off/Requests QA from this world; check messages render above the drawer, not behind it (FB-6.3.6 D1). Related: [[ghost-shift-mock-via-playwright-route]].
