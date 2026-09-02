import {
  departmentInputSchema,
  departmentSchema,
  defaultScheduleLogoPlacement,
  jobInputSchema,
  jobSchema,
  locationInputSchema,
  locationSchema,
  organizationLogoMaxBytes,
  organizationLogoMimeTypes,
  importantDateInputSchema,
  importantDateSchema,
  schedulingSettingsInputSchema,
  schedulingSettingsSchema,
  shiftTypeInputSchema,
  shiftTypeSchema,
  workspaceSchema,
  type Department,
  type DepartmentInput,
  type ImportantDate,
  type ImportantDateInput,
  type Job,
  type JobInput,
  type Location,
  type LocationInput,
  type ScheduleLogoPlacement,
  type Workspace,
  type SchedulingSettings,
  type SchedulingSettingsInput,
  type ShiftType,
  type ShiftTypeInput,
} from "@newfork/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseClient } from "../lib/supabase";

function client(): SupabaseClient {
  if (!supabaseClient)
    throw new Error("Organization storage is not configured");
  return supabaseClient;
}

function message(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const logoBucket = "workspace-logos";

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
    if (current.logo_storage_path) {
      await client()
        .storage.from(logoBucket)
        .remove([current.logo_storage_path]);
    }
    return updateWorkspaceLogo(workspaceId, {
      logo_storage_path: null,
      logo_file_name: null,
      logo_updated_at: null,
      schedule_logo_scale: defaultScheduleLogoPlacement.scale,
      schedule_logo_offset_x: defaultScheduleLogoPlacement.offset_x,
      schedule_logo_offset_y: defaultScheduleLogoPlacement.offset_y,
      updated_at: new Date().toISOString(),
    });
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

  const updated = await updateWorkspaceLogo(workspaceId, {
    logo_storage_path: storagePath,
    logo_file_name: input.file.name,
    logo_updated_at: new Date().toISOString(),
    schedule_logo_scale: placement.scale,
    schedule_logo_offset_x: placement.offset_x,
    schedule_logo_offset_y: placement.offset_y,
    updated_at: new Date().toISOString(),
  });

  if (current.logo_storage_path && current.logo_storage_path !== storagePath) {
    await client().storage.from(logoBucket).remove([current.logo_storage_path]);
  }
  return updated;
}

async function loadWorkspaceLogo(workspaceId: string): Promise<{
  readonly logo_storage_path: string | null;
}> {
  const { data, error } = await client()
    .from("workspaces")
    .select("logo_storage_path")
    .eq("id", workspaceId)
    .single();
  message(error);
  return { logo_storage_path: data?.logo_storage_path ?? null };
}

async function updateWorkspaceLogo(
  workspaceId: string,
  values: Record<string, string | number | null>,
): Promise<Workspace> {
  const { data, error } = await client()
    .from("workspaces")
    .update(values)
    .eq("id", workspaceId)
    .select(
      "id,name,logo_storage_path,logo_file_name,logo_updated_at,schedule_logo_scale,schedule_logo_offset_x,schedule_logo_offset_y",
    )
    .single();
  message(error);
  if (!data) throw new Error("Organization settings were not found");
  return workspaceFromLogoRow(data);
}

function workspaceFromLogoRow(row: {
  readonly id: string;
  readonly name: string;
  readonly logo_storage_path: string | null;
  readonly logo_file_name: string | null;
  readonly logo_updated_at: string | null;
  readonly schedule_logo_scale: number | null;
  readonly schedule_logo_offset_x: number | null;
  readonly schedule_logo_offset_y: number | null;
}): Workspace {
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
  const { error } = await client()
    .from("workspaces")
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq("id", workspaceId);
  message(error);
}

export async function listLocations(workspaceId: string): Promise<Location[]> {
  const { data, error } = await client()
    .from("locations")
    .select(
      "id,workspace_id,name,street_address,city,region,postal_code,country_code,timezone,sort_order,archived_at",
    )
    .eq("workspace_id", workspaceId)
    .order("sort_order")
    .order("name");
  message(error);
  return locationSchema.array().parse(data ?? []);
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
  const { error } = await query;
  message(error);
}

export async function setLocationArchived(
  workspaceId: string,
  id: string,
  archived: boolean,
): Promise<void> {
  const { error } = await client()
    .from("locations")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  message(error);
}

export async function listDepartments(
  workspaceId: string,
): Promise<Department[]> {
  const { data, error } = await client()
    .from("departments")
    .select("id,workspace_id,name,color,sort_order,archived_at")
    .eq("workspace_id", workspaceId)
    .order("sort_order")
    .order("name");
  message(error);
  return departmentSchema.array().parse(data ?? []);
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
  const { data, error } = await client()
    .from("jobs")
    .select("id,workspace_id,department_id,name,color,sort_order,archived_at")
    .eq("workspace_id", workspaceId)
    .order("sort_order")
    .order("name");
  message(error);
  return jobSchema.array().parse(data ?? []);
}

export async function saveJob(
  workspaceId: string,
  input: JobInput,
  id?: string,
): Promise<void> {
  const values = jobInputSchema.parse(input);
  const query = id
    ? client()
        .from("jobs")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", workspaceId)
    : client()
        .from("jobs")
        .insert({ ...values, workspace_id: workspaceId });
  const { error } = await query;
  message(error);
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

export async function reorderOrganizationEntities(
  workspaceId: string,
  entityType: "departments" | "jobs",
  orderedIds: readonly string[],
): Promise<void> {
  const { error } = await client().rpc("reorder_organization_entities", {
    target_workspace_id: workspaceId,
    entity_type: entityType,
    ordered_ids: [...orderedIds],
  });
  message(error);
}

export async function loadSchedulingSettings(
  workspaceId: string,
): Promise<SchedulingSettings> {
  const { data, error } = await client()
    .from("workspace_scheduling_settings")
    .select(
      "workspace_id,week_start_day,schedule_deadline_day,conflict_policy,availability_enforcement,time_format",
    )
    .eq("workspace_id", workspaceId)
    .single();
  message(error);
  return schedulingSettingsSchema.parse(data);
}

export async function saveSchedulingSettings(
  workspaceId: string,
  input: SchedulingSettingsInput,
): Promise<void> {
  const values = schedulingSettingsInputSchema.parse(input);
  const { error } = await client()
    .from("workspace_scheduling_settings")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId);
  message(error);
}

export async function listImportantDates(
  workspaceId: string,
): Promise<ImportantDate[]> {
  const { data, error } = await client()
    .from("important_dates")
    .select(
      "id,workspace_id,location_id,title,type,starts_on,ends_on,recurrence,note,affects_scheduling,archived_at,locations(name)",
    )
    .eq("workspace_id", workspaceId)
    .order("starts_on", { ascending: true })
    .order("title");
  message(error);
  return importantDateSchema.array().parse(
    (data ?? []).map((row) => ({
      ...row,
      location_name:
        typeof row.locations === "object" &&
        row.locations !== null &&
        "name" in row.locations
          ? row.locations.name
          : null,
    })),
  );
}

export async function saveImportantDate(
  workspaceId: string,
  input: ImportantDateInput,
  id?: string,
): Promise<void> {
  const values = importantDateInputSchema.parse(input);
  const query = id
    ? client()
        .from("important_dates")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", workspaceId)
    : client()
        .from("important_dates")
        .insert({ ...values, workspace_id: workspaceId });
  const { error } = await query;
  message(error);
}

export async function setImportantDateArchived(
  workspaceId: string,
  id: string,
  archived: boolean,
): Promise<void> {
  const { error } = await client()
    .from("important_dates")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId);
  message(error);
}

export async function listShiftTypes(
  workspaceId: string,
): Promise<ShiftType[]> {
  const { data, error } = await client()
    .from("shift_types")
    .select(
      "id,workspace_id,name,color,default_start_time,default_end_time,crosses_midnight,sort_order,archived_at",
    )
    .eq("workspace_id", workspaceId)
    .order("sort_order")
    .order("name");
  message(error);
  return shiftTypeSchema.array().parse(
    (data ?? []).map((row) => ({
      ...row,
      default_start_time:
        typeof row.default_start_time === "string"
          ? row.default_start_time.slice(0, 5)
          : null,
      default_end_time:
        typeof row.default_end_time === "string"
          ? row.default_end_time.slice(0, 5)
          : null,
    })),
  );
}

export async function saveShiftType(
  workspaceId: string,
  input: ShiftTypeInput,
  id?: string,
): Promise<void> {
  const values = shiftTypeInputSchema.parse(input);
  const query = id
    ? client()
        .from("shift_types")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", workspaceId)
    : client()
        .from("shift_types")
        .insert({ ...values, workspace_id: workspaceId });
  const { error } = await query;
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
  const { error } = await client().rpc("reorder_shift_types", {
    target_workspace_id: workspaceId,
    ordered_ids: [...orderedIds],
  });
  message(error);
}
