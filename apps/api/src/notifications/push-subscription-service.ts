import { createClient } from "@supabase/supabase-js";
import { pushDevicesSchema } from "@newfork/shared";
import { createUserVerifier } from "../auth/verify-user.js";
import { HttpError, rpcFailure } from "../http-error.js";
import type { PushSubscriptionService } from "./push-routes";

interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

/** A person's own devices, saved and removed as themselves (account.self, BILDIRIM-15). */
export function createPushSubscriptionServiceWithClients(options: {
  readonly rpcClient: RpcClient;
  resolveActorUserId(accessToken: string): Promise<string>;
}): PushSubscriptionService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await options.rpcClient.rpc(name, args);
    if (error) throw rpcFailure(error);
    return pushDevicesSchema.parse(data);
  }
  return {
    async save(accessToken, input) {
      return rpc("save_notification_push_subscription_service", {
        actor_user_id: await options.resolveActorUserId(accessToken),
        target_endpoint: input.endpoint,
        target_p256dh: input.keys.p256dh,
        target_auth: input.keys.auth,
        target_label: input.label,
      });
    },
    async remove(accessToken, endpoint) {
      return rpc("delete_notification_push_subscription_service", {
        actor_user_id: await options.resolveActorUserId(accessToken),
        target_endpoint: endpoint,
      });
    },
  };
}

export function createPushSubscriptionService(options: { url: string; anonKey: string; serviceRoleKey: string }): PushSubscriptionService {
  const authClient = createClient(options.url, options.anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const rpcClient = createClient(options.url, options.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const verifyUser = createUserVerifier(authClient);
  return createPushSubscriptionServiceWithClients({
    rpcClient,
    resolveActorUserId: async (accessToken) => {
      const user = await verifyUser(accessToken);
      if (!user) throw new HttpError("Valid bearer session required", 401);
      return user.id;
    },
  });
}
