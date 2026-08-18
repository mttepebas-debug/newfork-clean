import {
  accountProfileSchema,
  activeWorkspaceContextFromRow,
  activeWorkspaceRowSchema,
  workspaceSummaryFromRow,
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

export async function resolveWorkspaceContext(
  client: SupabaseClient,
): Promise<ActiveWorkspaceContext | null> {
  const { data, error } = await client.rpc("resolve_active_workspace");
  if (error) throw new Error(error.message);

  const row = activeWorkspaceRowSchema.nullable().parse(data?.[0] ?? null);
  if (!row) return null;

  let locationIds: string[] = [];
  if (!row.all_locations) {
    const { data: scopes, error: scopesError } = await client
      .from("membership_location_scopes")
      .select("location_id")
      .eq("membership_id", row.membership_id);
    if (scopesError) throw new Error(scopesError.message);
    locationIds = (scopes ?? []).map((scope) => String(scope.location_id));
  }

  return activeWorkspaceContextFromRow(row, locationIds);
}

export async function loadAccountProfile(
  client: SupabaseClient,
  user: User,
): Promise<AccountProfile> {
  const [profileResult, preferenceResult] = await Promise.all([
    client
      .from("user_profiles")
      .select("display_name")
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
  const { data, error } = await client.rpc("list_my_workspaces");
  if (error) throw new Error(error.message);
  return (data ?? []).map(workspaceSummaryFromRow);
}

export async function createOwnerWorkspace(
  client: SupabaseClient,
  workspaceName: string,
): Promise<string> {
  const { data, error } = await client.rpc("create_owner_workspace", {
    workspace_name: workspaceName,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function selectActiveWorkspace(
  client: SupabaseClient,
  workspaceId: string,
): Promise<void> {
  const { error } = await client.rpc("set_active_workspace", {
    target_workspace_id: workspaceId,
  });
  if (error) throw new Error(error.message);
}

export async function saveOwnerOnboarding(
  client: SupabaseClient,
  input: {
    readonly workspaceId: string;
    readonly workspaceName: string;
    readonly nextStep: 1 | 2;
    readonly complete: boolean;
  },
): Promise<void> {
  const { error } = await client.rpc("update_owner_onboarding", {
    target_workspace_id: input.workspaceId,
    workspace_name: input.workspaceName,
    next_step: input.nextStep,
    mark_complete: input.complete,
  });
  if (error) throw new Error(error.message);
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
