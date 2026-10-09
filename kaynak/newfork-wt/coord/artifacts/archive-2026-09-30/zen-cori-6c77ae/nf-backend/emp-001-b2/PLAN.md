# EMP-001 B2 + B3 Implementation Plan

**Goal:** "Manages without working there" leaves shared, API and web; K4 ("a manager who is not Remote has at least one location") is a shared rule with a readable sentence; the six routes of `employee-directory-routes.ts` keep no gate of their own.

**Architecture:** B1 (`d261e51b`, `task/emp-001-b`) already removed the database side. This branch (`task/emp-001-b2`, on top of it) follows its contract: three fields and one schema leave `packages/shared`, one route and one service wrapper leave the API, one field component and one chip leave the web. K4 is a rule inside `employeeInputSchema` keyed on a form hint (`is_manager_record`, the twin of `is_owner_record`); the database stays the judge.

**Tech stack:** zod 4, Fastify 5, React 19 + TanStack Query 5, vitest.

**Spec:** `docs/plan/tasks/EMP-001.md` (origin/main) In scope B, Done when 11, 12 (TS), 14 (shared + drawer), 16a; B1 report `…/dreamy-sinoussi-7c5a4a/artifacts/nf-db/emp-001-b1/RAPOR.md`; coordinator task message 2026-09-30.

## Global constraints
- No `supabase/**`, no `docs/plan/**`, no e2e, no push, no new package.
- Migration is never applied to the shared local database for good; the matrix dump runs inside a rolled-back transaction, under `db.lock`.
- Route keeps no permission gate; the refusal is the core's (403 `authz.*`, 404 `authz.not_member`).
- UI text English; "workspace"/"team"; tokens only.
- Focused tests while working; the full gate (lint, typecheck, test, build) once at the end, after `gh run list --limit 3` shows no CI run.

## Review focus
1. A manager record whose role is not in the reader's `inviteRoles`: the form hint is off, the database still refuses (sentence reaches the drawer).
2. Create with an invitation as Manager, excluded, no location: refused before the request is sent.
3. Excluded employee and Remote person with no location still save (exemption unchanged).
4. A non-member on each of the six routes: 404 `authz.not_member`, service never called.
5. `managed-locations` URL: 404, no route.

## Task 1 — shared: fields, schema, action, K4 rule
Files: `packages/shared/src/index.ts`, `index.test.ts`, `employee-detail.test.ts`, `authorization.ts`, `authorization.test.ts`, `scripts/dump-authorization-matrix.ts`.
- Red: `index.test.ts` — K4 cells: manager record, no location → the manager sentence at `location_ids` whether excluded or not; excluded non-manager with no location → passes; Remote manager with no location → passes; `managementAndOwnerSentence("employee.manager_location_required")` is that sentence. `employee-detail.test.ts` — detail and summary parse without the three fields; `allowed` has eight keys.
- Green: add `employee.manager_location_required` to `managementAndOwnerRefusals`; `is_manager_record` + rule in `employeeInputSchema`; delete `managed_location_names`, `managed_locations`, `allowed.set_managed_locations`, `employeeManagedLocationsSchema`; delete `employee.set_managed_locations` (list, rule, case); `manages` leaves the twin test and the dump script.
- Run: `pnpm.cmd --filter @newfork/shared exec vitest run src/index.test.ts src/employee-detail.test.ts`.

## Task 2 — API: the route goes, three routes ask the core
Files: `apps/api/src/employees/employee-directory-routes.ts`, `employee-directory-service.ts`, `employee-directory-routes.test.ts`.
- Red: `PUT …/managed-locations` → 404 and no rpc; for preferred name, pending names and the decision: a caller with no permissions reaches the rpc, the core's 42501 `authz.*` answers 403 with its reason, a non-member answers 404 `authz.not_member` with no rpc; K4 hint answers 400 with the sentence (added to the existing `it.each`).
- Green: delete the route and `setManagedLocations`; swap the three `authorize(…)` calls for `resolveActor(…)`.
- Run: `pnpm.cmd --filter @newfork/api exec vitest run src/employees/employee-directory-routes.test.ts`.

## Task 3 — web: data layer, drawer, list chip
Files: `apps/web/src/employees/employee-data.ts` (+test), `EmployeeDrawer.tsx` (+2 tests), `EmployeeLocationParts.tsx` (+test), `employee-location-parts.css`, `EmployeesPage.test.tsx`.
- Red: list cell shows "No location" and never "Manages"; the drawer has no "Manages without working there" group; K4 in the drawer: a Manager's record, excluded, last location unticked → the manager sentence and no save call; an excluded employee with no location saves.
- Green: delete `setEmployeeManagedLocations`, the mutation, `ManagedLocationsField`, its CSS, the chip; pass the manager hint into the rule (role class read from `references.inviteRoles` by `detail.role_id`; create: the chosen invitation role).
- Run: `pnpm.cmd --filter @newfork/web exec vitest run src/employees`.

## Task 4 — after nf-db's addition lands on `task/emp-001-b`
- `git rebase task/emp-001-b`.
- The other three routes (name approval GET/PUT, emergency contact) lose their gate; the wrapper `authorize` and the `Permission`/`FastifyReply` imports go; route tests for the three.
- New actions `settings.people.read`, `employee.save_own_contact` into `authzActionKeys` (and `targetedAuthzActions` if the matrix has cells for them).
- Matrix dump inside a rolled-back transaction (`db.lock`), then `authorization.test.ts` green.

## Task 5 — gate and report
- `grep -rn "managed_location\|managedLocation\|ManagedLocation\|managed-locations\|Manages without" apps packages e2e` → 0.
- `grep -c "await authorize(" apps/api/src/employees/employee-directory-routes.ts` → 0.
- `gh run list --limit 3`, then `pnpm.cmd lint`, `typecheck`, `test`, `build`.
- `artifacts/nf-backend/emp-001-b2/RAPOR.md` + short message to the coordinator.
