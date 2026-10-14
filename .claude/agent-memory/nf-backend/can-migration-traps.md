---
name: can-migration-traps
description: Traps when moving a web screen from permissions.includes to can() — hidden optional-chain calls, App.test is SchedulePage's render test, no-access card wiring exists
metadata:
  type: reference
---

- Count with `rg "permissions\??\.includes"`: the plan's `permissions\.includes` misses `permissions?.includes` (FB-6.1.9 found one in `schedule/lib/exportAccess.ts`, now deleted).
- SchedulePage has no own test; `apps/web/src/App.test.tsx` renders it. Its mocked context derives `actions` from `expected()` for the role (non-person targeted actions only). A screen moved to `can()` fails there first if a fixture has `actions: []`.
- Hand-built contexts in page tests (`ScheduleRequestsPage.test.tsx`, `SchedulingSettingsPage.test.tsx`) carry `actions: []` by default: give them the actions, and assert the "no" case with the permission key still present but the action absent (proves the page reads actions).
- Permission key → action is not 1:1: `schedule.time_off_requests.read` → `requests.read`, `schedule.shift_change_requests.read` → `exchange.read`, `settings.schedule_rules.manage` → `settings.scheduling.write`; the Schedule logo writes are RLS on `settings.general.manage` → `settings.organization.write` (the screen had asked `workspace.manage`). Source: `authz_actions` rows in `supabase/migrations/20260924123013_authorization_core.sql`.
- `time_off.decide` is a person action but the request row carries no requester role; no-target `can()` used until the read model carries it. See [[authz-matrix-twin]].
- No-access card: `shell/NoAccessState.tsx` (FB-6.1.9). "Back to Home" target = `noAccessHomePath(context, refusedPath)` in `auth/resolveLanding.ts` (never `/app`: can land back on the refusing page). App.test mock `actions` hold only targeted non-person actions + `workspace.read` (every active member has it, `authz_has_permission`); another untargeted action gated by `can()` must be added there too.
