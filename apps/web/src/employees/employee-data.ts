import {
  accountPendingInvitationSchema,
  employeeDetailSchema,
  employeeInputSchema,
  employeeCreateCommandSchema,
  employeeCreateResultSchema,
  type EmployeeCreateCommand,
  type EmployeeCreateResult,
  employeeRoleUpdateInputSchema,
  employeeSummarySchema,
  invitationFailureCodeSchema,
  invitationPreviewSchema,
  type AccountPendingInvitation,
  type InvitationFailureCode,
  type InvitationPreview,
  type EmployeeDetail,
  type EmployeeInput,
  type EmployeeSummary,
  type WorkspaceRole,
} from "@newfork/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getApiAccessToken,
  getTabWorkspaceId,
  newforkApiUrl,
  supabaseClient,
} from "../lib/supabase";

export interface EmployeeOption {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  readonly timezone?: string;
}

export interface EmployeeReferenceData {
  readonly locations: readonly EmployeeOption[];
  readonly jobs: readonly EmployeeOption[];
  readonly inviteRoles: readonly InviteRoleOption[];
  readonly inviteRolesError?: boolean;
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

export type TerminationTimeEntryAction = "block" | "close_at" | "keep_open";

export interface EmployeeTerminationInput {
  readonly effectiveLocal: string;
  readonly worksiteTimezone: string;
  readonly timeEntryAction: TerminationTimeEntryAction;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface EmployeeTerminationResult {
  readonly terminationId: string;
  readonly effectiveAt: string;
  readonly releasedShiftCount: number;
  readonly idempotentReplay: boolean;
}

function client(): SupabaseClient {
  if (!supabaseClient) throw new Error("Employee storage is not configured");
  return supabaseClient;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function request(
  workspaceId: string,
  path: string,
  init: RequestInit = {},
) {
  const storage = client();
  const token = await getApiAccessToken(storage);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const tabWorkspaceId = getTabWorkspaceId();
  if (tabWorkspaceId) headers.set("X-Newfork-Workspace-Id", tabWorkspaceId);
  const response = await fetch(
    `${newforkApiUrl}/v1/workspaces/${workspaceId}/employees${path}`,
    {
      ...init,
      headers,
    },
  );
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok)
    throw Object.assign(
      new Error(
        typeof body === "object" && body && "error" in body
          ? String(body.error)
          : "Employee operation failed",
      ),
      { status: response.status },
    );
  return body;
}

export async function listEmployees(
  workspaceId: string,
  archived: boolean,
  search: string,
  status: string,
): Promise<EmployeeSummary[]> {
  const query = new URLSearchParams({
    archived: String(archived),
    search,
    status,
  });
  return employeeSummarySchema
    .array()
    .parse(await request(workspaceId, `?${query.toString()}`));
}

export async function getEmployeeDetail(
  workspaceId: string,
  employeeId: string,
): Promise<EmployeeDetail> {
  return employeeDetailSchema.parse(
    await request(workspaceId, `/${employeeId}`),
  );
}

export async function createEmployee(
  workspaceId: string,
  command: EmployeeCreateCommand,
): Promise<EmployeeCreateResult> {
  return employeeCreateResultSchema.parse(
    await request(workspaceId, "/create", {
      method: "POST",
      body: JSON.stringify(employeeCreateCommandSchema.parse(command)),
    }),
  );
}

export async function saveEmployee(
  workspaceId: string,
  input: EmployeeInput,
  employeeId?: string,
): Promise<string> {
  const value = employeeInputSchema.parse(input);
  const body = (await request(workspaceId, employeeId ? `/${employeeId}` : "", {
    method: employeeId ? "PUT" : "POST",
    body: JSON.stringify(value),
  })) as { id?: unknown };
  if (!body.id) throw new Error("Employee save result is unavailable");
  return String(body.id);
}

export async function updateEmployeeRole(
  workspaceId: string,
  employeeId: string,
  roleId: string,
): Promise<void> {
  const value = employeeRoleUpdateInputSchema.parse({ role_id: roleId });
  await request(workspaceId, `/${employeeId}/role`, {
    method: "PATCH",
    body: JSON.stringify(value),
  });
}

export async function setEmployeeArchived(
  workspaceId: string,
  employeeId: string,
  archived: boolean,
  restoreAccess = false,
): Promise<void> {
  await request(workspaceId, `/${employeeId}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived, restoreAccess }),
  });
}

export async function terminateEmployee(
  workspaceId: string,
  employeeId: string,
  input: EmployeeTerminationInput,
): Promise<EmployeeTerminationResult> {
  const value = (await request(workspaceId, `/${employeeId}/termination`, {
    method: "POST",
    body: JSON.stringify(input),
  })) as Record<string, unknown> | null;
  if (!value) throw new Error("Termination result is unavailable");
  return {
    terminationId: String(value.terminationId),
    effectiveAt: String(value.effectiveAt),
    releasedShiftCount: Number(value.releasedShiftCount ?? 0),
    idempotentReplay: Boolean(value.idempotentReplay),
  };
}

export async function loadEmployeeReferenceData(
  workspaceId: string,
): Promise<EmployeeReferenceData> {
  const [locations, jobs, roles] = await Promise.all([
    client()
      .from("locations")
      .select("id,name,archived_at,timezone")
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
  const map = (row: { id: unknown; name: unknown; archived_at: unknown }) => ({
    id: String(row.id),
    name: String(row.name),
    archived: Boolean(row.archived_at),
  });
  return {
    ...(roles.error ? { inviteRolesError: true } : {}),
    locations: (locations.data ?? []).map((row) => ({
      ...map(row),
      timezone: String(row.timezone),
    })),
    jobs: (jobs.data ?? []).map(map),
    inviteRoles: (roles.error ? [] : (roles.data ?? [])).map((role) => ({
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
  const token = await getApiAccessToken(client());
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  headers.set("Content-Type", "application/json");
  const tabWorkspaceId = getTabWorkspaceId();
  if (tabWorkspaceId) headers.set("X-Newfork-Workspace-Id", tabWorkspaceId);
  const response = await fetch(
    `${newforkApiUrl}/v1/workspaces/${workspaceId}/employees/${employeeId}/invitations`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ email, roleId: roleId ?? null }),
    },
  );
  const body = (await response.json()) as PreparedInvitation & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? "Employee invitation failed");
  return body;
}

export async function retryEmployeeInvitation(
  workspaceId: string,
  employeeId: string,
): Promise<PreparedInvitation> {
  const token = await getApiAccessToken(client());
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  const tabWorkspaceId = getTabWorkspaceId();
  if (tabWorkspaceId) headers.set("X-Newfork-Workspace-Id", tabWorkspaceId);
  const response = await fetch(
    `${newforkApiUrl}/v1/workspaces/${workspaceId}/employees/${employeeId}/invitations/retry`,
    { method: "POST", headers },
  );
  const body = (await response.json()) as PreparedInvitation & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(body.error ?? "Invitation delivery retry failed");
  return body;
}

export async function revokeEmployeeInvitation(
  workspaceId: string,
  employeeId: string,
): Promise<void> {
  const token = await getApiAccessToken(client());
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  const tabWorkspaceId = getTabWorkspaceId();
  if (tabWorkspaceId) headers.set("X-Newfork-Workspace-Id", tabWorkspaceId);
  const response = await fetch(
    `${newforkApiUrl}/v1/workspaces/${workspaceId}/employees/${employeeId}/invitations`,
    { method: "DELETE", headers },
  );
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? "Invitation revoke failed");
  }
}

export interface EmployeeAvatarStatus {
  readonly present: boolean;
  readonly url: string | null;
}

export async function getEmployeeAvatar(
  workspaceId: string,
  employeeId: string,
): Promise<EmployeeAvatarStatus> {
  const token = await getApiAccessToken(client());
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  const tabWorkspaceId = getTabWorkspaceId();
  if (tabWorkspaceId) headers.set("X-Newfork-Workspace-Id", tabWorkspaceId);
  const response = await fetch(
    `${newforkApiUrl}/v1/workspaces/${workspaceId}/employees/${employeeId}/avatar`,
    { headers },
  );
  const body = (await response.json()) as EmployeeAvatarStatus & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(body.error ?? "Employee profile photo could not be loaded");
  return { present: Boolean(body.present), url: body.url ?? null };
}

export async function removeEmployeeAvatar(
  workspaceId: string,
  employeeId: string,
): Promise<void> {
  const token = await getApiAccessToken(client());
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  const tabWorkspaceId = getTabWorkspaceId();
  if (tabWorkspaceId) headers.set("X-Newfork-Workspace-Id", tabWorkspaceId);
  const response = await fetch(
    `${newforkApiUrl}/v1/workspaces/${workspaceId}/employees/${employeeId}/avatar`,
    { method: "DELETE", headers },
  );
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(
      body.error ?? "Employee profile photo could not be removed",
    );
  }
}

export async function removeEmployeeAccess(
  workspaceId: string,
  employeeId: string,
): Promise<void> {
  const token = await getApiAccessToken(client());
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  const tabWorkspaceId = getTabWorkspaceId();
  if (tabWorkspaceId) headers.set("X-Newfork-Workspace-Id", tabWorkspaceId);
  const response = await fetch(
    `${newforkApiUrl}/v1/workspaces/${workspaceId}/employees/${employeeId}/access`,
    { method: "DELETE", headers },
  );
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(
      body.error ?? "Employee workspace access could not be removed",
    );
  }
}

/** An invitation that could not be answered, carrying the server's word for why. */
export class InvitationError extends Error {
  readonly code: InvitationFailureCode;

  constructor(code: InvitationFailureCode) {
    super(code);
    this.name = "InvitationError";
    this.code = code;
  }
}

export async function acceptEmployeeInvitation(
  tokenValue: string,
): Promise<string> {
  const token = await getApiAccessToken(client());
  const response = await fetch(`${newforkApiUrl}/v1/invitations/accept`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: tokenValue }),
  });
  const body = (await response.json().catch(() => null)) as {
    workspaceId?: string;
    code?: string;
  } | null;
  if (!response.ok || !body?.workspaceId)
    throw new InvitationError(
      invitationFailureCodeSchema.catch("invitation_unavailable").parse(
        body?.code,
      ),
    );
  return body.workspaceId;
}

export async function listPendingEmployeeInvitations(): Promise<
  AccountPendingInvitation[]
> {
  const token = await getApiAccessToken(client());
  const response = await fetch(`${newforkApiUrl}/v1/invitations/pending`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : "Pending invitations could not be loaded",
    );
  }
  return accountPendingInvitationSchema.array().parse(body);
}

export async function acceptPendingEmployeeInvitation(
  invitationId: string,
): Promise<string> {
  const token = await getApiAccessToken(client());
  const response = await fetch(
    `${newforkApiUrl}/v1/invitations/${invitationId}/accept`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
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

export async function declinePendingEmployeeInvitation(
  invitationId: string,
): Promise<void> {
  const token = await getApiAccessToken(client());
  const response = await fetch(
    `${newforkApiUrl}/v1/invitations/${invitationId}/decline`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? "Invitation decline failed");
  }
}

export async function previewEmployeeInvitation(
  tokenValue: string,
): Promise<InvitationPreview | null> {
  const response = await fetch(
    `${newforkApiUrl}/v1/invitations/preview?token=${encodeURIComponent(tokenValue)}`,
  );
  const body = (await response.json().catch(() => null)) as unknown;
  // A token no invitation carries is its own state, not an error to show.
  if (response.status === 404) return null;
  if (!response.ok) throw new InvitationError("invitation_unavailable");
  return invitationPreviewSchema.parse(body);
}
