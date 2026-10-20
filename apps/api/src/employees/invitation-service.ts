import {
  type EmployeeInvitationAccess,
  invitationPreviewSchema,
  type InvitationPreview,
  accountPendingInvitationSchema,
  type AccountPendingInvitation,
} from "@newfork/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createUserVerifier } from "../auth/verify-user.js";
import { HttpError, rpcFailure } from "../http-error.js";
import { sendResendEmail } from "../email/resend-email.js";

export interface PrepareEmployeeInvitationInput {
  readonly actorUserId: string;
  readonly workspaceId: string;
  readonly employeeId: string;
  readonly email: string;
  /** DAVET-ERISIM: the employee app and the management app apart. */
  readonly access: EmployeeInvitationAccess;
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
    input: Omit<PrepareEmployeeInvitationInput, "email" | "access">,
  ): Promise<PreparedEmployeeInvitation>;
  /** An invitation still out takes another access; its link stays. */
  updateAccess(input: Omit<PrepareEmployeeInvitationInput, "email">): Promise<void>;
  revoke(input: Omit<PrepareEmployeeInvitationInput, "email" | "access">): Promise<void>;
  /** The open invitation's own link, for an admin to pass along by hand. */
  link(
    input: Omit<PrepareEmployeeInvitationInput, "email" | "access">,
  ): Promise<{ readonly url: string; readonly expiresAt: string }>;
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
          target_employee_role_id: input.access.employee_role_id,
          target_management_role_id: input.access.management_role_id,
          target_managed_location_ids: input.access.managed_location_ids,
          invitation_token_hash: tokenHash,
          invitation_expires_at: expiresAt,
        },
      );
      if (error) throw rpcFailure(error);
      const developmentUrl = `${options.appUrl.replace(/\/$/, "")}/invite/accept?token=${token}`;
      try {
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
        throw deliveryFailed(deliveryError);
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
      if (error) throw rpcFailure(error);
      if (!data) throw new HttpError("Open invitation not found", 404);
      const row = data as {
        id?: unknown;
        email?: unknown;
        token?: unknown;
        expires_at?: unknown;
        reminder?: unknown;
        attempt?: unknown;
      };
      if (
        typeof row.id !== "string" ||
        typeof row.email !== "string" ||
        typeof row.token !== "string" ||
        typeof row.expires_at !== "string" ||
        typeof row.reminder !== "boolean" ||
        typeof row.attempt !== "number"
      ) {
        throw new Error("Invitation retry state is invalid");
      }
      const developmentUrl = `${options.appUrl.replace(/\/$/, "")}/invite/accept?token=${row.token}`;
      try {
        // Same link, its own email: the first email's key is the id alone,
        // and the provider drops a repeated key as a duplicate (BL-767).
        await deliverInvitation(
          options,
          row.email,
          developmentUrl,
          `employee-invite/${row.id}/${row.attempt}`,
          row.reminder ? "reminder" : "invitation",
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
        throw deliveryFailed(deliveryError);
      }
      return {
        id: row.id,
        expiresAt: row.expires_at,
        ...(options.production ? {} : { developmentUrl }),
      };
    },
    async updateAccess(input) {
      const { error } = await client.rpc(
        "update_employee_invitation_access_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_employee_id: input.employeeId,
          target_employee_role_id: input.access.employee_role_id,
          target_management_role_id: input.access.management_role_id,
          target_managed_location_ids: input.access.managed_location_ids,
        },
      );
      if (error) throw rpcFailure(error);
    },
    async revoke(input) {
      await revokePrepared(client, input);
    },
    async link(input) {
      const { data, error } = await client.rpc(
        "load_employee_invitation_link_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_employee_id: input.employeeId,
        },
      );
      if (error) throw rpcFailure(error);
      const row = data as { token?: unknown; expires_at?: unknown };
      if (typeof row?.token !== "string" || typeof row.expires_at !== "string")
        throw new HttpError("Invitation link is unavailable", 404);
      return {
        url: `${options.appUrl.replace(/\/$/, "")}/invite/accept?token=${row.token}`,
        expiresAt: row.expires_at,
      };
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
  const user = await createUserVerifier(client)(accessToken);
  if (!user) throw new HttpError("Valid authenticated account required", 401);
  return user;
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
  if (initialized.error) throw rpcFailure(initialized.error);
}

// The invitation stands and is marked failed (the drawer offers to resend);
// the inviter hears our sentence, never the email provider's.
function deliveryFailed(cause: unknown): HttpError {
  return new HttpError("Invitation delivery failed", 409, { cause });
}

export async function deliverInvitation(
  options: ServiceOptions,
  email: string,
  url: string,
  idempotencyKey?: string,
  kind: "invitation" | "reminder" = "invitation",
): Promise<void> {
  if (!options.resendApiKey) {
    if (options.production)
      throw new Error("Employee invitation delivery is not configured");
    return;
  }
  const link = `<p><a href="${escapeHtml(url)}">Accept invitation</a></p>`;
  await sendResendEmail({
    apiKey: options.resendApiKey,
    failure: "Invitation delivery failed",
    message: {
      from: options.emailFrom ?? "Newfork <onboarding@newfork.app>",
      to: email,
      ...(kind === "reminder"
        ? {
            // The same link as before; a reminder does not move its expiry
            // (KARARLAR Employees S2).
            subject: "Reminder: join your Newfork workspace",
            html: `<p>Your team is still waiting for you on Newfork.</p>${link}<p>This is the same link as before. It still expires seven days after it was first sent.</p>`,
          }
        : {
            subject: "Join your Newfork workspace",
            html: `<p>You have been invited to your team's Newfork workspace.</p>${link}<p>This link expires in seven days.</p>`,
          }),
      idempotencyKey,
    },
  });
}

async function revokePrepared(
  client: SupabaseClient,
  input: Omit<PrepareEmployeeInvitationInput, "email" | "access">,
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
