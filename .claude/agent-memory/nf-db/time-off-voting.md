---
name: time-off-voting
description: FB-6.3 time off by location votes — the engine's shape (.3/.4), the owner document exemption, the test traps found while turning .1 green
metadata:
  type: project
---

- Branch `task/fb-6.3` (2026-10-01): `.1` red tests, `.3` = `20261003031000_time_off_votes_decide_requests`, `.4` = `20261003032000_time_off_deadlines_close_requests`. `.2` (`20261003030000`) is on main and live.
- One evaluation: `app_private.time_off_state(w, rid)`; votes, reads (`time_off_progress`), the sweep and notices use it. "Manager of a location" = passes `time_off.decide` there and fails `time_off.decide_alone` (core only, no role reading): `time_off_location_voters`. Fixed list now = `time_off_live_locations` (old requests stand in with their `location_id`).
- Owner exemption: `app_private.time_off_reason()` clears `document_blocked` for the owner, used only by the time-off services; the core is untouched.
- `requests.read` is person scope now; `scope_set` still works for it (place list), the queue filters by `authz_reason(actor, w, 'requests.read', null, employee)`.
- Traps: a null actor (system decline) makes `time_off_is_the_owners_own` null → wrap in coalesce; `at` is a keyword (alias); a plpgsql variable named like a column (`impact`) is ambiguous in `on conflict ... excluded`; `pg_get_functiondef` of some functions ends with `end; $function$` on one line — cut by function, not by a `^$function$` line.
- `guard_time_off_request_identity` no longer guards `created_at` (the deadlines test moves it; the reminder reads it).
- `packages/shared/src/authorization-matrix.expected.json` is a hash of the SQL matrix: any matrix edit needs the dump (`dump-authorization-matrix.ts`, `AUTHZ_MATRIX_PRELUDE` takes migration paths) — nf-backend's file.
- GateGuard refuses the first Write/Edit of each file once: state the facts, retry.

- All of .1-.4 is live and on main (2026-10-01). D1/D2 (`20261003033000`, sweep only) waits on `task/fb-6.3`: parked until a user approves the live push. The shared DB holds .3/.4 but not `tests.leave`: trials still need `builder-leave.sql` in the prelude.

**Why:** FB-6.3 .3/.4, 2026-10-01.
**How to apply:** before .7 (deletes) or any change to time off. See [[rollback-trial-runner]], [[new-notification-type]].
