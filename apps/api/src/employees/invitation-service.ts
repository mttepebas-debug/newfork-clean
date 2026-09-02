import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  preview(token: string): Promise<{
    workspaceName: string;
    emailHint: string;
    expiresAt: string;
  }>;
  prepare(
    input: PrepareEmployeeInvitationInput,
  ): Promise<PreparedEmployeeInvitation>;
  revoke(input: Omit<PrepareEmployeeInvitationInput, "email">): Promise<void>;
  accept(accessToken: string, token: string): Promise<{ workspaceId: string }>;
}

interface ServiceOptions {
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
      if (error || !data) throw new Error("Active invitation not found");
      const row = data as {
        workspace_name: string;
        email: string;
        expires_at: string;
      };
      return {
        workspaceName: row.workspace_name,
        emailHint: maskEmail(row.email),
        expiresAt: row.expires_at,
      };
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
      if (error) throw new Error(error.message);
      const developmentUrl = `${options.appUrl.replace(/\/$/, "")}/invite/accept?token=${token}`;
      try {
        await deliverInvitation(options, input.email, developmentUrl);
      } catch (deliveryError) {
        await revokePrepared(client, input);
        throw deliveryError;
      }
      return {
        id: String(data),
        expiresAt,
        ...(options.production ? {} : { developmentUrl }),
      };
    },
    async revoke(input) {
      await revokePrepared(client, input);
    },
    async accept(accessToken, token) {
      const user = await client.auth.getUser(accessToken);
      if (user.error || !user.data.user)
        throw new Error("Valid authenticated account required");
      const { data, error } = await client.rpc(
        "accept_employee_invitation_service",
        {
          target_user_id: user.data.user.id,
          invitation_token_hash: await sha256(token),
        },
      );
      if (error) throw new Error(error.message);
      const initialized = await client.rpc(
        "initialize_employee_onboarding_service",
        {
          target_user_id: user.data.user.id,
        },
      );
      if (initialized.error) throw new Error(initialized.error.message);
      return { workspaceId: String(data) };
    },
  };
}

async function deliverInvitation(
  options: ServiceOptions,
  email: string,
  url: string,
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
  if (error) throw new Error(error.message);
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
