import { requestFailure } from "./request-error";
import {
  accountAttentionSchema,
  employmentContactRecordSchema,
  workspaceIdentitySchema,
  type AccountAttention,
  type EmploymentContactRecord,
  type WorkspaceIdentity,
  ownerLegalNameResponseSchema,
  type OwnerLegalName,
  accountProfileSchema,
  activeWorkspaceContextSchema,
  workspaceSummarySchema,
  type AccountProfile,
  type ActiveWorkspaceContext,
  type WorkspaceSummary,
} from "@newfork/shared";
import {
  createClient,
  isAuthRetryableFetchError,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const apiUrl =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? "http://localhost:9999" : "");
export const newforkApiUrl = apiUrl;
export const accountProfileAvatarBucket = "account-profile-photos";

// BL-137: set while a reset link's session is open and no new password is
// saved yet. If the tab closed in that window, drop the stored session here,
// before the auth client below can read it.
const passwordResetPendingKey = "newfork.passwordResetPending";
try {
  if (window.localStorage.getItem(passwordResetPendingKey)) {
    for (const key of Object.keys(window.localStorage))
      if (/^sb-.+-auth-token$/.test(key)) window.localStorage.removeItem(key);
    window.localStorage.removeItem(passwordResetPendingKey);
  }
} catch {
  // Storage blocked: the auth client cannot persist a session either.
}

export const supabaseClient: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const tabWorkspaceIdStorageKey = "newfork.tabWorkspaceId";
export const sessionExpiredStorageKey = "newfork.sessionExpired";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getTabWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(tabWorkspaceIdStorageKey);
  return value && uuidPattern.test(value) ? value : null;
}

export function setTabWorkspaceId(workspaceId: string): void {
  if (typeof window === "undefined") return;
  if (!uuidPattern.test(workspaceId)) {
    throw new Error("Valid workspace id required");
  }
  window.sessionStorage.setItem(tabWorkspaceIdStorageKey, workspaceId);
}

export function clearTabWorkspaceId(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(tabWorkspaceIdStorageKey);
}

async function accessToken(client: SupabaseClient): Promise<string> {
  const token = (await client.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("A current session is required");
  return token;
}

export async function getApiAccessToken(
  client: SupabaseClient,
): Promise<string> {
  return accessToken(client);
}

/**
 * PostgREST keeps accepting a revoked session's JWT until it expires, so ask
 * the auth server. Returns false after a local sign-out when the session ended.
 */
export async function ensureSessionAlive(
  client: SupabaseClient,
): Promise<boolean> {
  // Already signed out (a parallel check got here first): nothing to report.
  if (!(await client.auth.getSession()).data.session) return false;
  const { error } = await client.auth.getUser();
  // Offline is not a revoked session.
  if (!error || isAuthRetryableFetchError(error)) return true;
  window.sessionStorage.setItem(sessionExpiredStorageKey, "1");
  await client.auth.signOut({ scope: "local" });
  return false;
}

export async function apiRequest(
  client: SupabaseClient,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const token = await accessToken(client);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const tabWorkspaceId = getTabWorkspaceId();
  if (tabWorkspaceId) headers.set("X-Newfork-Workspace-Id", tabWorkspaceId);
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers,
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (response.status === 401) await ensureSessionAlive(client);
  if (!response.ok)
    throw requestFailure(body, response.status, "Workspace operation failed");
  return body;
}

export async function resolveWorkspaceContext(
  client: SupabaseClient,
): Promise<ActiveWorkspaceContext | null> {
  try {
    return activeWorkspaceContextSchema
      .nullable()
      .parse(await apiRequest(client, "/v1/context"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      getTabWorkspaceId() &&
      (message === "Invalid session or membership" ||
        message === "Workspace not found")
    ) {
      clearTabWorkspaceId();
      return activeWorkspaceContextSchema
        .nullable()
        .parse(await apiRequest(client, "/v1/context"));
    }
    throw error;
  }
}

/**
 * True once the account has ever held a workspace membership, including one it
 * has since lost. A new visitor is welcomed; a returning one is not.
 */
export async function loadAccountEverLinked(
  client: SupabaseClient,
): Promise<boolean> {
  const { count, error } = await client
    .from("account_organization_history")
    .select("user_id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function loadAccountProfile(
  client: SupabaseClient,
  user: User,
): Promise<AccountProfile> {
  const [profileResult, preferenceResult] = await Promise.all([
    client
      .from("user_profiles")
      .select("display_name,phone_e164")
      .eq("user_id", user.id)
      .maybeSingle(),
    client
      .from("user_preferences")
      .select("theme,time_format,date_format")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (profileResult.error) throw new Error(profileResult.error.message);
  if (preferenceResult.error) throw new Error(preferenceResult.error.message);

  const metadataName =
    typeof user.user_metadata.display_name === "string"
      ? user.user_metadata.display_name
      : "Account owner";
  // AVATAR-IKON: the account keeps no avatar; each workspace has the person's own (GET /me/avatar).
  return accountProfileSchema.parse({
    userId: user.id,
    email: user.email,
    displayName: profileResult.data?.display_name ?? metadataName,
    phone: profileResult.data?.phone_e164 ?? null,
    avatarUrl: null,
    theme: preferenceResult.data?.theme ?? "system",
    timeFormat: preferenceResult.data?.time_format ?? "system",
    dateFormat: preferenceResult.data?.date_format ?? "system",
  });
}

export async function saveAccountProfile(
  client: SupabaseClient,
  profile: AccountProfile,
): Promise<void> {
  const [profileResult, preferenceResult] = await Promise.all([
    client.from("user_profiles").upsert({
      user_id: profile.userId,
      display_name: profile.displayName,
      phone_e164: profile.phone,
      updated_at: new Date().toISOString(),
    }),
    client.from("user_preferences").upsert({
      user_id: profile.userId,
      theme: profile.theme,
      time_format: profile.timeFormat,
      date_format: profile.dateFormat,
      updated_at: new Date().toISOString(),
    }),
  ]);
  // TEL-2: the account's number reaches every live record of the person, and
  // a record refuses an emergency number equal to its own.
  if (profileResult.error?.message.includes("employee_private_profiles_emergency_is_not_own_phone"))
    throw new Error("This number is your emergency contact's in a workspace. Change that contact first.");
  if (profileResult.error) throw new Error(profileResult.error.message);
  if (preferenceResult.error) throw new Error(preferenceResult.error.message);
}

export async function uploadAccountAvatar(
  client: SupabaseClient,
  userId: string,
  file: File,
): Promise<{ avatarObjectPath: string; avatarUrl: string }> {
  const extension =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : null;
  if (!extension) throw new Error("JPG, PNG or WebP image required");
  if (file.size < 1 || file.size > 5 * 1024 * 1024) {
    throw new Error("Account photo must be 5 MB or smaller");
  }

  const avatarObjectPath = `${userId}/profile/${crypto.randomUUID()}.${extension}`;
  const bucket = client.storage.from(accountProfileAvatarBucket);
  const upload = await bucket.upload(avatarObjectPath, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);

  const signedAvatar = await bucket.createSignedUrl(avatarObjectPath, 3600);
  if (signedAvatar.error) {
    await bucket.remove([avatarObjectPath]);
    throw new Error(signedAvatar.error.message);
  }
  return { avatarObjectPath, avatarUrl: signedAvatar.data.signedUrl };
}

export async function removeAccountAvatar(
  client: SupabaseClient,
  userId: string,
  avatarObjectPath: string,
): Promise<void> {
  if (!avatarObjectPath.startsWith(`${userId}/profile/`)) {
    throw new Error("Account avatar path must belong to the account");
  }
  const result = await client.storage
    .from(accountProfileAvatarBucket)
    .remove([avatarObjectPath]);
  if (result.error) throw new Error(result.error.message);
}

export async function getCurrentUserWorkspaceAvatar(workspaceId: string): Promise<{ url: string | null }> {
  if (!supabaseClient) return { url: null };
  return await apiRequest(supabaseClient, `/v1/workspaces/${workspaceId}/me/avatar`) as { url: string | null };
}

/** What each part of the account area is waiting for from this person. */
export async function countAccountAttention(
  client: SupabaseClient,
): Promise<AccountAttention> {
  return accountAttentionSchema.parse(
    await apiRequest(client, "/v1/account/attention"),
  );
}

/**
 * The caller's own employment record in each workspace they are in. One per
 * workspace, because an employment record belongs to a workspace rather than
 * to the account.
 */
export async function listOwnEmploymentRecords(
  client: SupabaseClient,
): Promise<EmploymentContactRecord[]> {
  return employmentContactRecordSchema
    .array()
    .parse(await apiRequest(client, "/v1/account/employment-records"));
}

/** The owner's own legal name in one workspace; null until one is on file. */
export async function getOwnLegalName(
  client: SupabaseClient,
  workspaceId: string,
): Promise<OwnerLegalName | null> {
  return ownerLegalNameResponseSchema.parse(
    await apiRequest(client, `/v1/account/workspaces/${workspaceId}/legal-name`),
  ).legalName;
}

export async function saveOwnLegalName(
  client: SupabaseClient,
  workspaceId: string,
  name: OwnerLegalName,
): Promise<void> {
  await apiRequest(client, `/v1/account/workspaces/${workspaceId}/legal-name`, {
    method: "PUT",
    body: JSON.stringify(name),
  });
}

export async function listAccountWorkspaces(
  client: SupabaseClient,
): Promise<WorkspaceSummary[]> {
  return workspaceSummarySchema
    .array()
    .parse(await apiRequest(client, "/v1/account/workspaces"));
}

/** How each workspace this account belongs to has it on file. */
export async function listWorkspaceIdentities(
  client: SupabaseClient,
): Promise<WorkspaceIdentity[]> {
  return workspaceIdentitySchema
    .array()
    .parse(await apiRequest(client, "/v1/account/workspace-identities"));
}

export async function createOwnerWorkspace(
  client: SupabaseClient,
  workspaceName: string,
): Promise<string> {
  const body = await apiRequest(client, "/v1/account/workspaces", {
    method: "POST",
    body: JSON.stringify({ name: workspaceName }),
  });
  if (
    typeof body !== "object" ||
    !body ||
    !("id" in body) ||
    typeof body.id !== "string"
  ) {
    throw new Error("Workspace operation failed");
  }
  return body.id;
}

export async function selectActiveWorkspace(
  client: SupabaseClient,
  workspaceId: string,
): Promise<void> {
  setTabWorkspaceId(workspaceId);
  try {
    await apiRequest(client, "/v1/context");
  } catch (error) {
    clearTabWorkspaceId();
    throw error;
  }
}

export async function setDefaultWorkspace(
  client: SupabaseClient,
  workspaceId: string,
): Promise<void> {
  await apiRequest(client, `/v1/account/workspaces/${workspaceId}/active`, {
    method: "POST",
  });
}

export async function requestWorkspaceClosure(
  client: SupabaseClient,
  input: {
    readonly workspaceId: string;
    readonly mode: "scheduled_end_period" | "immediate";
    readonly typedWorkspaceName?: string | null;
    readonly effectiveAt?: string | null;
    /** Checked by the server; a setup its owner never finished needs none. */
    readonly password?: string;
  },
): Promise<void> {
  await apiRequest(
    client,
    `/v1/account/workspaces/${input.workspaceId}/closure`,
    {
      method: "POST",
      body: JSON.stringify({
        mode: input.mode,
        typedWorkspaceName: input.typedWorkspaceName ?? null,
        effectiveAt: input.effectiveAt ?? null,
        acknowledged: true,
        password: input.password,
      }),
    },
  );
}

export async function cancelWorkspaceClosure(
  client: SupabaseClient,
  workspaceId: string,
): Promise<void> {
  await apiRequest(
    client,
    `/v1/account/workspaces/${workspaceId}/closure/cancel`,
    { method: "POST" },
  );
}

export async function initiateWorkspaceOwnershipTransfer(
  client: SupabaseClient,
  input: {
    readonly workspaceId: string;
    readonly targetUserId: string;
    readonly password: string;
  },
): Promise<void> {
  await apiRequest(
    client,
    `/v1/account/workspaces/${input.workspaceId}/ownership-transfer`,
    {
      method: "POST",
      body: JSON.stringify({
        targetUserId: input.targetUserId,
        password: input.password,
      }),
    },
  );
}

export interface OwnershipCandidate { userId: string; name: string; email: string }

export async function searchWorkspaceOwnershipCandidates(client: SupabaseClient, workspaceId: string, query: string): Promise<OwnershipCandidate[]> {
  return await apiRequest(client, `/v1/account/workspaces/${workspaceId}/ownership-transfer/candidates?q=${encodeURIComponent(query)}`) as OwnershipCandidate[];
}

export async function cancelWorkspaceOwnershipTransfer(client: SupabaseClient, workspaceId: string, transferId: string): Promise<void> {
  await apiRequest(client, `/v1/account/workspaces/${workspaceId}/ownership-transfer/cancel`, {
    method: "POST", body: JSON.stringify({ transferId }),
  });
}

export async function respondWorkspaceOwnershipTransfer(
  client: SupabaseClient,
  input: {
    readonly workspaceId: string;
    readonly transferId: string;
    readonly action: "accept" | "reject";
    /** Accepting asks for it; rejecting does not. */
    readonly password?: string;
  },
): Promise<void> {
  await apiRequest(
    client,
    `/v1/account/workspaces/${input.workspaceId}/ownership-transfer/respond`,
    {
      method: "POST",
      body: JSON.stringify({
        transferId: input.transferId,
        action: input.action,
        password: input.password,
      }),
    },
  );
}

export interface AccountSecurityState {
  readonly emailVerified: boolean;
  readonly email: string;
  readonly pendingEmail: string | null;
  readonly emailChangeSentAt: string | null;
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

export async function loadAccountSecurityState(
  client: SupabaseClient,
): Promise<AccountSecurityState> {
  return (await apiRequest(
    client,
    "/v1/account/security",
  )) as AccountSecurityState;
}

export async function requestAccountEmailChange(
  client: SupabaseClient,
  newEmail: string,
): Promise<AccountSecurityState> {
  return (await apiRequest(client, "/v1/account/security/email-change", {
    method: "POST",
    body: JSON.stringify({ newEmail }),
  })) as AccountSecurityState;
}

export async function resendAccountEmailChange(
  client: SupabaseClient,
): Promise<void> {
  await apiRequest(client, "/v1/account/security/email-change/resend", {
    method: "POST",
  });
}

export async function cancelAccountEmailChange(
  client: SupabaseClient,
): Promise<void> {
  await apiRequest(client, "/v1/account/security/email-change", {
    method: "DELETE",
  });
}

export async function changeAccountPassword(
  client: SupabaseClient,
  input: {
    readonly currentPassword: string;
    readonly newPassword: string;
    readonly confirmPassword: string;
  },
): Promise<void> {
  await apiRequest(client, "/v1/account/security/password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function signOutOtherAccountSessions(
  client: SupabaseClient,
  currentPassword: string,
): Promise<void> {
  await apiRequest(client, "/v1/account/security/sessions/sign-out-others", {
    method: "POST",
    body: JSON.stringify({ currentPassword }),
  });
}

export async function loadAccountDeletionBlockers(
  client: SupabaseClient,
): Promise<AccountDeletionBlocker[]> {
  const response = (await apiRequest(
    client,
    "/v1/account/security/deletion/blockers",
  )) as { blockers: AccountDeletionBlocker[] };
  return response.blockers;
}

export async function requestSecureAccountDeletion(
  client: SupabaseClient,
  currentPassword: string,
): Promise<void> {
  await apiRequest(client, "/v1/account/security/deletion", {
    method: "POST",
    body: JSON.stringify({ currentPassword }),
  });
}

export async function restoreAccountDeletionWithToken(
  token: string,
): Promise<{ status: "restored"; loginUrl: string }> {
  const response = await fetch(
    `${apiUrl}/v1/account/security/deletion/recovery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    },
  );
  const body = (await response.json().catch(() => null)) as
    | { status: "restored"; loginUrl: string }
    | { error: string }
    | null;
  if (!response.ok || !body || !("status" in body)) {
    throw new Error(body && "error" in body ? body.error : "Account could not be restored");
  }
  return body;
}

// BL-137. The API answers the same whether or not the email has an account;
// only a refusal (bad email, rate limit, service down) throws.
export async function requestPasswordReset(email: string): Promise<void> {
  const response = await fetch(`${apiUrl}/v1/auth/password-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (response.ok) return;
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? "The reset link could not be sent. Try again.");
}

// Trades the reset link's one-time token for a session. This is the only way
// the reset screen gets a session; false means expired, used or not a link.
export async function openPasswordResetSession(tokenHash: string): Promise<boolean> {
  if (!supabaseClient) return false;
  clearTabWorkspaceId();
  const { data, error } = await supabaseClient.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });
  if (error || !data.session) return false;
  window.localStorage.setItem(passwordResetPendingKey, "1");
  return true;
}

export async function saveNewPassword(password: string): Promise<void> {
  if (!supabaseClient) throw new Error("Sign-in is unavailable in this browser session.");
  const { error } = await supabaseClient.auth.updateUser({ password });
  if (error) throw new Error(error.message);
  window.localStorage.removeItem(passwordResetPendingKey);
}

// The person left the reset screen without saving: the link's session goes.
export async function abandonPasswordResetSession(): Promise<void> {
  window.localStorage.removeItem(passwordResetPendingKey);
  await supabaseClient?.auth.signOut({ scope: "local" });
}

export async function saveOwnerOnboarding(
  client: SupabaseClient,
  input: {
    readonly workspaceId: string;
    readonly workspaceName: string;
    readonly nextStep: 1 | 2 | 3 | 4;
    readonly complete: boolean;
    readonly expectedRevision?: number | null;
    readonly ownerFirstName?: string;
    readonly ownerMiddleName?: string;
    readonly ownerLastName?: string;
  },
): Promise<void> {
  await apiRequest(
    client,
    `/v1/workspaces/${input.workspaceId}/owner-onboarding`,
    {
      method: "PATCH",
      body: JSON.stringify({
        workspaceName: input.workspaceName,
        nextStep: input.nextStep,
        complete: input.complete,
        expectedRevision: input.expectedRevision ?? null,
        ...(input.ownerFirstName ? { ownerFirstName: input.ownerFirstName } : {}),
        ...(input.ownerMiddleName
          ? { ownerMiddleName: input.ownerMiddleName }
          : {}),
        ...(input.ownerLastName ? { ownerLastName: input.ownerLastName } : {}),
      }),
    },
  );
}

export async function queueOwnerOnboardingInvitationIntent(
  client: SupabaseClient,
  input: {
    readonly workspaceId: string;
    readonly employeeId: string;
    readonly email: string;
  },
): Promise<void> {
  await apiRequest(
    client,
    `/v1/workspaces/${input.workspaceId}/owner-onboarding/invitation-intents`,
    {
      method: "POST",
      body: JSON.stringify({
        employeeId: input.employeeId,
        email: input.email,
      }),
    },
  );
}

export async function resetOwnerOnboarding(
  client: SupabaseClient,
  workspaceId: string,
): Promise<void> {
  await apiRequest(client, `/v1/workspaces/${workspaceId}/owner-onboarding/reset`, {
    method: "POST",
  });
}

