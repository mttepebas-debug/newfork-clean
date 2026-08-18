import {
  activeWorkspaceContextFromRow,
  activeWorkspaceRowSchema,
  type ActiveWorkspaceContext,
} from "@newfork/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface WorkspaceContextResolver {
  resolve(accessToken: string): Promise<ActiveWorkspaceContext | null>;
}

interface SupabaseResolverOptions {
  readonly url: string;
  readonly anonKey: string;
}

function createRequestClient(
  options: SupabaseResolverOptions,
  accessToken: string,
): SupabaseClient {
  return createClient(options.url, options.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function createSupabaseWorkspaceContextResolver(
  options: SupabaseResolverOptions,
): WorkspaceContextResolver {
  const authClient = createClient(options.url, options.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    async resolve(accessToken) {
      const { data: userData, error: userError } =
        await authClient.auth.getUser(accessToken);
      if (userError || !userData.user) return null;

      const requestClient = createRequestClient(options, accessToken);
      const { data, error } = await requestClient.rpc(
        "resolve_active_workspace",
      );
      if (error)
        throw new Error(`Active workspace resolution failed: ${error.message}`);

      const row = activeWorkspaceRowSchema.nullable().parse(data?.[0] ?? null);
      if (!row || row.user_id !== userData.user.id) return null;

      let locationIds: string[] = [];
      if (!row.all_locations) {
        const { data: scopes, error: scopesError } = await requestClient
          .from("membership_location_scopes")
          .select("location_id")
          .eq("membership_id", row.membership_id);
        if (scopesError)
          throw new Error(
            `Location scope resolution failed: ${scopesError.message}`,
          );
        locationIds = (scopes ?? []).map((scope) => String(scope.location_id));
      }

      return activeWorkspaceContextFromRow(row, locationIds);
    },
  };
}
