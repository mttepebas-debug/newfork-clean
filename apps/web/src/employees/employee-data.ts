import { RequestError, requestFailure } from "../lib/request-error";
import {
  accountPendingInvitationSchema,
  employeeDetailSchema,
  employeeInputSchema,
  employeeCreateCommandSchema,
  employeeLocationRemovalSchema,
  type EmployeeLocationRemoval,
  employeeCreateResultSchema,
  employeeReferenceDataSchema,
  type EmployeeCreateCommand,
  type EmployeeCreateResult,
  employeeAccessChangeInputSchema,
  employeeAccessChangeResultSchema,
  employeeAccessImpactSchema,
  employeeAccessPreviewInputSchema,
  employeeInvitationAccessSchema,
  type EmployeeAccessChangeInput,
  type EmployeeAccessChangeResult,
  type EmployeeAccessImpact,
  type EmployeeAccessPreviewInput,
  type EmployeeInvitationAccess,
  employeeSummarySchema,
  invitationFailureCodeSchema,
  invitationPreviewSchema,
  pendingPreferredNameSchema,
  preferredNameOutcomeSchema,
  type PendingPreferredName,
  type PreferredNameOutcome,
  type AccountPendingInvitation,
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
import { InvitationError } from "./invitation-error";

export interface EmployeeOption {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  readonly timezone?: string;
}

/** A department in the drawer's Jobs picker (BL-218). */
export interface EmployeeDepartmentOption extends EmployeeOption {
  /** Management, found by its system key: it can be renamed. */
  readonly management: boolean;
}

/** A job in the drawer's Jobs picker, with where it sits (BL-218). */
export interface EmployeeJobOption extends EmployeeOption {
  readonly departmentId: string | null;
  /**
   * The Owner job: only the workspace owner works it, and keeps it. The one
   * job never marked primary (EMP-001 S2).
   */
  readonly owner: boolean;
}

export interface EmployeeReferenceData {
  readonly locations: readonly EmployeeOption[];
  readonly departments: readonly EmployeeDepartmentOption[];
  readonly jobs: readonly EmployeeJobOption[];
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

export interface EmployeeTerminationInput {
  readonly effectiveLocal: string;
  readonly worksiteTimezone: string;
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
    throw requestFailure(body, response.status, "Employee operation failed");
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

/**
 * DAVET-ERISIM (ROL-CIFT 4.1): what changing a joined person's two accesses
 * does, then the change, sent with what the reader was shown (409 when it moved).
 */
export async function previewEmployeeAccessChange(
  workspaceId: string,
  employeeId: string,
  input: EmployeeAccessPreviewInput,
): Promise<EmployeeAccessImpact> {
  const value = employeeAccessPreviewInputSchema.parse(input);
  return employeeAccessImpactSchema.parse(
    await request(workspaceId, `/${employeeId}/access/preview`, {
      method: "POST",
      body: JSON.stringify(value),
    }),
  );
}

export async function changeEmployeeAccess(
  workspaceId: string,
  employeeId: string,
  input: EmployeeAccessChangeInput,
): Promise<EmployeeAccessChangeResult> {
  const value = employeeAccessChangeInputSchema.parse(input);
  return employeeAccessChangeResultSchema.parse(
    await request(workspaceId, `/${employeeId}/access`, {
      method: "PATCH",
      body: JSON.stringify(value),
    }),
  );
}

/** An invitation still out takes another access; its link stays. */
export async function updateEmployeeInvitationAccess(
  workspaceId: string,
  employeeId: string,
  access: EmployeeInvitationAccess,
): Promise<void> {
  await request(workspaceId, `/${employeeId}/invitations`, {
    method: "PATCH",
    body: JSON.stringify({ access: employeeInvitationAccessSchema.parse(access) }),
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

/** The drawer's pick lists; the server keeps only what this person may pick (BL-231). */
export async function loadEmployeeReferenceData(
  workspaceId: string,
): Promise<EmployeeReferenceData> {
  const answer = employeeReferenceDataSchema.parse(
    await request(workspaceId, "/reference-data"),
  );
  return {
    locations: answer.locations.map((row) => ({
      id: row.id,
      name: row.name,
      archived: row.archived_at !== null,
      timezone: row.timezone,
    })),
    departments: answer.departments.map((row) => ({
      id: row.id,
      name: row.name,
      archived: row.archived_at !== null,
      management: row.system_key === "management",
    })),
    jobs: answer.jobs.map((row) => ({
      id: row.id,
      name: row.name,
      archived: row.archived_at !== null,
      departmentId: row.department_id,
      owner: row.system_key === "owner",
    })),
    inviteRoles: answer.invite_roles.map((role) => ({
      id: role.id,
      name: role.name,
      systemKey: role.system_key,
      accessClass: role.access_class,
    })),
  };
}

export async function prepareEmployeeInvitation(
  workspaceId: string,
  employeeId: string,
  email: string,
  access: EmployeeInvitationAccess,
): Promise<PreparedInvitation> {
  return (await request(workspaceId, `/${employeeId}/invitations`, {
    method: "POST",
    body: JSON.stringify({ email, access: employeeInvitationAccessSchema.parse(access) }),
  })) as PreparedInvitation;
}

export async function retryEmployeeInvitation(
  workspaceId: string,
  employeeId: string,
): Promise<PreparedInvitation> {
  return (await request(workspaceId, `/${employeeId}/invitations/retry`, {
    method: "POST",
  })) as PreparedInvitation;
}

export async function revokeEmployeeInvitation(
  workspaceId: string,
  employeeId: string,
): Promise<void> {
  await request(workspaceId, `/${employeeId}/invitations`, { method: "DELETE" });
}

/**
 * Takes somebody off one location (FB-6.2 S1): their shifts there from now on
 * are left open; the record stays, with no location if it was the only one.
 */
export async function removeEmployeeFromLocation(
  workspaceId: string,
  employeeId: string,
  locationId: string,
): Promise<EmployeeLocationRemoval> {
  return employeeLocationRemovalSchema.parse(
    await request(workspaceId, `/${employeeId}/locations/${locationId}`, {
      method: "DELETE",
    }),
  );
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

function invitationError(body: { code?: unknown } | null): InvitationError {
  return new InvitationError(
    invitationFailureCodeSchema.catch("invitation_unavailable").parse(body?.code),
  );
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
  if (!response.ok || !body?.workspaceId) throw invitationError(body);
  return body.workspaceId;
}

/**
 * The owner's own emergency contact. Everyone else gives one during onboarding;
 * the owner never runs it, so theirs is entered by hand in their own record.
 */
/** The person asks for their own. The answer says what happened to it. */
export async function requestPreferredName(
  workspaceId: string,
  employeeId: string,
  preferredName: string,
): Promise<PreferredNameOutcome> {
  const body = (await employeeApi(
    `/v1/workspaces/${workspaceId}/employees/${employeeId}/preferred-name`,
    { method: "PUT", body: JSON.stringify({ preferredName }) },
  )) as { outcome: unknown };
  return preferredNameOutcomeSchema.parse(body.outcome);
}

export async function listPendingPreferredNames(
  workspaceId: string,
): Promise<PendingPreferredName[]> {
  return pendingPreferredNameSchema
    .array()
    .parse(
      await employeeApi(`/v1/workspaces/${workspaceId}/preferred-names/pending`),
    );
}

export async function decidePreferredName(
  workspaceId: string,
  requestId: string,
  approve: boolean,
): Promise<void> {
  await employeeApi(
    `/v1/workspaces/${workspaceId}/preferred-names/${requestId}/decision`,
    { method: "POST", body: JSON.stringify({ approve }) },
  );
}

/** One fetch shape for all of the above: token, JSON, and a plain refusal. */
async function employeeApi(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const token = await getApiAccessToken(client());
  const response = await fetch(`${newforkApiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    throw new Error(
      typeof body?.error === "string" ? body.error : "That could not be saved",
    );
  }
  return response.status === 204 ? null : await response.json();
}

export async function saveOwnEmploymentContact(
  workspaceId: string,
  employeeId: string,
  contact: {
    readonly name: string;
    readonly relationship: string;
    readonly phone: string;
    readonly email: string;
    /** Left out means leave the number already on file. */
    readonly personalPhone?: string;
  },
): Promise<void> {
  const token = await getApiAccessToken(client());
  const response = await fetch(
    `${newforkApiUrl}/v1/workspaces/${workspaceId}/employees/${employeeId}/emergency-contact`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(contact),
    },
  );
  // The server's own sentence is not for the screen; its reason is, so the
  // screen can tell "try again" from "not here any more" (which reasons:
  // accessEnded in ProfilePage).
  if (!response.ok) {
    const refusal = requestFailure(await response.json().catch(() => null), response.status, "");
    throw new RequestError(
      "Emergency contact could not be saved",
      refusal.reason,
      refusal.detail,
      response.status,
    );
  }
}

/** The open invitation's own link, for an admin to pass along by hand. */
export async function loadEmployeeInvitationLink(
  workspaceId: string,
  employeeId: string,
): Promise<{ url: string; expiresAt: string }> {
  const token = await getApiAccessToken(client());
  const response = await fetch(
    `${newforkApiUrl}/v1/workspaces/${workspaceId}/employees/${employeeId}/invitations/link`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = (await response.json().catch(() => null)) as {
    url?: string;
    expiresAt?: string;
  } | null;
  if (!response.ok || !body?.url || !body.expiresAt)
    throw new InvitationError("invitation_unavailable");
  return { url: body.url, expiresAt: body.expiresAt };
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
    throw requestFailure(body, response.status, "Pending invitations could not be loaded");
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
  const body = (await response.json().catch(() => null)) as {
    workspaceId?: string;
    code?: string;
  } | null;
  if (!response.ok || !body?.workspaceId) throw invitationError(body);
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
  if (!response.ok)
    throw invitationError(
      (await response.json().catch(() => null)) as { code?: string } | null,
    );
}

export async function previewEmployeeInvitation(
  tokenValue: string,
): Promise<InvitationPreview | null> {
  // The token rides in the body: an address with it lands in request logs (BL-279).
  const response = await fetch(`${newforkApiUrl}/v1/invitations/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: tokenValue }),
  });
  const body = (await response.json().catch(() => null)) as unknown;
  // A token no invitation carries is its own state, not an error to show.
  if (response.status === 404) return null;
  if (!response.ok) throw new InvitationError("invitation_unavailable");
  return invitationPreviewSchema.parse(body);
}
