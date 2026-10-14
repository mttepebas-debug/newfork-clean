---
name: shift-exchange-builder-traps
description: Traps when driving shift_exchanges_command_service / tests.cover_case directly via psql outside the normal API/UI path
metadata:
  type: reference
---

Found while building a demo world for BL-164/167 screenshots (2026-09-26),
reproducing what `supabase/tests/shift_exchanges_v1.test.sql` (AT27) does.

- `shift_exchanges_command_service(actor_user_id, ...)` and `tests.cover_case`/
  `tests.publish_week_as` all take an **auth user id** for the actor —
  `tests.user('<world>:<label>')` — never the employee-profile id
  (`tests.id('<world>:<label>')`). Passing the employee id throws
  `42501 Active workspace access required`.
- Calling `shift_exchanges_command_service(..., 'approve', ...)` directly via
  psql (bypassing the API route that normally wraps a publish/approve request)
  can hit `guard_schedule_assignment_availability()` erroring on
  `current_setting('newfork.schedule_publish_scope', true)::jsonb` with
  "invalid input syntax for type json" — Postgres does not guarantee
  short-circuit evaluation of the `nullif(...) is not null and ...` guard.
  Work around with `perform set_config('newfork.schedule_publish_scope', '{}', true);`
  right before the approve call.
- A shift note has a Schedule UI since BL-199 (editor note field); the old "no note field in Schedule
  UI" trap is gone (corrected 2026-09-29). Employees see it in `apps/web/src/employee-hub/ShiftSheet.tsx`.
- `tests.enable_shift_hub(w)` (in `supabase/test-support/builder.sql`) is **dead**:
  it does `update workspaces set shift_exchanges_enabled = true`, but that column
  no longer exists on `public.workspaces` (checked on `origin/main` 2026-09-26,
  `\d public.workspaces` has no `*exchange*` column). Shift exchanges apparently
  no longer need a workspace-level flag; skip the call rather than let it error.
- Approving an exchange (`action='approve'`) auto-rebases *any already-dirty*
  `schedule_edit_session_shifts`/`schedule_draft_shifts` row for the traded shift,
  in the same DB transaction — silently, no toast, no client push needed (see
  AT27 in `shift_exchanges_v1.test.sql` lines ~65-73). The separate
  `shift_exchange_schedule_recovery_service` / `ExchangeScheduleRecovery.tsx`
  ("Use approved assignments" panel) is only reachable for the residual case
  where a session's copy of that shift is *not* in sync with the live published
  row when a save/publish is attempted (e.g. because it was never dirtied before
  the swap, or a raw revert simulating a lost response) — it will not appear in
  the ordinary "manager already had this exact shift open" case.
