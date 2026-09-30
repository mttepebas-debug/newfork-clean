---
name: shared-schema-readers
description: A shared zod schema can be parsed from more than one RPC (Schedule read + Employee Hub board); list every parser before making a field required. The drawer's main test mocks employee-data wholesale.
metadata:
  type: project
---

`scheduleReadModelSchema` is parsed from `get_schedule_read_model_service` (API `schedule-service.ts`, web `schedule-data.ts`) **and** from `get_employee_schedule_board_service` (API `employee-hub-service.ts`, web `employee-hub-data.ts`). BL-218 .3a changed only the first; making `system_key` required would have 500'd Employee Hub → Schedule. Before a required field: `grep -rn "<schema>.parse\|<schema>," apps packages` and read each RPC's current body (`pg_get_functiondef`, SELECT only).

**Why:** a sibling reader that nf-db's migration did not touch fails only at runtime; unit fixtures are hand-built per reader and stay green.

**How to apply:** name every reader in the question to the coordinator; take each reader's fixture from a rolled-back run ([[fixture-from-real-db-output]]).

Trap: `EmployeeDrawer.test.tsx` does `vi.mock("./employee-data")` without the original (`EmployeeDrawer.create.test.tsx` spreads it), so a new pure helper exported from `employee-data.ts` is undefined in the drawer's main test. Put form rules in `employees/employee-create-flow.ts` (not mocked) — `firstJobExceptOwner` lives there.
**`employeeInputSchema` is also the setup wizard's readiness (EMP-001 C2, 2026-09-30):** `OwnerOnboardingPage.tsx` parses its employee draft through `employeeCreateReadiness` with `primary_job_id` always null (the primary is worked out at submit, `firstJobExceptOwner`). A schema rule that asks for a primary job turned "Add employee" off there (4 wizard cells red) and was taken back out; the database asks for the primary (`employee.primary_job_required`). Before a new `superRefine` rule, grep `employeeCreateReadiness` as well as `employeeInputSchema`. Same job: a required field on `employeeDetailSchema` needs the three literals in `packages/shared/src/employee-detail.test.ts` and the base fixtures in `EmployeeDrawer.test.tsx` / `.create.test.tsx`; the API has no typed detail fixture.
