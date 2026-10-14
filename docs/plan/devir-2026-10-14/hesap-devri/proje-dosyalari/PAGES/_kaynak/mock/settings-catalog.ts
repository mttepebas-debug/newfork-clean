// Settings → Locations, Jobs and the shift catalog. The rows are the shared
// world's (world.locations, departments, jobs, shift_types, shift_labels: what
// Schedule reads); Settings writes them straight through supabase-js, so the
// tables are registered here with the database's own checks (unique names,
// default revisions, the department archive guard). Deleting is soft, as in the
// database: the row stays with deleted_at and archived_at set.
import { people } from "./people";
import { ApiError, type Handler } from "./api";
import { storedFileUrl } from "./fake-supabase";
import { nowIso, settings } from "./settings-store";
import { persist, registerTable, WORKSPACE_ID, world, LOC, type Employee } from "./world";
import { SEED_LOGO_PATH, SEED_LOGO_URL, settingsFlags } from "./settings-setups";

type Route = (method: string, path: string, handler: Handler) => void;
type Row = Record<string, unknown>;

export function fail(status: number, error: string, extra: Record<string, unknown> = {}): never {
  throw new ApiError(status, { error, ...extra });
}

/** A database refusal, thrown from a table write (fake-supabase hands it to the page). */
function refuse(code: string, message: string, hint: string | null = null): never {
  throw { code, message, hint, details: null };
}
const uniqueViolation = (index: string) =>
  refuse("23505", `duplicate key value violates unique constraint "${index}"`);

// ---------- rows as the database holds them ----------

const created = "2026-06-02T14:00:00.000Z";
const blankAddress = { phone: null, street_address: "", city: "", region: "", postal_code: "", country_code: "US" };
const addresses: Record<string, Row> = {
  [LOC.downtown]: { phone: "+16175550142", street_address: "214 Atlantic Avenue", city: "Boston", region: "MA", postal_code: "02110", country_code: "US" },
  [LOC.uptown]: { phone: "+16175550178", street_address: "1650 Commonwealth Avenue", city: "Boston", region: "MA", postal_code: "02135", country_code: "US" },
};
const live = (row: Row) => !row.deleted_at;
const active = (row: Row) => !row.archived_at && !row.deleted_at;
const lower = (value: unknown) => String(value ?? "").trim().toLowerCase();

const stored = {
  locations: () => world.locations as unknown as Row[],
  departments: () => world.departments as unknown as Row[],
  jobs: () => world.jobs as unknown as Row[],
  shift_types: () => world.shift_types as unknown as Row[],
  shift_labels: () => world.shift_labels as unknown as Row[],
};
type Table = keyof typeof stored;

const defaults: Record<Table, (row: Row) => Row> = {
  locations: (row) => ({ ...blankAddress, ...(addresses[row.id as string] ?? {}) }),
  departments: () => ({ system_key: null }),
  jobs: () => ({ system_key: null, department_id: null }),
  shift_types: (row) => ({ crosses_midnight: crosses(row.default_start_time, row.default_end_time), default_revision: 1 }),
  shift_labels: () => ({}),
};

function full(table: Table, row: Row): Row {
  return {
    workspace_id: WORKSPACE_ID, archived_at: null, deleted_at: null, created_at: created, updated_at: created,
    ...defaults[table](row), ...row,
  };
}

/** Every row of a table that is not deleted, as the database would return it. */
export function catalogRows(table: Table): Row[] {
  return stored[table]().filter(live).map((row) => full(table, row));
}

function crosses(start: unknown, end: unknown): boolean {
  return typeof start === "string" && typeof end === "string" && end.slice(0, 5) <= start.slice(0, 5);
}

const palette = ["#0EA5E9", "#14B8A6", "#F59E0B", "#8B5CF6", "#EC4899", "#64748B", "#22C55E", "#EF4444"];
const nextSort = (table: Table) => Math.max(-1, ...stored[table]().map((row) => Number(row.sort_order ?? 0))) + 1;

function pick(values: Row, columns: readonly string[]): Row {
  return Object.fromEntries(Object.entries(values).filter(([key]) => columns.includes(key)));
}

/** The unique "active name" indexes: one live, unarchived row per lower(column). */
function assertUnique(table: Table, id: string, next: Row, column: string, index: string): void {
  if (next.archived_at || next.deleted_at) return;
  const clash = stored[table]().some((row) => row.id !== id && active(row) && lower(row[column]) === lower(next[column]));
  if (clash) uniqueViolation(index);
}

function checkLocation(id: string, next: Row): void {
  if (!/^[A-Z0-9-]{2,12}$/.test(String(next.short_name ?? "")))
    refuse("23514", 'new row for relation "locations" violates check constraint "locations_short_name_format"');
  if (next.phone && !/^\+1[2-9][0-9]{9}$/.test(String(next.phone)))
    refuse("23514", 'new row for relation "locations" violates check constraint "locations_phone_format"');
  assertUnique("locations", id, next, "short_name", "locations_workspace_short_name");
  assertUnique("locations", id, next, "name", "locations_workspace_active_name_idx");
}

const columns: Record<Table, readonly string[]> = {
  locations: ["name", "short_name", "phone", "street_address", "city", "region", "postal_code", "country_code", "timezone", "sort_order", "archived_at", "updated_at"],
  departments: ["name", "color", "archived_at", "updated_at"],
  jobs: ["name", "color", "department_id", "archived_at", "updated_at"],
  shift_types: ["name", "color", "default_start_time", "default_end_time", "sort_order", "archived_at", "updated_at"],
  shift_labels: ["name", "color", "sort_order", "archived_at", "updated_at"],
};

function check(table: Table, id: string, before: Row | null, next: Row): void {
  if (table === "locations") return checkLocation(id, next);
  if (table === "departments") {
    assertUnique(table, id, next, "name", "departments_workspace_active_name_idx");
    return;
  }
  if (table === "jobs") {
    assertUnique(table, id, next, "name", "jobs_workspace_active_name_idx");
    const department = next.department_id ? stored.departments().find((row) => row.id === next.department_id) : null;
    if (next.department_id && (!department || department.deleted_at))
      refuse("23503", 'insert or update on table "jobs" violates foreign key constraint "jobs_department_id_fkey"');
    // app_private.keep_jobs_out_of_archived_departments: a job restored while its
    // department is archived comes back under No department; none goes in new.
    if (!next.archived_at && department?.archived_at) {
      if (before?.archived_at) next.department_id = null;
      else if (!before || before.department_id !== next.department_id)
        throw { code: "22023", message: "Restore the department before adding jobs", hint: "department.archived", details: null };
    }
    return;
  }
  assertUnique(table, id, next, "name", `${table}_workspace_active_name_idx`);
  if (table === "shift_types" && Boolean(next.default_start_time) !== Boolean(next.default_end_time))
    refuse("23514", 'new row for relation "shift_types" violates check constraint "shift_types_check"');
  if (table === "shift_types" && next.default_start_time && next.default_start_time === next.default_end_time)
    refuse("23514", 'new row for relation "shift_types" violates check constraint "shift_types_check"');
}

function insertRow(table: Table, values: Row): Row {
  if (values.workspace_id !== undefined && values.workspace_id !== WORKSPACE_ID)
    refuse("42501", `new row violates row-level security policy for table "${table}"`);
  const id = typeof values.id === "string" ? values.id : crypto.randomUUID();
  const row: Row = { id, ...pick(values, columns[table]), created_at: nowIso(), updated_at: nowIso() };
  if (typeof row.name === "string") row.name = row.name.trim();
  if (table === "locations") Object.assign(row, { color: palette[stored.locations().length % palette.length], sort_order: nextSort(table) });
  if (table === "jobs" && row.department_id === undefined) row.department_id = null;
  if (table === "departments" || table === "jobs") row.system_key = null;
  if (table === "shift_types") Object.assign(row, { sort_order: nextSort(table), default_revision: 1, crosses_midnight: crosses(row.default_start_time, row.default_end_time) });
  if (table === "shift_labels") row.sort_order = nextSort(table);
  check(table, id, null, row);
  stored[table]().push(row as never);
  persist();
  return full(table, row);
}

function updateRow(table: Table, current: Row, values: Row): Row {
  const row = stored[table]().find((item) => item.id === current.id);
  if (!row) return current;
  if (table === "locations" && settingsFlags.locationGone) {
    // PAGES "gone meanwhile": another tab deleted it first (app_private's guard, hint location.deleted).
    const stamp = nowIso();
    Object.assign(row, { deleted_at: stamp, archived_at: row.archived_at ?? stamp });
    persist();
    throw { code: "PT409", message: "This location was deleted. Reload locations.", hint: "location.deleted", details: null };
  }
  const next: Row = { ...full(table, row), ...pick(values, columns[table]) };
  if (typeof next.name === "string") next.name = next.name.trim();
  if (table === "shift_types") {
    const timesChanged = next.default_start_time !== row.default_start_time || next.default_end_time !== row.default_end_time;
    next.default_revision = Number(row.default_revision ?? 1) + (timesChanged ? 1 : 0);
    next.crosses_midnight = crosses(next.default_start_time, next.default_end_time);
  }
  check(table, String(row.id), full(table, row), next);
  const wasArchived = Boolean(row.archived_at);
  for (const key of Object.keys(next)) if (key !== "workspace_id") (row as Row)[key] = next[key];
  // app_private.department_archive_takes_its_jobs: the department's active jobs
  // go to the archive with it.
  if (table === "departments" && !wasArchived && next.archived_at)
    for (const job of stored.jobs())
      if (job.department_id === row.id && active(job)) Object.assign(job, { archived_at: next.archived_at, updated_at: nowIso() });
  persist();
  return full(table, row);
}

for (const table of Object.keys(stored) as Table[]) {
  registerTable(table, () => catalogRows(table), {
    insert: (values) => insertRow(table, values),
    update: (row, values) => updateRow(table, row, values),
    remove: () => refuse("42501", `permission denied for table ${table}`),
  });
}

// ---------- the workspace row (name and schedule logo) ----------

export function workspaceRow(): Row {
  return { ...settings.data.workspace };
}

/** What /v1/context says about the workspace: its name and logo as saved here. */
export function workspaceIdentity() {
  const row = settings.data.workspace;
  return {
    id: row.id,
    name: row.name,
    logo_url: row.logo_storage_path
      ? storedFileUrl("workspace-logos", row.logo_storage_path) ?? (row.logo_storage_path === SEED_LOGO_PATH ? SEED_LOGO_URL : null)
      : null,
    logo_file_name: row.logo_file_name,
    logo_updated_at: row.logo_updated_at,
    schedule_logo_placement: { scale: row.schedule_logo_scale, offset_x: row.schedule_logo_offset_x, offset_y: row.schedule_logo_offset_y },
  };
}

// PAGES "name refused": RLS hides the row from the update, so no row changes.
registerTable("workspaces", () => (settingsFlags.nameRefused ? [] : [workspaceRow()]), {
  insert: () => refuse("42501", 'new row violates row-level security policy for table "workspaces"'),
  update: (_row, values) => {
    const next = { ...settings.data.workspace, ...pick(values, ["name", "logo_storage_path", "logo_file_name", "logo_updated_at", "schedule_logo_scale", "schedule_logo_offset_x", "schedule_logo_offset_y", "updated_at"]) };
    const name = String(next.name ?? "").trim();
    if (name.length < 1 || name.length > 120) refuse("23514", 'new row for relation "workspaces" violates check constraint "workspaces_name_check"');
    settings.data.workspace = { ...next, name } as typeof settings.data.workspace;
    settings.save();
    return workspaceRow();
  },
  remove: () => refuse("42501", "permission denied for table workspaces"),
});

// ---------- employees on jobs (world.employees is what Schedule reads) ----------

export const revisionOf = (employeeId: string) => settings.data.employee_revisions[employeeId] ?? 1;
export function bumpRevision(employeeId: string): void {
  settings.data.employee_revisions[employeeId] = revisionOf(employeeId) + 1;
  settings.save();
}

const nameOf = (table: Table, rowId: string | null | undefined) =>
  stored[table]().find((row) => row.id === rowId)?.name as string | undefined;

/** Taking a job off someone: the next job alphabetically becomes primary (as the database does). */
function removeJob(employee: Employee, jobId: string): void {
  employee.job_ids = employee.job_ids.filter((item) => item !== jobId);
  if (employee.primary_job_id === jobId) {
    const remaining = employee.job_ids
      .map((item) => stored.jobs().find((job) => job.id === item))
      .filter((job): job is Row => Boolean(job))
      .sort((a, b) => Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at)) || lower(a.name).localeCompare(lower(b.name)));
    employee.primary_job_id = (remaining[0]?.id as string | undefined) ?? "";
  }
}

function addJob(employee: Employee, jobId: string): void {
  if (employee.job_ids.includes(jobId)) return;
  employee.job_ids = [...employee.job_ids, jobId];
  if (!employee.primary_job_id) employee.primary_job_id = jobId;
}

interface Change { employee_id: string; assigned: boolean; expected_revision: number }

function applyAssignments(jobId: string, changes: Change[]) {
  const job = stored.jobs().find((row) => row.id === jobId);
  if (!job) fail(404, "Job not found");
  if (job.deleted_at) fail(404, "This job was deleted and is no longer available");
  if (job.archived_at) fail(400, "Restore this job before changing assignments");
  if (new Set(changes.map((change) => change.employee_id)).size !== changes.length) fail(400, "An employee may only appear once in a batch");
  // Ask and check the whole batch before changing anybody.
  for (const change of [...changes].sort((a, b) => a.employee_id.localeCompare(b.employee_id))) {
    const employee = world.employees.find((item) => item.id === change.employee_id);
    if (!employee) fail(403, "Not allowed", { reason: "authz.out_of_scope" });
    const actual = employee.job_ids.includes(jobId);
    if (actual !== change.assigned && revisionOf(employee.id) !== change.expected_revision)
      fail(409, `Employee ${employee.employee_code} changed. Reload employees and review your pending changes.`);
  }
  let changed = 0;
  let unchanged = 0;
  for (const change of changes) {
    const employee = world.employees.find((item) => item.id === change.employee_id)!;
    if (employee.job_ids.includes(jobId) === change.assigned) { unchanged += 1; continue; }
    if (change.assigned) addJob(employee, jobId);
    else removeJob(employee, jobId);
    bumpRevision(employee.id);
    changed += 1;
  }
  persist();
  return { changed_count: changed, unchanged_count: unchanged };
}

const LOCKED_EMPLOYEE = "00000605-0000-4000-8000-000000000605";

function candidates(jobId: string | null) {
  return world.employees.map((employee) => {
    const primaryLocation = employee.location_ids[0];
    return {
      employee_id: employee.id,
      display_name: employee.display_name,
      employee_code: employee.employee_code,
      location_name: nameOf("locations", primaryLocation) ?? null,
      location_ids: employee.location_ids,
      display_status: "active",
      assigned: jobId ? employee.job_ids.includes(jobId) : false,
      is_primary: jobId ? employee.primary_job_id === jobId : false,
      revision: revisionOf(employee.id),
      // PAGES "locked employee": the core's answer for someone the viewer may not change.
      can_manage: !(settingsFlags.lockedEmployee && employee.id === LOCKED_EMPLOYEE),
      disabled_reason: settingsFlags.lockedEmployee && employee.id === LOCKED_EMPLOYEE ? "Your role cannot change this employee's assignments." : null,
    };
  });
}

function assignmentPage(jobId: string | null, query: URLSearchParams, targetsOnly: boolean) {
  if (jobId) {
    const job = stored.jobs().find((row) => row.id === jobId);
    if (!job || job.deleted_at) fail(404, "Job not found");
  }
  const search = (query.get("search") ?? "").trim().toLowerCase();
  const locationId = query.get("location_id");
  const filter = query.get("filter") ?? "all";
  const page = Number(query.get("page") ?? 0);
  if (!["all", "assigned", "unassigned"].includes(filter) || !(page >= 0)) fail(400, "Valid filters required");
  const all = candidates(jobId);
  const filtered = all
    .filter((row) => !search || `${row.display_name} ${row.employee_code}`.toLowerCase().includes(search))
    .filter((row) => !locationId || row.location_ids.includes(locationId))
    .filter((row) => filter === "all" || row.assigned === (filter === "assigned"))
    .sort((a, b) => a.display_name.toLowerCase().localeCompare(b.display_name.toLowerCase()) || a.employee_id.localeCompare(b.employee_id));
  if (targetsOnly) return filtered.filter((row) => row.can_manage).map(({ employee_id, assigned, revision }) => ({ employee_id, assigned, revision }));
  const used = new Set(all.flatMap((row) => row.location_ids));
  return {
    employees: filtered.slice(page * 50, page * 50 + 50).map(({ location_ids: _ids, ...row }) => row),
    total: filtered.length,
    manageable_total: filtered.filter((row) => row.can_manage).length,
    assigned_count: jobId ? all.filter((row) => row.assigned).length : 0,
    locations: catalogRows("locations")
      .filter((row) => !row.archived_at && used.has(row.id as string))
      .map((row) => ({ id: row.id, name: row.name }))
      .sort((a, b) => lower(a.name).localeCompare(lower(b.name))),
  };
}

// ---------- API routes ----------

type JobInput = { name: string; color: string; department_id?: string | null };

function createJob(input: JobInput, departmentId: string | null): Row {
  if (departmentId) {
    const department = stored.departments().find((row) => row.id === departmentId);
    if (!department || department.archived_at || department.deleted_at) fail(400, "Choose an active department in this workspace");
  }
  try {
    return insertRow("jobs", { name: input.name, color: input.color, department_id: departmentId });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") fail(409, "This job name already exists. Choose a unique name.");
    throw error;
  }
}

const jobView = (row: Row) => ({
  id: row.id, workspace_id: row.workspace_id, department_id: row.department_id ?? null, name: row.name,
  color: row.color, archived_at: row.archived_at ?? null, system_key: row.system_key ?? null,
});
const departmentView = (row: Row) => ({
  id: row.id, workspace_id: row.workspace_id, name: row.name, color: row.color,
  archived_at: row.archived_at ?? null, system_key: row.system_key ?? null,
});

function departmentJobs(departmentId: string, jobs: { name: string; color: string }[]): Row[] {
  const department = stored.departments().find((row) => row.id === departmentId && !row.deleted_at);
  if (!department) fail(404, "Department not found");
  if (department.archived_at) fail(400, "Restore the department before adding jobs");
  const added: Row[] = [];
  for (const job of jobs) {
    try {
      added.push(insertRow("jobs", { name: job.name, color: job.color, department_id: departmentId }));
    } catch (error) {
      if ((error as { code?: string }).code === "23505") fail(409, "A job with that name already exists. Names must be unique in this organization.");
      throw error;
    }
  }
  return added;
}

/** Soft delete of a catalog row, with what the database does to people and jobs. */
function deleteCatalogEntity(kind: string, entityId: string, departmentJobsChoice: "keep" | "delete") {
  const table = ({ locations: "locations", departments: "departments", "shift-types": "shift_types", "shift-labels": "shift_labels" } as Record<string, Table>)[kind];
  if (!table) fail(400, "Valid catalog deletion required");
  const row = stored[table]().find((item) => item.id === entityId);
  if (!row) fail(404, "Catalog item not found");
  if (row.deleted_at) return { removed_count: 0 };
  if (row.system_key) fail(400, "Management and Owner are kept; rename them instead", { reason: "catalog.system_record" });
  let affected = 0;
  if (table === "departments") {
    for (const job of stored.jobs().filter((item) => item.department_id === entityId && !item.deleted_at)) {
      if (departmentJobsChoice === "delete") deleteJob(String(job.id));
      else job.department_id = null;
      affected += 1;
    }
  }
  if (table === "locations") {
    row.archived_at ??= nowIso();
    for (const employee of world.employees.filter((item) => item.location_ids.includes(entityId))) {
      employee.location_ids = employee.location_ids.filter((item) => item !== entityId);
      bumpRevision(employee.id);
      affected += 1;
    }
  }
  const stamp = nowIso();
  Object.assign(row, { deleted_at: stamp, archived_at: row.archived_at ?? stamp, updated_at: stamp });
  persist();
  return { removed_count: affected };
}

function deleteJob(jobId: string) {
  const job = stored.jobs().find((row) => row.id === jobId);
  if (!job) fail(404, "Job not found");
  if (job.deleted_at) return { removed_count: 0 };
  if (job.system_key) fail(400, "Management and Owner are kept; rename them instead", { reason: "catalog.system_record" });
  let removed = 0;
  for (const employee of world.employees.filter((item) => item.job_ids.includes(jobId))) {
    removeJob(employee, jobId);
    bumpRevision(employee.id);
    removed += 1;
  }
  const stamp = nowIso();
  Object.assign(job, { deleted_at: stamp, archived_at: job.archived_at ?? stamp, updated_at: stamp });
  persist();
  return { removed_count: removed };
}

function reorder(table: "shift_types" | "shift_labels", orderedIds: unknown, noun: string): void {
  if (!Array.isArray(orderedIds)) fail(400, "Valid order required");
  const ids = orderedIds as string[];
  if (new Set(ids).size !== ids.length) fail(400, `${noun} order contains duplicates`);
  const activeRows = stored[table]().filter(active);
  if (activeRows.length !== ids.length || !activeRows.every((row) => ids.includes(String(row.id))))
    fail(400, `${noun} order must include every active ${noun}`);
  ids.forEach((rowId, index) => {
    const row = stored[table]().find((item) => item.id === rowId)!;
    Object.assign(row, { sort_order: index, updated_at: nowIso() });
  });
  persist();
}

/** The time zone for a US ZIP code, by its first three digits. */
function zoneForZip(zip: string): string | null {
  const prefix = Number(zip.slice(0, 3));
  if (!/^\d{5}/.test(zip)) return null;
  const ranges: [number, number, string][] = [
    [5, 349, "America/New_York"], [350, 369, "America/Chicago"], [370, 375, "America/Chicago"], [376, 379, "America/New_York"],
    [380, 397, "America/Chicago"], [398, 399, "America/New_York"], [400, 418, "America/New_York"], [420, 427, "America/Chicago"],
    [430, 459, "America/New_York"], [460, 479, "America/Indiana/Indianapolis"], [480, 499, "America/Detroit"],
    [500, 589, "America/Chicago"], [590, 599, "America/Denver"], [600, 797, "America/Chicago"], [798, 816, "America/Denver"],
    [820, 831, "America/Denver"], [832, 838, "America/Boise"], [840, 847, "America/Denver"], [850, 865, "America/Phoenix"],
    [870, 884, "America/Denver"], [889, 961, "America/Los_Angeles"], [967, 968, "Pacific/Honolulu"], [970, 994, "America/Los_Angeles"],
    [995, 999, "America/Anchorage"],
  ];
  return ranges.find(([from, to]) => prefix >= from && prefix <= to)?.[2] ?? null;
}

export function catalogRoutes(route: Route): void {
  const base = "/v1/workspaces/:workspaceId/organization";

  route("GET", "/v1/location-timezone-suggestion", ({ query }) => {
    const country = query.get("country") ?? "";
    const postal = (query.get("postal") ?? "").trim();
    if (!/^[A-Za-z]{2}$/.test(country) || !/^[A-Za-z0-9 -]{2,20}$/.test(postal)) fail(400, "Valid country and postal code required");
    const timezone = country.toUpperCase() === "US" ? zoneForZip(postal) : null;
    return timezone
      ? { timezone, status: "suggested", source: "postal_centroid" }
      : { timezone: null, status: "unavailable", source: "postal_centroid" };
  });

  route("GET", `${base}/job-counts`, () => {
    // Everyone on the Employees page who is not archived (Management included).
    const live = people().filter((person) => !person.archived_at);
    const jobs = new Map<string, number>();
    const departments = new Map<string, Set<string>>();
    for (const employee of live) {
      for (const jobId of employee.job_ids) {
        const job = stored.jobs().find((row) => row.id === jobId);
        if (!job) continue;
        jobs.set(jobId, (jobs.get(jobId) ?? 0) + 1);
        if (job.department_id) {
          const set = departments.get(String(job.department_id)) ?? new Set<string>();
          set.add(employee.id);
          departments.set(String(job.department_id), set);
        }
      }
    }
    return {
      jobs: [...jobs].map(([jobId, count]) => ({ id: jobId, employee_count: count })),
      departments: [...departments].map(([departmentId, people]) => ({ id: departmentId, employee_count: people.size })),
    };
  });

  route("POST", `${base}/departments`, ({ body }) => {
    const name = String(body?.department?.name ?? "").trim();
    const color = String(body?.department?.color ?? "");
    const jobs = (body?.jobs ?? []) as { name: string; color: string }[];
    if (!name || !/^#[0-9A-Fa-f]{6}$/.test(color)) fail(400, "Valid department names and colors required");
    const names = [name, ...jobs.map((job) => job.name.trim())].map(lower);
    if (stored.departments().some((row) => active(row) && lower(row.name) === lower(name)) ||
      jobs.some((job) => stored.jobs().some((row) => active(row) && lower(row.name) === lower(job.name))) ||
      new Set(names.slice(1)).size !== names.length - 1)
      fail(409, "A department or job with that name already exists. Names must be unique in this organization.");
    const department = insertRow("departments", { name, color });
    const added = jobs.map((job) => insertRow("jobs", { name: job.name, color: job.color, department_id: department.id }));
    return { department: departmentView(department), jobs: added.map(jobView).sort((a, b) => lower(a.name).localeCompare(lower(b.name))) };
  });

  route("PATCH", `${base}/departments/:departmentId`, ({ params, body }) => {
    const row = stored.departments().find((item) => item.id === params.departmentId && !item.deleted_at);
    if (!row) fail(404, "Department not found");
    const name = String(body?.department?.name ?? "").trim();
    if (stored.departments().some((item) => item.id !== row.id && active(item) && lower(item.name) === lower(name)))
      fail(409, "A department or job with that name already exists.");
    const saved = updateRow("departments", full("departments", row), { name, color: body.department.color, updated_at: nowIso() });
    const jobs = (body?.jobs ?? []) as { name: string; color: string }[];
    const added = jobs.length ? departmentJobs(String(row.id), jobs) : [];
    return { department: departmentView(saved), jobs: added.map(jobView) };
  });

  route("POST", `${base}/departments/:departmentId/jobs`, ({ params, body }) => {
    const jobs = (body?.jobs ?? []) as { name: string; color: string }[];
    if (jobs.length < 1 || jobs.length > 500) fail(400, "Valid department and jobs required");
    return departmentJobs(params.departmentId, jobs).map(jobView);
  });

  route("DELETE", `${base}/jobs/:jobId`, ({ params }) => deleteJob(params.jobId));

  for (const kind of ["departments", "locations", "shift-types", "shift-labels"]) {
    route("DELETE", `${base}/${kind}/:entityId`, ({ params, body }) => {
      const choice = body?.jobs ?? "keep";
      if (choice !== "keep" && choice !== "delete") fail(400, "Valid catalog item and deletion choice required");
      return deleteCatalogEntity(kind, params.entityId, choice);
    });
  }

  route("GET", `${base}/jobs/new/assignments`, ({ query }) => assignmentPage(null, query, false));
  route("GET", `${base}/jobs/new/assignments/targets`, ({ query }) => assignmentPage(null, query, true));
  route("GET", `${base}/jobs/:jobId/assignments`, ({ params, query }) => assignmentPage(params.jobId, query, false));
  route("GET", `${base}/jobs/:jobId/assignments/targets`, ({ params, query }) => assignmentPage(params.jobId, query, true));

  route("POST", `${base}/jobs`, ({ body }) => {
    const input = body?.job as JobInput | undefined;
    if (!input?.name?.trim() || !/^#[0-9A-Fa-f]{6}$/.test(input.color ?? "")) fail(400, "Valid job details and assignment changes required");
    const changes = (body.changes ?? []) as Change[];
    const job = createJob(input, input.department_id ?? null);
    const result = changes.length ? applyAssignments(String(job.id), changes) : { changed_count: 0, unchanged_count: 0 };
    return { ...result, job: jobView(full("jobs", stored.jobs().find((row) => row.id === job.id)!)) };
  });

  route("PATCH", `${base}/jobs/:jobId`, ({ params, body }) => {
    const row = stored.jobs().find((item) => item.id === params.jobId);
    if (!row || row.deleted_at) fail(404, "This job is no longer available");
    const changes = (body?.changes ?? []) as Change[];
    if (Boolean(body?.job) !== Boolean(body?.expected_job)) fail(400, "Valid job details and assignment changes required");
    if (!body?.job && !changes.length) fail(400, "Valid job details and assignment changes required");
    if (body.job) {
      const expected = body.expected_job as JobInput;
      const desired = body.job as JobInput;
      const same = (a: JobInput) => a.name.trim() === row.name && a.color === row.color && (a.department_id ?? null) === (row.department_id ?? null);
      if (!same(desired)) {
        if (!same(expected)) fail(409, "This job changed since you opened it. Reload it before saving.");
        if (desired.department_id) {
          const department = stored.departments().find((item) => item.id === desired.department_id);
          if (!department || department.archived_at || department.deleted_at) fail(400, "Choose an active department in this workspace");
        }
        try {
          updateRow("jobs", full("jobs", row), { name: desired.name, color: desired.color, department_id: desired.department_id ?? null, updated_at: nowIso() });
        } catch (error) {
          if ((error as { code?: string }).code === "23505") fail(409, "This job name already exists. Choose a unique name.");
          throw error;
        }
      }
    }
    const result = changes.length ? applyAssignments(params.jobId, changes) : { changed_count: 0, unchanged_count: 0 };
    return { ...result, job: jobView(full("jobs", row)) };
  });

  route("PATCH", `${base}/jobs/:jobId/assignments`, ({ params, body }) => {
    const changes = (body?.changes ?? []) as Change[];
    if (changes.length < 1) fail(400, "Valid employee assignment changes required");
    return applyAssignments(params.jobId, changes);
  });

  route("POST", "/v1/workspaces/:workspaceId/shift-types/reorder", ({ body }) => {
    reorder("shift_types", body?.orderedIds, "shift type");
    return undefined;
  });
  route("POST", "/v1/workspaces/:workspaceId/shift-labels/reorder", ({ body }) => {
    reorder("shift_labels", body?.orderedIds, "shift label");
    return undefined;
  });
}
