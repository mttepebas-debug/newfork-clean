import {
  accountProfileSchema,
  activeWorkspaceContextSchema,
  workspaceSummarySchema,
  type AccountProfile,
  type ActiveWorkspaceContext,
  type ThemePreference,
  type WorkspaceSummary,
} from "@newfork/shared";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const apiUrl =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? "http://localhost:9999" : "");
export const newforkApiUrl = apiUrl;

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

export const developmentIdentityAllowed =
  import.meta.env.DEV &&
  import.meta.env.VITE_ALLOW_DEVELOPMENT_IDENTITY !== "false";

export const developmentIdentityRoleStorageKey =
  "newfork.development.workspaceRole";
export const tabWorkspaceIdStorageKey = "newfork.tabWorkspaceId";
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

export function developmentBearerToken(): string | null {
  if (!developmentIdentityAllowed || typeof window === "undefined") return null;
  const role = window.localStorage.getItem(developmentIdentityRoleStorageKey);
  return role === "owner" ||
    role === "admin" ||
    role === "manager" ||
    role === "employee"
    ? `development-${role}-token`
    : null;
}

async function accessToken(client: SupabaseClient): Promise<string> {
  const developmentToken = developmentBearerToken();
  if (developmentToken) return developmentToken;

  const token = (await client.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error("A current session is required");
  return token;
}

export async function getApiAccessToken(
  client: SupabaseClient,
): Promise<string> {
  return accessToken(client);
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
  if (!response.ok) {
    throw new Error(
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : "Workspace operation failed",
    );
  }
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

export async function loadAccountProfile(
  client: SupabaseClient,
  user: User,
): Promise<AccountProfile> {
  const [profileResult, preferenceResult] = await Promise.all([
    client
      .from("user_profiles")
      .select("display_name,phone")
      .eq("user_id", user.id)
      .maybeSingle(),
    client
      .from("user_preferences")
      .select("theme")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (profileResult.error) throw new Error(profileResult.error.message);
  if (preferenceResult.error) throw new Error(preferenceResult.error.message);

  const metadataName =
    typeof user.user_metadata.display_name === "string"
      ? user.user_metadata.display_name
      : "Account owner";
  return accountProfileSchema.parse({
    userId: user.id,
    email: user.email,
    displayName: profileResult.data?.display_name ?? metadataName,
    phone: profileResult.data?.phone ?? null,
    theme: preferenceResult.data?.theme ?? "system",
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
      phone: profile.phone,
      updated_at: new Date().toISOString(),
    }),
    client.from("user_preferences").upsert({
      user_id: profile.userId,
      theme: profile.theme,
      updated_at: new Date().toISOString(),
    }),
  ]);
  if (profileResult.error) throw new Error(profileResult.error.message);
  if (preferenceResult.error) throw new Error(preferenceResult.error.message);
}

export async function listAccountWorkspaces(
  client: SupabaseClient,
): Promise<WorkspaceSummary[]> {
  return workspaceSummarySchema
    .array()
    .parse(await apiRequest(client, "/v1/account/workspaces"));
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

export async function requestWorkspaceClosure(
  client: SupabaseClient,
  input: {
    readonly workspaceId: string;
    readonly mode: "scheduled_end_period" | "immediate";
    readonly typedWorkspaceName?: string | null;
    readonly effectiveAt?: string | null;
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
  },
): Promise<void> {
  await apiRequest(
    client,
    `/v1/account/workspaces/${input.workspaceId}/ownership-transfer`,
    {
      method: "POST",
      body: JSON.stringify({ targetUserId: input.targetUserId }),
    },
  );
}

export async function respondWorkspaceOwnershipTransfer(
  client: SupabaseClient,
  input: {
    readonly workspaceId: string;
    readonly transferId: string;
    readonly action: "accept" | "reject";
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
      }),
    },
  );
}

export async function requestAccountDeletion(
  client: SupabaseClient,
  input: {
    readonly typedEmail: string;
    readonly acknowledged: boolean;
  },
): Promise<void> {
  await apiRequest(client, "/v1/account/deletion", {
    method: "POST",
    body: JSON.stringify({
      typedEmail: input.typedEmail,
      acknowledged: input.acknowledged,
    }),
  });
}

export async function restoreAccountDeletion(
  client: SupabaseClient,
): Promise<void> {
  await apiRequest(client, "/v1/account/deletion/restore", {
    method: "POST",
  });
}

export async function saveOwnerOnboarding(
  client: SupabaseClient,
  input: {
    readonly workspaceId: string;
    readonly workspaceName: string;
    readonly nextStep: 1 | 2 | 3 | 4;
    readonly complete: boolean;
    readonly expectedRevision?: number | null;
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

export function applyThemePreference(theme: ThemePreference): void {
  const systemPrefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved =
    theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}
