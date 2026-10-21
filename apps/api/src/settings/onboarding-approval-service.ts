import { onboardingApprovalSettingsSchema, type OnboardingApprovalSettings } from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";
import { rpcFailure } from "../http-error";

interface Actor {
  readonly actorUserId: string;
  readonly workspaceId: string;
}

export interface OnboardingApprovalService {
  read(input: Actor): Promise<OnboardingApprovalSettings>;
  save(input: Actor & { readonly finalApprovalRequired: boolean }): Promise<OnboardingApprovalSettings>;
}

interface RpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string; hint?: string | null } | null }>;
}

// Settings > General, "New people wait for approval" (KATILIM-ONAY, S-231). The database asks the core
// itself: workspace.read to read it, settings.organization.write to change it; turning it off lets in
// the people waiting only for approval.
export function createOnboardingApprovalService(options: { url: string; serviceRoleKey: string }): OnboardingApprovalService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as RpcClient;

  async function call(name: string, input: Actor, extra: Record<string, unknown> = {}) {
    const { data, error } = await client.rpc(name, {
      actor_user_id: input.actorUserId,
      target_workspace_id: input.workspaceId,
      ...extra,
    });
    if (error) throw rpcFailure(error);
    return onboardingApprovalSettingsSchema.parse(data);
  }

  return {
    read: (input) => call("get_onboarding_approval_service", input),
    save: (input) =>
      call("set_onboarding_approval_service", input, { approval_required: input.finalApprovalRequired }),
  };
}

export function createOnboardingApprovalServiceFromEnvironment(): OnboardingApprovalService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? createOnboardingApprovalService({ url, serviceRoleKey }) : null;
}
