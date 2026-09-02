import {
  employeeDetailSchema,
  employeeInputSchema,
  employeeSummarySchema,
  type EmployeeDetail,
  type EmployeeInput,
  type EmployeeSummary,
  type WorkspaceRole,
} from "@newfork/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseClient } from "../lib/supabase";

export interface EmployeeOption {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
}

export interface EmployeeReferenceData {
  readonly locations: readonly EmployeeOption[];
  readonly jobs: readonly EmployeeOption[];
  readonly inviteRoles: readonly InviteRoleOption[];
}

export interface InviteRoleOption {
  readonly id: string;
  readonly name: string;
  readonly systemKey: WorkspaceRole | null;
  readonly accessClass: WorkspaceRole;
}

export interface PreparedInvitation {
  readonly id: string;
  readonly expiresAt: string;
  readonly developmentUrl?: string;
}

export interface InvitationPreview {
  readonly workspaceName: string;
  readonly emailHint: string;
  readonly expiresAt: string;
}

function client(): SupabaseClient {
  if (!supabaseClient) throw new Error("Employee storage is not configured");
  return supabaseClient;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function listEmployees(
  workspaceId: string,
  archived: boolean,
  search: string,
  status: string,
): Promise<EmployeeSummary[]> {
  const { data, error } = await client().rpc("list_employees", {
    target_workspace_id: workspaceId,
    include_archived: archived,
    search_text: search,
    status_filter: archived ? "all" : status,
    page_limit: 100,
    page_offset: 0,
  });
  check(error);
  return employeeSummarySchema.array().parse(data ?? []);
}

export async function getEmployeeDetail(
  workspaceId: string,
  employeeId: string,
): Promise<EmployeeDetail> {
  const { data, error } = await client().rpc("get_employee_detail", {
    target_workspace_id: workspaceId,
    target_employee_id: employeeId,
  });
  check(error);
  return employeeDetailSchema.parse(data);
}

export async function saveEmployee(
  workspaceId: string,
  input: EmployeeInput,
  employeeId?: string,
): Promise<string> {
  const value = employeeInputSchema.parse(input);
  const { data, error } = await client().rpc("save_employee", {
    target_workspace_id: workspaceId,
    target_employee_id: employeeId ?? null,
    employee_first_name: value.first_name,
    employee_last_name: value.last_name,
    employee_preferred_name: value.preferred_name,
    employee_invitation_email: value.invitation_email,
    employee_start_date: value.start_date || null,
    employee_internal_note: value.internal_note,
    location_ids: value.location_ids,
    primary_location_id: value.primary_location_id,
    job_ids: value.job_ids,
    primary_job_id: value.primary_job_id,
    expected_revision: value.expected_revision,
  });
  check(error);
  return String(data);
}

export async function setEmployeeArchived(
  workspaceId: string,
  employeeId: string,
  archived: boolean,
  restoreAccess = false,
): Promise<void> {
  const { error } = await client().rpc("set_employee_archived", {
    target_workspace_id: workspaceId,
    target_employee_id: employeeId,
    should_archive: archived,
    restore_access: restoreAccess,
  });
  check(error);
}

export async function loadEmployeeReferenceData(
  workspaceId: string,
): Promise<EmployeeReferenceData> {
  const [locations, jobs, roles] = await Promise.all([
    client()
      .from("locations")
      .select("id,name,archived_at")
      .eq("workspace_id", workspaceId)
      .order("sort_order")
      .order("name"),
    client()
      .from("jobs")
      .select("id,name,archived_at")
      .eq("workspace_id", workspaceId)
      .order("sort_order")
      .order("name"),
    client()
      .from("workspace_roles")
      .select("id,name,system_key,access_class")
      .eq("workspace_id", workspaceId)
      .neq("access_class", "owner")
      .order("sort_order")
      .order("name"),
  ]);
  check(locations.error);
  check(jobs.error);
  check(roles.error);
  const map = (row: { id: unknown; name: unknown; archived_at: unknown }) => ({
    id: String(row.id),
    name: String(row.name),
    archived: Boolean(row.archived_at),
  });
  return {
    locations: (locations.data ?? []).map(map),
    jobs: (jobs.data ?? []).map(map),
    inviteRoles: (roles.data ?? []).map((role) => ({
      id: String(role.id),
      name: String(role.name),
      systemKey: role.system_key
        ? (String(role.system_key) as WorkspaceRole)
        : null,
      accessClass: String(role.access_class) as WorkspaceRole,
    })),
  };
}

export async function prepareEmployeeInvitation(
  workspaceId: string,
  employeeId: string,
  email: string,
  roleId?: string | null,
): Promise<PreparedInvitation> {
  const session = await client().auth.getSession();
  const token = session.data.session?.access_token;
  if (!token)
    throw new Error("A current session is required to invite an employee");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? "http://localhost:9999"}/v1/workspaces/${workspaceId}/employees/${employeeId}/invitations`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, roleId: roleId ?? null }),
    },
  );
  const body = (await response.json()) as PreparedInvitation & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "Employee invitation failed");
  return body;
}

export async function revokeEmployeeInvitation(
  workspaceId: string,
  employeeId: string,
): Promise<void> {
  const session = await client().auth.getSession();
  const token = session.data.session?.access_token;
  if (!token)
    throw new Error("A current session is required to revoke an invitation");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? "http://localhost:9999"}/v1/workspaces/${workspaceId}/employees/${employeeId}/invitations`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? "Invitation revoke failed");
  }
}

export async function acceptEmployeeInvitation(
  tokenValue: string,
): Promise<string> {
  const session = await client().auth.getSession();
  const token = session.data.session?.access_token;
  if (!token)
    throw new Error("Sign in with the invited email before accepting");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? "http://localhost:9999"}/v1/invitations/accept`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: tokenValue }),
    },
  );
  const body = (await response.json()) as {
    workspaceId?: string;
    error?: string;
  };
  if (!response.ok || !body.workspaceId)
    throw new Error(body.error ?? "Invitation acceptance failed");
  return body.workspaceId;
}

export async function previewEmployeeInvitation(
  tokenValue: string,
): Promise<InvitationPreview> {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? "http://localhost:9999"}/v1/invitations/preview?token=${encodeURIComponent(tokenValue)}`,
  );
  const body = (await response.json()) as InvitationPreview & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "Invitation is unavailable");
  return body;
}
