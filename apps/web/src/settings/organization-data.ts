import {
  departmentInputSchema,
  departmentSchema,
  jobInputSchema,
  jobSchema,
  locationInputSchema,
  locationSchema,
  schedulingSettingsInputSchema,
  schedulingSettingsSchema,
  shiftTypeInputSchema,
  shiftTypeSchema,
  type Department,
  type DepartmentInput,
  type Job,
  type JobInput,
  type Location,
  type LocationInput,
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
      "workspace_id,week_start_day,schedule_deadline_day,conflict_policy,availability_enforcement",
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
