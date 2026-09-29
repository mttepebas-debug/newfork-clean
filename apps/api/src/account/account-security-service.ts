import { notificationUserPreferencesResponseSchema, type NotificationUserPreferencesResponse } from "@newfork/shared";
import { createCommunicationServiceWithClient, type CommunicationService } from "../communications/communication-service";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { rpcFailure } from "../http-error.js";
import { createUserVerifier } from "../auth/verify-user.js";
import { createPasswordVerifier } from "../auth/verify-password.js";
import { sendResendEmail } from "../email/resend-email.js";

export interface AccountSecurityState {
  readonly email: string;
  readonly pendingEmail: string | null;
  readonly emailChangeSentAt: string | null;
  readonly emailVerified: boolean;
}

export interface AccountDeletionBlocker {
  readonly kind: "active_membership" | "pending_ownership_transfer";
  readonly workspace_id: string;
  readonly workspace_name: string;
  readonly role_name?: string;
  readonly is_owner?: boolean;
  readonly transfer_id?: string;
  readonly transfer_direction?: "incoming" | "outgoing";
}

interface AccountAuthUser {
  readonly id: string;
  readonly email?: string | null;
  readonly new_email?: string | null;
  readonly email_change_sent_at?: string | null;
  readonly email_confirmed_at?: string | null;
}

interface AccountAuthGateway {
  getUser(accessToken: string): Promise<AccountAuthUser>;
  updateEmail(accessToken: string, email: string): Promise<AccountAuthUser>;
  resendEmailChange(email: string): Promise<void>;
  updatePassword(
    accessToken: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void>;
  verifyPassword(email: string, password: string): Promise<void>;
  signOut(accessToken: string, scope: "others" | "global"): Promise<void>;
  setBan(userId: string, duration: string | "none"): Promise<void>;
}

interface AccountSecurityRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
}

interface RecoveryEmailInput {
  readonly email: string;
  readonly recoveryUrl: string;
  readonly restoreUntil: string;
  readonly kind: "initial" | "day_7" | "last_24h" | "resend";
  readonly idempotencyKey: string;
}

export type RecoveryEmailDelivery = (input: RecoveryEmailInput) => Promise<void>;

export interface AccountSecurityService {
  getNotificationPreferences(accessToken: string): Promise<NotificationUserPreferencesResponse>;
  getNotifications(accessToken: string, filters: Omit<Parameters<CommunicationService["getNotifications"]>[0], "actorUserId" | "workspaceId">): ReturnType<CommunicationService["getNotifications"]>;
  actOnNotification(accessToken: string, action: Parameters<CommunicationService["actOnNotification"]>[0]["action"]): ReturnType<CommunicationService["actOnNotification"]>;

  getSecurityState(accessToken: string): Promise<AccountSecurityState>;
  requestEmailChange(accessToken: string, newEmail: string): Promise<AccountSecurityState>;
  resendEmailChange(accessToken: string): Promise<void>;
  cancelEmailChange(accessToken: string): Promise<void>;
  changePassword(
    accessToken: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void>;
  signOutOtherSessions(accessToken: string, currentPassword: string): Promise<void>;
  getAccountDeletionBlockers(accessToken: string): Promise<AccountDeletionBlocker[]>;
  requestAccountDeletion(accessToken: string, currentPassword: string): Promise<unknown>;
  restoreAccountDeletion(recoveryToken: string): Promise<{ status: "restored"; loginUrl: string }>;
  resendAccountDeletionRecovery(email: string): Promise<void>;
}

const deletedAccountBanDuration = "876000h";

export function createAccountSecurityService(options: {
  readonly url: string;
  readonly anonKey: string;
  readonly serviceRoleKey: string;
  readonly appUrl: string;
  readonly resendApiKey?: string;
  readonly emailFrom?: string;
  readonly production?: boolean;
}): AccountSecurityService {
  const authClient = createClient(options.url, options.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adminClient = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authUrl = `${options.url.replace(/\/$/, "")}/auth/v1`;

  async function authRequest(
    path: string,
    init: RequestInit,
    accessToken?: string,
  ): Promise<AccountAuthUser> {
    const response = await fetch(`${authUrl}${path}`, {
      ...init,
      headers: {
        apikey: options.anonKey,
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      error_description?: string;
    } & AccountAuthUser;
    if (!response.ok) {
      throw new Error(
        payload.message ?? payload.error_description ?? "Account authentication request failed",
      );
    }
    return payload;
  }

  const verifyUser = createUserVerifier(authClient);
  const authGateway: AccountAuthGateway = {
    async getUser(accessToken) {
      const user = await verifyUser(accessToken);
      if (!user) throw new Error("Valid bearer session required");
      return user;
    },
    updateEmail(accessToken, email) {
      return authRequest(
        "/user",
        { method: "PUT", body: JSON.stringify({ email }) },
        accessToken,
      );
    },
    async resendEmailChange(email) {
      await authRequest("/resend", {
        method: "POST",
        body: JSON.stringify({ type: "email_change", email }),
      });
    },
    async updatePassword(accessToken, currentPassword, newPassword) {
      await authRequest(
        "/user",
        {
          method: "PUT",
          body: JSON.stringify({
            password: newPassword,
            current_password: currentPassword,
          }),
        },
        accessToken,
      );
    },
    // One password check for the whole API (SEC-003).
    verifyPassword: createPasswordVerifier(() =>
      createClient(options.url, options.anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
    ),
    async signOut(accessToken, scope) {
      const result = await adminClient.auth.admin.signOut(accessToken, scope);
      if (result.error) throw new Error(result.error.message);
    },
    async setBan(userId, duration) {
      const result = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: duration,
      });
      if (result.error) throw new Error(result.error.message);
    },
  };

  return createAccountSecurityServiceWithClients({
    rpcClient: adminClient,
    authGateway,
    appUrl: options.appUrl,
    deliverRecoveryEmail: createRecoveryEmailDelivery(options),
  });
}

export function createAccountSecurityServiceWithClients(options: {
  readonly rpcClient: AccountSecurityRpcClient;
  readonly authGateway: AccountAuthGateway;
  readonly appUrl: string;
  readonly deliverRecoveryEmail: RecoveryEmailDelivery;
}): AccountSecurityService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await options.rpcClient.rpc(name, args);
    if (error) throw rpcFailure(error);
    return data;
  }

  async function requireUser(accessToken: string) {
    const user = await options.authGateway.getUser(accessToken);
    const email = user.email?.trim().toLowerCase();
    if (!email) throw new Error("Account email is required");
    return { user, email };
  }

  async function sendRecovery(
    payload: unknown,
    token: string,
    kind: RecoveryEmailInput["kind"],
  ) {
    const row = payload as {
      request_id: string;
      email: string;
      restore_until: string;
    };
    await options.deliverRecoveryEmail({
      email: row.email,
      recoveryUrl: `${options.appUrl.replace(/\/$/, "")}/account-recovery?token=${encodeURIComponent(token)}`,
      restoreUntil: row.restore_until,
      kind,
      idempotencyKey: `account-deletion-${row.request_id}-${kind}-${tokenDigest(token).slice(0, 16)}`,
    });
    await rpc("mark_account_deletion_email_sent_service", {
      target_request_id: row.request_id,
      delivery_kind: kind,
    });
  }

  const communications = createCommunicationServiceWithClient(options.rpcClient);
  async function recordSecurityEvent(userId: string, event: string) {
    await rpc("record_account_security_notification_service", { actor_user_id: userId, target_event: event });
  }
  return {
    async getNotificationPreferences(accessToken) {
      const { user } = await requireUser(accessToken);
      return notificationUserPreferencesResponseSchema.parse(await rpc("get_notification_user_preferences_service", { actor_user_id: user.id, target_workspace_id: null }));
    },
    async getNotifications(accessToken, filters) {
      const { user } = await requireUser(accessToken);
      return communications.getNotifications({ ...filters, actorUserId: user.id, workspaceId: null });
    },
    async actOnNotification(accessToken, action) {
      const { user } = await requireUser(accessToken);
      return communications.actOnNotification({ actorUserId: user.id, workspaceId: null, action });
    },
    async getSecurityState(accessToken) {
      const { user, email } = await requireUser(accessToken);
      return {
        email,
        pendingEmail: user.new_email?.trim().toLowerCase() || null,
        emailChangeSentAt: user.email_change_sent_at ?? null,
        emailVerified: Boolean(user.email_confirmed_at),
      };
    },
    async requestEmailChange(accessToken, newEmail) {
      const normalized = newEmail.trim().toLowerCase();
      const current = await requireUser(accessToken);
      if (normalized === current.email) throw new Error("New email must be different");
      const user = await options.authGateway.updateEmail(accessToken, normalized);
      await recordSecurityEvent(current.user.id, "account.email_change_requested");
      return {
        email: user.email?.trim().toLowerCase() || current.email,
        pendingEmail: user.new_email?.trim().toLowerCase() || normalized,
        emailChangeSentAt: user.email_change_sent_at ?? null,
        emailVerified: Boolean(user.email_confirmed_at),
      };
    },
    async resendEmailChange(accessToken) {
      const { user } = await requireUser(accessToken);
      const pendingEmail = user.new_email?.trim().toLowerCase();
      if (!pendingEmail) throw new Error("Pending email change not found");
      await options.authGateway.resendEmailChange(pendingEmail);
    },
    async cancelEmailChange(accessToken) {
      const { user } = await requireUser(accessToken);
      await rpc("cancel_account_email_change_service", { actor_user_id: user.id });
    },
    async changePassword(accessToken, currentPassword, newPassword) {
      const { user, email } = await requireUser(accessToken);
      // Checked here, not left to GoTrue: it only checks current_password
      // when the project's "require current password" setting is on.
      await options.authGateway.verifyPassword(email, currentPassword);
      await options.authGateway.updatePassword(accessToken, currentPassword, newPassword);
      try { await options.authGateway.signOut(accessToken, "others"); }
      finally { await recordSecurityEvent(user.id, "account.password_changed"); }
      await recordSecurityEvent(user.id, "account.sessions_revoked");
    },
    async signOutOtherSessions(accessToken, currentPassword) {
      const { user, email } = await requireUser(accessToken);
      await options.authGateway.verifyPassword(email, currentPassword);
      await options.authGateway.signOut(accessToken, "others");
      await recordSecurityEvent(user.id, "account.sessions_revoked");
    },
    async getAccountDeletionBlockers(accessToken) {
      const { user } = await requireUser(accessToken);
      return (await rpc("get_account_deletion_blockers_service", {
        actor_user_id: user.id,
      })) as AccountDeletionBlocker[];
    },
    async requestAccountDeletion(accessToken, currentPassword) {
      const { user, email } = await requireUser(accessToken);
      await options.authGateway.verifyPassword(email, currentPassword);
      const blockers = (await rpc("get_account_deletion_blockers_service", {
        actor_user_id: user.id,
      })) as AccountDeletionBlocker[];
      if (blockers.length > 0)
        throw new Error(`Account deletion blocked: ${JSON.stringify(blockers)}`);

      const token = recoveryToken();
      const result = await rpc("request_account_deletion_v2_service", {
        actor_user_id: user.id,
        recovery_token_digest: tokenDigest(token),
      });
      await sendRecovery(result, token, "initial");
      await options.authGateway.setBan(user.id, deletedAccountBanDuration);
      await options.authGateway.signOut(accessToken, "global");
      return result;
    },
    async restoreAccountDeletion(recoveryTokenValue) {
      const result = (await rpc("restore_account_deletion_by_token_service", {
        recovery_token_digest: tokenDigest(recoveryTokenValue),
      })) as { user_id: string; status: "restored" };
      await options.authGateway.setBan(result.user_id, "none");
      return {
        status: "restored",
        loginUrl: `${options.appUrl.replace(/\/$/, "")}/sign-in`,
      };
    },
    async resendAccountDeletionRecovery(email) {
      const token = recoveryToken();
      const result = await rpc("prepare_account_deletion_recovery_resend_service", {
        account_email: email.trim().toLowerCase(),
        recovery_token_digest: tokenDigest(token),
      });
      if (result) await sendRecovery(result, token, "resend");
    },
  };
}

export function recoveryToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createRecoveryEmailDelivery(options: {
  readonly resendApiKey?: string;
  readonly emailFrom?: string;
  readonly production?: boolean;
}): RecoveryEmailDelivery {
  return async (input) => {
    if (!options.resendApiKey) {
      throw new Error("Account recovery email delivery is not configured");
    }
    await sendResendEmail({
      apiKey: options.resendApiKey,
      failure: "Account recovery email delivery failed",
      message: {
        from: options.emailFrom ?? "Newfork <security@newfork.app>",
        to: input.email,
        subject:
          input.kind === "last_24h"
            ? "Your Newfork account will be deleted within 24 hours"
            : input.kind === "day_7"
              ? "Reminder: your Newfork account deletion is scheduled"
              : "Restore your Newfork account",
        html: `<p>Your Newfork account is scheduled for deletion after ${escapeHtml(input.restoreUntil)}.</p><p><a href="${escapeHtml(input.recoveryUrl)}">Restore account</a></p><p>This one-time link replaces any earlier recovery link.</p>`,
        idempotencyKey: input.idempotencyKey,
      },
    });
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
