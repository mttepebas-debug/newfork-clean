---
name: checklist-rpcfailure-raw-detail
description: rpcFailure (apps/api/src/http-error.ts) filter since BL-131; what to ask when a service moves onto it (JSON-in-message RAISEs get swallowed, detail uuid rule, 500 for unmapped codes)
metadata:
  type: project
---

Since BL-131 (reviewed 2026-09-25, commit 04386e0): `rpcFailure` passes `hint` only if it matches `a.b` key form, `details` only beside such a hint and only as a key or uuid, swaps any message containing a double quote or starting "permission denied for" for a plain sentence when no key, and maps unknown SQLSTATE to 500 "Internal server error". Mapped 4xx: 42501, P0002, 02000, 23505, 40001, PT409, P0001, 22023, 23502, 23514, 23503, 55000.

**Why:** before BL-131 constraint details ("Key (x)=(...)") and PostgREST hints reached 4xx bodies.

**How to apply:** when a diff moves a service onto `rpcFailure` (FB-6.1 .3a/.3b Schedule especially), ask:
- Does any RPC it calls RAISE a JSON payload as the message (raise exception with jsonb_build_object as the % arg)? Those contain double quotes and get swapped to "Request could not be completed". Known 2026-09-25: `acquire_schedule_edit_session_service`, `save_schedule_edit_session_service_exchange_base` (past_edit_blocked, parsed by `schedule-routes.ts` parseStructuredScheduleError), `shift_exchanges_command_service` (reasons array, parsed by web `exchange-data.ts`), `publish_schedule_draft_service` / `unpublish_schedule_service` (SQLERRM passthrough).
- Any RAISE with an errcode outside the mapped list? Global list 2026-09-25: only 0A000 and 54000 (notification functions).
- Any new `detail` beside a hint: is the uuid the caller's own tenant row? Producers 2026-09-25: `authorize` (action key), `block_closure_when_ownership_transfer_pending` (same-workspace transfer id, owner already sees it in list_my_workspaces_service).
Query recipe: pg_get_functiondef over public+app_private with prokind='f', regex on raise-exception statements. Related: [[checklist-omitted-input-probe]].
