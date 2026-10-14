# Lineup: notes before coding (13 Oct 2026)

Read-only research on origin/main 68a6eae. Inputs for stage 1 (DB) and stage 2 (desktop read). This is not a decision record.

## Old Line Up names are blocked
- `supabase/tests/retired_objects_stay_gone.test.sql:59-67, 116-142, 484-490`:
  - Blocked tables: `lineup_*`, `schedule_lineup*`.
  - Blocked column: `locations.lineup_operations_enabled`.
  - Blocked permission pattern: `schedule.lineup.%`.
  - About 60 old function names are blocked too, e.g. `get_schedule_lineup_service`.
- Names that are free: `daily_lineup*`, `location_sections`, `get_lineup_day_service`.
- New permission key: none. Use `schedule.read`, `schedule.publish` and `schedule.edit`. The UI's `schedule.manage` maps to the `schedule.edit` action.
- KARARLAR P13 (`docs/plan/KARARLAR.md:44, :357`): "Line Up will be redesigned from scratch later." When coding starts, KARARLAR needs a new item for Mert's "implement" (13 Oct).

## Data
- Live shift = `schedule_published_shifts` joined to `schedule_location_publications.status = 'current'`.
  - Columns: `employee_id` (null = open shift), `job_id`, `shift_type_id` (nullable), `scheduled_date`, `start_time`/`end_time`, `crosses_midnight`, `label_ids`/`label_names`.
  - There is no section column.
- `shift_types`: `default_start_time`/`default_end_time` (both or neither) and `sort_order`.
- `locations`: `sort_order`, `short_name`, `timezone`.
- `jobs` and `departments` have no sort column; they are sorted by name. So the open question about department/job order is answered by the data: sort by name.

## Authorization and services
- Read pattern to copy: `get_schedule_read_model_service` (schema.sql:13441).
  - `scope_set(..., 'schedule.read')`, read once, cast to `::uuid[]`.
  - If the result is empty, `authorize`.
  - `STABLE SECURITY DEFINER`, `search_path ''`.
- New service:
  - Add a row to `authorization_coverage.test.sql` (`service_class`).
  - The matrix is keyed by action, so reusing an existing action needs no matrix row.
  - The authz catalog ceilings must not go up.

## API and web
- API:
  - Route: `apps/api/src/schedule/schedule-requests-routes.ts`.
  - Service: `schedule-requests-service.ts`.
  - Errors: `http-error.ts`.
  - Contract tests: `service-error-contract.test.ts`, `route-error-contract.test.ts`.
- Web:
  - Fetcher: `schedule/requests-data.ts`.
  - Page: `views/ScheduleRequestsPage.tsx`.
  - Routing: `App.tsx`, use `ActionRoute`.
  - Sidebar: `shell/AppShell.tsx:66-86` (`parentTo: "/app/schedule"`).
  - Query key: `auth/tenant-query-cache.ts`.

## Realtime gap
- Schedule sends `schedule:invalidation:<w>:<loc>`. The only sender is the API.
- Shift Hub and time off send only `shift-exchanges:<w>`.
- The lineup page must listen to both channels, or the DB side must send the schedule invalidation too. This is the plan's known gap.

## Traps
- `supabase/CLAUDE.md`:
  - Commit `schema.sql` in the same commit as the migration.
  - Try a migration only inside `begin;`.
  - In `language sql`, an argument named like a column loses to the column.
  - Times in JSON use `to_char(x,'HH24:MI')`.
  - Every test file starts with `begin;`.
- `apps/api/CLAUDE.md`: DB → API → shared type → web change together in one branch; every endpoint tests 200, 403, 404 and validation.
- The cloud thread has no local DB. pgTAP and migration tries go to the PC thread (Remote Control).
