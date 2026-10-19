import { RequestError, requestFailure } from "../lib/request-error";
import {
  departmentInputSchema,
  defaultScheduleLogoPlacement,
  jobInputSchema,
  jobSchema,
  locationInputSchema,
  managementAndOwnerSentence,
  organizationLogoMaxBytes,
  organizationLogoMimeTypes,
  schedulingSettingsInputSchema,
  schedulingSettingsSchema,
  shiftLabelInputSchema,
  shiftTypeInputSchema,
  workspaceSchema,
  type Department,
  type DepartmentInput,
  type Job,
  type JobInput,
  type Location,
  type LocationInput,
  type ScheduleLogoPlacement,
  type Workspace,
  type SchedulingSettings,
  type SchedulingSettingsInput,
  type ShiftLabel,
  type ShiftLabelInput,
  type ShiftType,
  type ShiftTypeInput,
} from "@newfork/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseClient } from "../lib/supabase";

import { readSettings } from "../lib/settings-read";
function client(): SupabaseClient {
  if (!supabaseClient)
    throw new Error("Organization storage is not configured");
  return supabaseClient;
}

// BL-1009: the database keeps active names unique; the person reads which name is taken.
const NAME_TAKEN: Readonly<Record<string, string>> = {
  shift_types_workspace_active_name_idx: "A shift type with this name already exists. Choose another name.",
  shift_labels_workspace_active_name_idx: "A label with this name already exists. Choose another name.",
};

// The shape of a machine key the database raises in `hint` ("catalog.deleted"),
// as the API reads it (apps/api/src/http-error.ts); Postgres's own hints are
// sentences.
const REASON_KEY = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

function message(error: { code?: string; message: string; hint?: string | null } | null): void {
  if (!error) return;
  if (error.code === "23505") {
    const taken = Object.entries(NAME_TAKEN).find(([index]) => error.message.includes(index));
    if (taken) throw new Error(taken[1]);
  }
  // Settings → Jobs writes straight to the tables, so the database's refusal to
  // let go of Management or the Owner job lands here, not at the API (BL-218).
  const sentence = managementAndOwnerSentence(error.hint);
  if (sentence) throw new RequestError(sentence, error.hint ?? undefined);
  // BL-1045: any other refusal the database keyed keeps its key, so the screen
  // can tell "deleted meanwhile, reload" from a standing no. The sentence stays.
  if (error.hint && REASON_KEY.test(error.hint))
    throw new RequestError(error.message, error.hint, undefined, error.code === "PT409" ? 409 : undefined);
  throw new Error(error.message);
}

const logoBucket = "workspace-logos";

export async function organizationRequest(
  workspaceId: string,
  path: string,
  init: RequestInit = {},
) {
  const storage = client();
  const token =
    (await storage.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("A current session is required");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:9999" : "")}/v1/workspaces/${workspaceId}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    },
  );
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok)
    throw requestFailure(body, response.status, "Organization settings operation failed");
  return body;
}

const request = organizationRequest;

export async function saveScheduleLogo(
  workspaceId: string,
  input: {
    readonly file: File | null;
    readonly removeLogo: boolean;
    readonly placement: ScheduleLogoPlacement;
  },
): Promise<Workspace> {
  const placement = workspaceSchema.shape.schedule_logo_placement.parse(
    input.placement,
  );
  const current = await loadWorkspaceLogo(workspaceId);

  if (input.removeLogo) {
    let removed: Workspace;
    try {
      removed = await updateWorkspaceLogo(workspaceId, {
        logo_storage_path: null,
        logo_file_name: null,
        logo_updated_at: null,
        schedule_logo_scale: defaultScheduleLogoPlacement.scale,
        schedule_logo_offset_x: defaultScheduleLogoPlacement.offset_x,
        schedule_logo_offset_y: defaultScheduleLogoPlacement.offset_y,
        updated_at: new Date().toISOString(),
      });
    } catch (failure) {
      // BL-1033: the file goes only once the workspace stopped pointing at it.
      const row = current.logo_storage_path
        ? await rowAfterFailedWrite(workspaceId, null)
        : "not-saved";
      if (typeof row === "string") throw failure;
      removed = row;
    }
    if (current.logo_storage_path) {
      await client()
        .storage.from(logoBucket)
        .remove([current.logo_storage_path]);
    }
    return removed;
  }

  if (!input.file) {
    return updateWorkspaceLogo(workspaceId, {
      schedule_logo_scale: placement.scale,
      schedule_logo_offset_x: placement.offset_x,
      schedule_logo_offset_y: placement.offset_y,
      updated_at: new Date().toISOString(),
    });
  }

  validateLogoFile(input.file);
  const storagePath = `${workspaceId}/logo/${crypto.randomUUID()}${logoExtension(input.file)}`;
  const upload = await client()
    .storage.from(logoBucket)
    .upload(storagePath, input.file, {
      cacheControl: "3600",
      contentType: input.file.type,
      upsert: false,
    });
  message(upload.error);

  let updated: Workspace;
  try {
    updated = await updateWorkspaceLogo(workspaceId, {
      logo_storage_path: storagePath,
      logo_file_name: input.file.name,
      logo_updated_at: new Date().toISOString(),
      schedule_logo_scale: placement.scale,
      schedule_logo_offset_x: placement.offset_x,
      schedule_logo_offset_y: placement.offset_y,
      updated_at: new Date().toISOString(),
    });
  } catch (failure) {
    const row = await rowAfterFailedWrite(workspaceId, storagePath);
    // The workspace may already show this file: keep it.
    if (row === "unknown") throw failure;
    if (row === "not-saved") {
      // BL-912: nothing points at the new file; take it back out (best effort,
      // the write's own error is the one the screen shows).
      await client()
        .storage.from(logoBucket)
        .remove([storagePath])
        .catch(() => undefined);
      throw failure;
    }
    updated = row;
  }

  if (current.logo_storage_path && current.logo_storage_path !== storagePath) {
    await client().storage.from(logoBucket).remove([current.logo_storage_path]);
  }
  return updated;
}

const logoColumns =
  "id,name,logo_storage_path,logo_file_name,logo_updated_at,schedule_logo_scale,schedule_logo_offset_x,schedule_logo_offset_y";

async function loadWorkspaceLogo(workspaceId: string): Promise<LogoRow> {
  const { data, error } = await client()
    .from("workspaces")
    .select(logoColumns)
    .eq("id", workspaceId)
    .single();
  message(error);
  if (!data) throw new Error("Organization settings were not found");
  return data;
}

// BL-1033: a write can land and its answer still be lost on the way back, so
// after a failure the row decides before any file is touched. It points at
// `path`: the save landed. It points elsewhere: it did not. It cannot be
// read: nobody knows, and no file is removed.
async function rowAfterFailedWrite(
  workspaceId: string,
  path: string | null,
): Promise<Workspace | "not-saved" | "unknown"> {
  let row: LogoRow;
  try {
    row = await loadWorkspaceLogo(workspaceId);
  } catch {
    return "unknown";
  }
  return row.logo_storage_path === path ? workspaceFromLogoRow(row) : "not-saved";
}

async function updateWorkspaceLogo(
  workspaceId: string,
  values: Record<string, string | number | null>,
): Promise<Workspace> {
  const { data, error } = await client()
    .from("workspaces")
    .update(values)
    .eq("id", workspaceId)
    .select(logoColumns)
    .single();
  message(error);
  if (!data) throw new Error("Organization settings were not found");
  return workspaceFromLogoRow(data);
}

type LogoRow = {
  readonly id: string;
  readonly name: string;
  readonly logo_storage_path: string | null;
  readonly logo_file_name: string | null;
  readonly logo_updated_at: string | null;
  readonly schedule_logo_scale: number | null;
  readonly schedule_logo_offset_x: number | null;
  readonly schedule_logo_offset_y: number | null;
};

function workspaceFromLogoRow(row: LogoRow): Workspace {
  const logo_url = row.logo_storage_path
    ? client().storage.from(logoBucket).getPublicUrl(row.logo_storage_path).data
        .publicUrl
    : null;
  return workspaceSchema.parse({
    id: row.id,
    name: row.name,
    logo_url,
    logo_file_name: row.logo_file_name,
    logo_updated_at: row.logo_updated_at,
    schedule_logo_placement: {
      scale: row.schedule_logo_scale ?? defaultScheduleLogoPlacement.scale,
      offset_x:
        row.schedule_logo_offset_x ?? defaultScheduleLogoPlacement.offset_x,
      offset_y:
        row.schedule_logo_offset_y ?? defaultScheduleLogoPlacement.offset_y,
    },
  });
}

function validateLogoFile(file: File): void {
  if (!(organizationLogoMimeTypes as readonly string[]).includes(file.type)) {
    throw new Error("Use an SVG, PNG, JPEG, or WebP image.");
  }
  if (file.size <= 0) throw new Error("The selected image is empty.");
  if (file.size > organizationLogoMaxBytes) {
    throw new Error("Logo must be 5 MB or smaller.");
  }
}

function logoExtension(file: File): string {
  if (file.type === "image/svg+xml") return ".svg";
  if (file.type === "image/webp") return ".webp";
  if (file.type === "image/png") return ".png";
  return ".jpg";
}

export async function updateOrganizationName(
  workspaceId: string,
  name: string,
): Promise<void> {
  const { data, error } = await client()
    .from("workspaces")
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq("id", workspaceId)
    .select("id");
  message(error);
  // BL-913: RLS refuses by changing no row, not with an error.
  if (!data?.length) throw new Error("The workspace name wasn't saved: your role can't change it.");
}

export async function listLocations(workspaceId: string): Promise<Location[]> {
  return readSettings(workspaceId, "locations");
}

export async function saveLocation(
  workspaceId: string,
  input: LocationInput,
  id?: string,
): Promise<void> {
  const values = locationInputSchema.parse(input);
  const query = id
    ? client()
        .from("locations")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", workspaceId)
    : client()
        .from("locations")
        .insert({ ...values, workspace_id: workspaceId });
  locationMessage(await query);
}

function locationMessage({
  error,
}: {
  error: { code?: string; message: string; hint?: string | null } | null;
}): void {
  if (
    error?.code === "23505" &&
    error.message.includes("locations_workspace_short_name")
  ) {
    throw new Error(
      "This short name is already used in this workspace. Choose another one.",
    );
  }
  message(error);
}

export async function setLocationArchived(
  workspaceId: string,
  id: string,
  archived: boolean,
): Promise<void> {
  locationMessage(
    await client()
      .from("locations")
      .update({
        archived_at: archived ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", workspaceId),
  );
}

/** Departments and jobs together: one read, one request. */
export async function loadDepartmentsAndJobs(workspaceId: string) {
  return readSettings(workspaceId, "jobs");
}

export async function listDepartments(
  workspaceId: string,
): Promise<Department[]> {
  return (await readSettings(workspaceId, "jobs")).departments;
}

export async function saveDepartment(
  workspaceId: string,
  input: DepartmentInput,
  id?: string,
): Promise<void> {
  const values = departmentInputSchema.parse(input);
  const query = id
    ? client()
        .from("departments")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", workspaceId)
    : client()
        .from("departments")
        .insert({ ...values, workspace_id: workspaceId });
  const { error } = await query;
  message(error);
}

export async function setDepartmentArchived(
  workspaceId: string,
  id: string,
  archived: boolean,
): Promise<void> {
  const { error } = await client()
    .from("departments")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  message(error);
}

export async function listJobs(workspaceId: string): Promise<Job[]> {
  return (await readSettings(workspaceId, "jobs")).jobs;
}

export async function saveJob(
  workspaceId: string,
  input: JobInput,
  id?: string,
): Promise<Job> {
  const values = jobInputSchema.parse(input);
  // AVATAR-IKON: a new job may come with its drawings (left out, the database suggests them), but the
  // browser has no grant to change them later; the job drawer's save does that through the API.
  const { lineup_icons: _drawings, ...details } = values;
  const columns =
    "id,workspace_id,department_id,name,color,archived_at,system_key,lineup_icons";
  const query = id
    ? client()
        .from("jobs")
        .update({ ...details, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select(columns)
        .single()
    : client()
        .from("jobs")
        .insert({ ...values, workspace_id: workspaceId })
        .select(columns)
        .single();
  const { data, error } = await query;
  message(error);
  return jobSchema.parse(data);
}

export async function setJobArchived(
  workspaceId: string,
  id: string,
  archived: boolean,
): Promise<void> {
  const { error } = await client()
    .from("jobs")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  message(error);
}

export async function loadSchedulingSettings(
  workspaceId: string,
): Promise<SchedulingSettings> {
  return schedulingSettingsSchema.parse(
    await request(workspaceId, "/scheduling-settings"),
  );
}

export async function saveSchedulingSettings(
  workspaceId: string,
  input: SchedulingSettingsInput,
): Promise<void> {
  const values = schedulingSettingsInputSchema.parse(input);
  await request(workspaceId, "/scheduling-settings", {
    method: "PUT",
    body: JSON.stringify(values),
  });
}

export async function listShiftTypes(
  workspaceId: string,
): Promise<ShiftType[]> {
  return readSettings(workspaceId, "shift-types");
}

export async function saveShiftType(
  workspaceId: string,
  input: ShiftTypeInput,
  id?: string,
  expectedDefaultRevision?: number,
): Promise<void> {
  const values = shiftTypeInputSchema.parse(input);
  if (!values.default_start_time || !values.default_end_time)
    throw new Error("Set default start and end times for this shift type.");
  if (id) {
    if (
      !Number.isInteger(expectedDefaultRevision) ||
      expectedDefaultRevision! < 1
    )
      throw new Error("Reload this shift type before saving its defaults.");
    const { data, error } = await client()
      .from("shift_types")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .eq("default_revision", expectedDefaultRevision!)
      .select("id")
      .maybeSingle();
    message(error);
    if (!data)
      throw new Error(
        "This shift type changed or is no longer editable. Reload the latest defaults before saving.",
      );
    return;
  }
  const { error } = await client()
    .from("shift_types")
    .insert({ ...values, workspace_id: workspaceId });
  message(error);
}

export async function setShiftTypeArchived(
  workspaceId: string,
  id: string,
  archived: boolean,
): Promise<void> {
  const { error } = await client()
    .from("shift_types")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  message(error);
}

export async function reorderShiftTypes(
  workspaceId: string,
  orderedIds: readonly string[],
): Promise<void> {
  await request(workspaceId, "/shift-types/reorder", {
    method: "POST",
    body: JSON.stringify({ orderedIds: [...orderedIds] }),
  });
}

export async function listShiftLabels(
  workspaceId: string,
): Promise<ShiftLabel[]> {
  return readSettings(workspaceId, "shift-labels");
}

export async function saveShiftLabel(
  workspaceId: string,
  input: ShiftLabelInput,
  id?: string,
): Promise<void> {
  const values = shiftLabelInputSchema.parse(input);
  const query = id
    ? client()
        .from("shift_labels")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", workspaceId)
    : client()
        .from("shift_labels")
        .insert({ ...values, workspace_id: workspaceId });
  const { error } = await query;
  message(error);
}

export async function setShiftLabelArchived(
  workspaceId: string,
  id: string,
  archived: boolean,
): Promise<void> {
  const { error } = await client()
    .from("shift_labels")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  message(error);
}

export async function reorderShiftLabels(
  workspaceId: string,
  orderedIds: readonly string[],
): Promise<void> {
  await request(workspaceId, "/shift-labels/reorder", {
    method: "POST",
    body: JSON.stringify({ orderedIds: [...orderedIds] }),
  });
}
