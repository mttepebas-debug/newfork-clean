import {
  invitationPreviewSchema,
  type InvitationPreview,
  accountPendingInvitationSchema,
  type AccountPendingInvitation,
} from "@newfork/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { rpcFailure } from "../http-error.js";

export interface PrepareEmployeeInvitationInput {
  readonly actorUserId: string;
  readonly workspaceId: string;
  readonly employeeId: string;
  readonly email: string;
  readonly roleId?: string | null;
}

export interface PreparedEmployeeInvitation {
  readonly id: string;
  readonly expiresAt: string;
  readonly developmentUrl?: string;
}

export interface EmployeeInvitationService {
  /** Null when no invitation carries this token at all. */
  preview(token: string): Promise<InvitationPreview | null>;
  prepare(
    input: PrepareEmployeeInvitationInput,
  ): Promise<PreparedEmployeeInvitation>;
  retry(
    input: Omit<PrepareEmployeeInvitationInput, "email" | "roleId">,
  ): Promise<PreparedEmployeeInvitation>;
  revoke(input: Omit<PrepareEmployeeInvitationInput, "email">): Promise<void>;
  accept(accessToken: string, token: string): Promise<{ workspaceId: string }>;
  listPending(accessToken: string): Promise<AccountPendingInvitation[]>;
  acceptPending(
    accessToken: string,
    invitationId: string,
  ): Promise<{ workspaceId: string }>;
  declinePending(accessToken: string, invitationId: string): Promise<void>;
}

export interface ServiceOptions {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly appUrl: string;
  readonly resendApiKey?: string;
  readonly emailFrom?: string;
  readonly production: boolean;
}

export function createEmployeeInvitationService(
  options: ServiceOptions,
): EmployeeInvitationService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    async preview(token) {
      const { data, error } = await client.rpc(
        "preview_employee_invitation_service",
        { invitation_token_hash: await sha256(token) },
      );
      if (error) throw rpcFailure(error);
      const row = (data ?? { state: "not_found" }) as {
        state: string;
        workspace_name?: string;
        email?: string;
        expires_at?: string;
      };
      if (row.state === "not_found") return null;
      return invitationPreviewSchema.parse({
        state: row.state,
        workspaceName: row.workspace_name,
        emailHint: maskEmail(row.email ?? ""),
        expiresAt: row.expires_at,
      });
    },
    async prepare(input) {
      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
        "-",
        "",
      );
      const tokenHash = await sha256(token);
      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data, error } = await client.rpc(
        "prepare_employee_invitation_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_employee_id: input.employeeId,
          employee_email: input.email.trim().toLowerCase(),
          target_role_id: input.roleId ?? null,
          invitation_token_hash: tokenHash,
          invitation_expires_at: expiresAt,
        },
      );
      if (error) throw rpcFailure(error);
      const developmentUrl = `${options.appUrl.replace(/\/$/, "")}/invite/accept?token=${token}`;
      try {
        await restoreAuthAccountForInvitation(client, input.email);
        await storeDeliverySecret(client, {
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          invitationId: String(data),
          token,
        });
        await deliverInvitation(
          options,
          input.email,
          developmentUrl,
          `employee-invite/${String(data)}`,
        );
        await markDelivery(client, {
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          invitationId: String(data),
          status: "sent",
          error: null,
        });
      } catch (deliveryError) {
        await markDelivery(client, {
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          invitationId: String(data),
          status: "failed",
          error:
            deliveryError instanceof Error
              ? deliveryError.message
              : "Invitation delivery failed",
        });
        throw deliveryError;
      }
      return {
        id: String(data),
        expiresAt,
        ...(options.production ? {} : { developmentUrl }),
      };
    },
    async retry(input) {
      const { data, error } = await client.rpc(
        "load_employee_invitation_retry_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_employee_id: input.employeeId,
        },
      );
      if (error || !data)
        throw new Error(error?.message ?? "Failed invitation not found");
      const row = data as {
        id?: unknown;
        email?: unknown;
        token?: unknown;
        expires_at?: unknown;
      };
      if (
        typeof row.id !== "string" ||
        typeof row.email !== "string" ||
        typeof row.token !== "string" ||
        typeof row.expires_at !== "string"
      ) {
        throw new Error("Invitation retry state is invalid");
      }
      const developmentUrl = `${options.appUrl.replace(/\/$/, "")}/invite/accept?token=${row.token}`;
      try {
        await restoreAuthAccountForInvitation(client, row.email);
        await deliverInvitation(
          options,
          row.email,
          developmentUrl,
          `employee-invite/${row.id}`,
        );
        await markDelivery(client, {
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          invitationId: row.id,
          status: "sent",
          error: null,
        });
      } catch (deliveryError) {
        await markDelivery(client, {
          actorUserId: input.actorUserId,
          workspaceId: input.workspaceId,
          invitationId: row.id,
          status: "failed",
          error:
            deliveryError instanceof Error
              ? deliveryError.message
              : "Invitation delivery failed",
        });
        throw deliveryError;
      }
      return {
        id: row.id,
        expiresAt: row.expires_at,
        ...(options.production ? {} : { developmentUrl }),
      };
    },
    async revoke(input) {
      await revokePrepared(client, input);
    },
    async accept(accessToken, token) {
      const actor = await resolveActor(client, accessToken);
      const { data, error } = await client.rpc(
        "accept_employee_invitation_service",
        {
          target_user_id: actor.id,
          invitation_token_hash: await sha256(token),
        },
      );
      if (error) throw rpcFailure(error);
      await initializeEmployeeOnboarding(client, actor.id);
      return { workspaceId: String(data) };
    },
    async listPending(accessToken) {
      const actor = await resolveActor(client, accessToken);
      const { data, error } = await client.rpc(
        "list_pending_employee_invitations_for_account_service",
        { actor_user_id: actor.id },
      );
      if (error) throw rpcFailure(error);
      return accountPendingInvitationSchema.array().parse(
        ((data ?? []) as unknown[]).map((row) => {
          const value = row as {
            invitation_id: string;
            workspace_id: string;
            workspace_name: string;
            email: string;
            expires_at: string;
          };
          return {
            id: value.invitation_id,
            workspaceId: value.workspace_id,
            workspaceName: value.workspace_name,
            emailHint: maskEmail(value.email),
            expiresAt: value.expires_at,
          };
        }),
      );
    },
    async acceptPending(accessToken, invitationId) {
      const actor = await resolveActor(client, accessToken);
      const { data, error } = await client.rpc(
        "accept_employee_invitation_by_id_service",
        {
          target_user_id: actor.id,
          target_invitation_id: invitationId,
        },
      );
      if (error) throw rpcFailure(error);
      await initializeEmployeeOnboarding(client, actor.id);
      return { workspaceId: String(data) };
    },
    async declinePending(accessToken, invitationId) {
      const actor = await resolveActor(client, accessToken);
      const { error } = await client.rpc(
        "decline_employee_invitation_service",
        {
          target_user_id: actor.id,
          target_invitation_id: invitationId,
        },
      );
      if (error) throw rpcFailure(error);
    },
  };
}

async function resolveActor(client: SupabaseClient, accessToken: string) {
  const user = await client.auth.getUser(accessToken);
  if (user.error || !user.data.user)
    throw new Error("Valid authenticated account required");
  return user.data.user;
}

async function initializeEmployeeOnboarding(
  client: SupabaseClient,
  userId: string,
): Promise<void> {
  const initialized = await client.rpc(
    "initialize_employee_onboarding_service",
    {
      target_user_id: userId,
    },
  );
  if (initialized.error) throw new Error(initialized.error.message);
}

export async function deliverInvitation(
  options: ServiceOptions,
  email: string,
  url: string,
  idempotencyKey?: string,
): Promise<void> {
  if (!options.resendApiKey) {
    if (options.production)
      throw new Error("Employee invitation delivery is not configured");
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.resendApiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: options.emailFrom ?? "Newfork <onboarding@newfork.app>",
      to: [email],
      subject: "Join your Newfork workspace",
      html: `<p>You have been invited to your team's Newfork workspace.</p><p><a href="${escapeHtml(url)}">Accept invitation</a></p><p>This link expires in seven days.</p>`,
    }),
  });
  if (!response.ok)
    throw new Error(`Invitation delivery failed (${response.status})`);
}

async function revokePrepared(
  client: SupabaseClient,
  input: Omit<PrepareEmployeeInvitationInput, "email">,
): Promise<void> {
  const { error } = await client.rpc("revoke_employee_invitation_service", {
    actor_user_id: input.actorUserId,
    target_workspace_id: input.workspaceId,
    target_employee_id: input.employeeId,
  });
  if (error) throw rpcFailure(error);
}

async function markDelivery(
  client: SupabaseClient,
  input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly invitationId: string;
    readonly status: "sent" | "failed";
    readonly error: string | null;
  },
): Promise<void> {
  const { error } = await client.rpc(
    "mark_employee_invitation_delivery_service",
    {
      actor_user_id: input.actorUserId,
      target_workspace_id: input.workspaceId,
      target_invitation_id: input.invitationId,
      delivery_result: input.status,
      delivery_failure_message: input.error,
    },
  );
  if (error) throw rpcFailure(error);
}

export async function storeDeliverySecret(
  client: SupabaseClient,
  input: {
    readonly actorUserId: string;
    readonly workspaceId: string;
    readonly invitationId: string;
    readonly token: string;
  },
): Promise<void> {
  const { error } = await client.rpc(
    "store_employee_invitation_delivery_secret_service",
    {
      actor_user_id: input.actorUserId,
      target_workspace_id: input.workspaceId,
      target_invitation_id: input.invitationId,
      invitation_token: input.token,
    },
  );
  if (error) throw rpcFailure(error);
}

export async function restoreAuthAccountForInvitation(
  client: SupabaseClient,
  email: string,
): Promise<void> {
  const admin = client.auth?.admin;
  if (!admin?.listUsers || !admin?.updateUserById) return;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error)
      throw new Error(`Account restore lookup failed: ${error.message}`);
    const users = data?.users ?? [];
    const user = users.find(
      (candidate) => candidate.email?.trim().toLowerCase() === normalized,
    );
    if (user) {
      const result = await admin.updateUserById(user.id, {
        ban_duration: "none",
      });
      if (result.error)
        throw new Error(`Account restore failed: ${result.error.message}`);
      return;
    }
    if (users.length < perPage) return;
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

function maskEmail(value: string): string {
  const [local = "", domain = ""] = value.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}
