// Owner setup (/onboarding) in the demo backend: a fresh workspace the owner
// has just created, walked through its four steps. Follows
// app_private.apply_owner_onboarding_update and reset_owner_onboarding_service
// in supabase/schema.sql: revision checks, Management with Manager and Owner
// from the first save, the finishing rules, and the reset that clears it all.
// Locations, departments and jobs are written straight to the tables by the
// web (organization-data.ts), so those writes are answered here too.
import * as shared from "@newfork/shared";
import { domainStore } from "./store";
import { uuid } from "./time";
import {
  contextIn, fail, handleTable, HARBOR, nowIso,
  type Route, type TableError, type TableOp, type TableResult,
} from "./hub-onboarding-shared";

/** The draft workspace "Create your workspace" made. */
export const DRAFT_ID = "d7af7e5a-6b1c-4e3d-8f5a-2c4e6a8b0d96";
// The name CreateOrganizationButton gives a new workspace; step 1 asks for the real one.
const DRAFT_NAME = "New workspace";

interface LocationRow {
  id: string; workspace_id: string; name: string; short_name: string; phone: string | null;
  street_address: string; city: string; region: string; postal_code: string; country_code: string;
  timezone: string; sort_order: number; archived_at: string | null;
}
interface DepartmentRow { id: string; workspace_id: string; name: string; color: string; archived_at: string | null; system_key: "management" | null }
interface JobRow { id: string; workspace_id: string; department_id: string | null; name: string; color: string; archived_at: string | null; system_key: "owner" | null }
interface Setup {
  name: string;
  step: 1 | 2 | 3 | 4;
  revision: number;
  /** Finish was pressed; the atlas keeps the setup open so it can be walked again. */
  finishedAt: string | null;
  ownerEmployeeId: string | null;
  ownerName: { first: string; middle: string; last: string } | null;
  locations: LocationRow[];
  departments: DepartmentRow[];
  jobs: JobRow[];
  team: { id: string; name: string; email: string; location_ids: string[]; job_ids: string[] }[];
  intents: { employeeId: string; email: string }[];
}

const seed = (): Setup => ({
  name: DRAFT_NAME, step: 1, revision: 1, finishedAt: null, ownerEmployeeId: null, ownerName: null,
  locations: [], departments: [], jobs: [], team: [], intents: [],
});
const store = domainStore<Setup>("owner-setup", seed);
const setup = () => store.data;

const live = <T extends { archived_at: string | null }>(rows: T[]) => rows.filter((row) => !row.archived_at);

export function ownerSetupContext() {
  return contextIn({ id: DRAFT_ID, name: setup().name }, "owner", {
    // Never "complete" here: the wizard sends a finished owner to /app, which is another atlas page.
    status: "incomplete", currentStep: setup().step, revision: setup().revision,
  });
}

export function ownerSetupWorkspaces() {
  return [
    {
      id: HARBOR.id, name: HARBOR.name, role: "owner", status: "active", isActive: true,
      onboarding: { status: "complete", currentStep: 4, revision: 1 }, lifecycleStatus: "active",
      lastUsedAt: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
      id: DRAFT_ID, name: setup().name, role: "owner", status: "active", isActive: false,
      onboarding: { status: "incomplete", currentStep: setup().step, revision: setup().revision },
      lifecycleStatus: "draft", lastUsedAt: nowIso(),
    },
  ];
}

const pgError = (code: string, message: string, hint: string | null = null): TableResult =>
  ({ data: null, error: { code, message, hint, details: null } satisfies TableError });
const unique = (index: string) => pgError("23505", `duplicate key value violates unique constraint "${index}"`);
const systemRecord = () => pgError("23514", "system catalog record cannot be archived", "catalog.system_record");

function rowResult(op: TableOp, row: unknown): TableResult {
  return { data: op.single ? row : row ? [row] : [], error: null };
}

/** Management, Manager and Owner: made with the first save of step 1. */
function ensureManagement(): void {
  const data = setup();
  if (data.departments.some((one) => one.system_key === "management")) return;
  const management: DepartmentRow = { id: uuid(), workspace_id: DRAFT_ID, name: "Management", color: "#3C7A68", archived_at: null, system_key: "management" };
  data.departments.push(management);
  data.jobs.push(
    { id: uuid(), workspace_id: DRAFT_ID, department_id: management.id, name: "Manager", color: "#4478A8", archived_at: null, system_key: null },
    { id: uuid(), workspace_id: DRAFT_ID, department_id: management.id, name: "Owner", color: "#4478A8", archived_at: null, system_key: "owner" },
  );
}

function locationsTable(op: TableOp): TableResult {
  const data = setup();
  const values = op.values ?? {};
  if (op.op === "insert") {
    const name = String(values.name ?? "").trim();
    const short = String(values.short_name ?? "").trim();
    if (live(data.locations).some((one) => one.name.toLowerCase() === name.toLowerCase())) return unique("locations_workspace_active_name_idx");
    if (live(data.locations).some((one) => one.short_name.toLowerCase() === short.toLowerCase())) return unique("locations_workspace_short_name");
    const row: LocationRow = {
      id: uuid(), workspace_id: DRAFT_ID, name, short_name: short,
      phone: (values.phone as string | null | undefined) ?? null,
      street_address: String(values.street_address ?? ""), city: String(values.city ?? ""),
      region: String(values.region ?? ""), postal_code: String(values.postal_code ?? ""),
      country_code: String(values.country_code ?? "US"), timezone: String(values.timezone ?? ""),
      sort_order: data.locations.length, archived_at: null,
    };
    data.locations.push(row);
    store.save();
    return rowResult(op, row);
  }
  const row = data.locations.find((one) => one.id === op.filters.id);
  if (op.op === "update") {
    if (!row) return { data: op.single ? null : [], error: null };
    const next = { ...row, ...values } as LocationRow;
    if (!next.archived_at) {
      const others = live(data.locations).filter((one) => one.id !== row.id);
      if (others.some((one) => one.name.toLowerCase() === next.name.toLowerCase())) return unique("locations_workspace_active_name_idx");
      if (others.some((one) => one.short_name.toLowerCase() === next.short_name.toLowerCase())) return unique("locations_workspace_short_name");
    }
    const { updated_at: _updated, ...kept } = next as LocationRow & { updated_at?: string };
    Object.assign(row, kept);
    store.save();
    return rowResult(op, row);
  }
  return { data: op.single ? row ?? null : live(data.locations), error: null };
}

function departmentsTable(op: TableOp): TableResult {
  const data = setup();
  const values = op.values ?? {};
  if (op.op === "insert") {
    const name = String(values.name ?? "").trim();
    if (live(data.departments).some((one) => one.name.toLowerCase() === name.toLowerCase())) return unique("departments_workspace_active_name_idx");
    const row: DepartmentRow = { id: uuid(), workspace_id: DRAFT_ID, name, color: String(values.color ?? "#3C7A68"), archived_at: null, system_key: null };
    data.departments.push(row);
    store.save();
    return rowResult(op, row);
  }
  const row = data.departments.find((one) => one.id === op.filters.id);
  if (op.op === "update") {
    if (!row) return { data: op.single ? null : [], error: null };
    if (row.system_key && values.archived_at) return systemRecord();
    if (values.name !== undefined) {
      const name = String(values.name).trim();
      if (live(data.departments).some((one) => one.id !== row.id && one.name.toLowerCase() === name.toLowerCase())) return unique("departments_workspace_active_name_idx");
      row.name = name;
    }
    if (values.color !== undefined) row.color = String(values.color);
    if ("archived_at" in values) row.archived_at = (values.archived_at as string | null) ?? null;
    store.save();
    return rowResult(op, row);
  }
  return { data: op.single ? row ?? null : live(data.departments), error: null };
}

function jobsTable(op: TableOp): TableResult {
  const data = setup();
  const values = op.values ?? {};
  if (op.op === "insert") {
    const name = String(values.name ?? "").trim();
    if (live(data.jobs).some((one) => one.name.toLowerCase() === name.toLowerCase())) return unique("jobs_workspace_active_name_idx");
    const row: JobRow = {
      id: uuid(), workspace_id: DRAFT_ID, department_id: (values.department_id as string | null) ?? null,
      name, color: String(values.color ?? "#4478A8"), archived_at: null, system_key: null,
    };
    data.jobs.push(row);
    store.save();
    return rowResult(op, row);
  }
  const row = data.jobs.find((one) => one.id === op.filters.id);
  if (op.op === "update") {
    if (!row) return { data: op.single ? null : [], error: null };
    if (row.system_key && values.archived_at) return systemRecord();
    if (row.system_key === "owner" && "department_id" in values && values.department_id !== row.department_id) return systemRecord();
    if (values.name !== undefined) {
      const name = String(values.name).trim();
      if (live(data.jobs).some((one) => one.id !== row.id && one.name.toLowerCase() === name.toLowerCase())) return unique("jobs_workspace_active_name_idx");
      row.name = name;
    }
    if (values.color !== undefined) row.color = String(values.color);
    if ("department_id" in values) row.department_id = (values.department_id as string | null) ?? null;
    if ("archived_at" in values) row.archived_at = (values.archived_at as string | null) ?? null;
    store.save();
    return rowResult(op, row);
  }
  return { data: op.single ? row ?? null : live(data.jobs), error: null };
}

// A rough ZIP-to-zone table (the real API asks a postal service and geo-tz).
const zipZones: [RegExp, string][] = [
  [/^(96[7-8])/, "Pacific/Honolulu"], [/^(99[5-9])/, "America/Anchorage"],
  [/^(8[5-6])/, "America/Phoenix"], [/^(9|83[2-8])/, "America/Los_Angeles"],
  [/^(8|59|57[7]|69[0-3])/, "America/Denver"],
  [/^(3[5-9]|4[6-9][0-9]|5[0-6]|6|7)/, "America/Chicago"],
  [/^[0-4]/, "America/New_York"],
];

export function ownerSetupRoutes(route: Route): void {
  handleTable("locations", locationsTable);
  handleTable("departments", departmentsTable);
  handleTable("jobs", jobsTable);

  const own = (workspaceId: string) => {
    if (workspaceId !== DRAFT_ID) fail(404, "Workspace not found");
    return setup();
  };

  route("GET", "/v1/context", () => ownerSetupContext());
  route("GET", "/v1/account/workspaces", () => ownerSetupWorkspaces());

  route("GET", "/v1/workspaces/:workspaceId/settings/locations", ({ params }) =>
    own(params.workspaceId).locations.map((row) => ({ ...row })));
  route("GET", "/v1/workspaces/:workspaceId/settings/jobs", ({ params }) => {
    const data = own(params.workspaceId);
    return { departments: data.departments.map((row) => ({ ...row })), jobs: data.jobs.map((row) => ({ ...row })) };
  });

  route("PATCH", "/v1/workspaces/:workspaceId/owner-onboarding", ({ params, body }) => {
    const data = own(params.workspaceId);
    const name = shared.workspaceNameInputSchema.safeParse(body?.workspaceName);
    const step = Number(body?.nextStep);
    if (!name.success || ![1, 2, 3, 4].includes(step) || typeof body?.complete !== "boolean")
      fail(400, "Valid onboarding details required");
    if (body.expectedRevision != null && body.expectedRevision !== data.revision)
      fail(409, "owner onboarding revision conflict");
    const complete = body.complete === true;
    if (complete && live(data.locations).length === 0)
      fail(400, "at least one active location is required to complete owner onboarding");
    const management = data.departments.find((one) => one.system_key === "management");
    if (complete && !live(data.departments).some((one) => !one.system_key))
      fail(400, "at least one department of your own is required to complete owner onboarding");
    if (complete && !live(data.jobs).some((job) => job.department_id !== management?.id))
      fail(400, "at least one job outside Management is required to complete owner onboarding");
    const first = String(body.ownerFirstName ?? "").trim();
    const middle = String(body.ownerMiddleName ?? "").trim();
    const last = String(body.ownerLastName ?? "").trim();
    const namesGiven = Boolean(first || middle || last);
    if (!namesGiven && !data.ownerName) fail(400, "the owner's legal name is required");
    data.name = name.data;
    data.step = step as Setup["step"];
    data.revision += 1;
    if (complete) data.finishedAt = nowIso();
    if (namesGiven) data.ownerName = { first, middle, last };
    data.ownerEmployeeId ??= uuid();
    ensureManagement();
    store.save();
    return undefined;
  });

  route("POST", "/v1/workspaces/:workspaceId/owner-onboarding/invitation-intents", ({ params, body }) => {
    const data = own(params.workspaceId);
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !body?.employeeId)
      fail(400, "Valid invitation intent details required");
    if (!data.team.some((one) => one.id === body.employeeId)) fail(404, "employee not found");
    data.intents = data.intents.filter((one) => one.employeeId !== body.employeeId);
    data.intents.push({ employeeId: body.employeeId, email });
    store.save();
    return undefined;
  });

  route("POST", "/v1/workspaces/:workspaceId/owner-onboarding/reset", ({ params }) => {
    const data = own(params.workspaceId);
    // Everything but the owner's own record goes; the workspace keeps its name.
    data.locations = [];
    data.departments = [];
    data.jobs = [];
    data.team = [];
    data.intents = [];
    data.step = 1;
    data.finishedAt = null;
    store.save();
    return undefined;
  });

  // The team step saves people like the Employees drawer does.
  route("POST", "/v1/workspaces/:workspaceId/employees", ({ params, body }) => {
    const data = own(params.workspaceId);
    const parsed = shared.employeeInputSchema.safeParse(body);
    if (!parsed.success) fail(400, parsed.error.issues[0]?.message ?? "Valid employee details required");
    const input = parsed.data;
    const email = input.invitation_email.trim().toLowerCase();
    const ownerJob = data.jobs.find((job) => job.system_key === "owner");
    if (ownerJob && input.job_ids.includes(ownerJob.id))
      fail(400, shared.managementAndOwnerRefusals["employee.owner_job"], { reason: "employee.owner_job" });
    const id = uuid();
    data.team.push({
      id, name: `${input.first_name} ${input.last_name}`, email,
      location_ids: input.location_ids, job_ids: input.job_ids,
    });
    store.save();
    return { id };
  });

  route("GET", "/v1/location-timezone-suggestion", ({ query }) => {
    const country = (query.get("country") ?? "").toUpperCase();
    const postal = (query.get("postal") ?? "").trim();
    if (!/^[A-Z]{2}$/.test(country) || postal.length < 2) fail(400, "Valid country and postal code required");
    const unavailable = { timezone: null, status: "unavailable", source: "postal_centroid" };
    if (country !== "US" || !/^\d{5}$/.test(postal)) return unavailable;
    const zone = zipZones.find(([pattern]) => pattern.test(postal))?.[1];
    return zone ? { timezone: zone, status: "suggested", source: "postal_centroid" } : unavailable;
  });
}
