import {
  notificationChannelsConfigSchema,
  pushDevicesSchema,
  type NotificationChannelsConfig,
  type PushSubscriptionInput,
} from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, supabaseClient } from "../lib/supabase";
import type { PushServer } from "./push-client";

// Which outside channels the server can send on now (BILDIRIM-15), and this
// device's phone alerts on the server. A screen that cannot tell says
// "Coming soon": it never promises a channel that is not set up (S-124).

export const notificationChannelsKey = ["notification-channels"] as const;

export const channelsNotReady: NotificationChannelsConfig = {
  email: { available: false },
  push: { available: false, public_key: null },
};

function client() {
  if (!supabaseClient) throw new Error("Notifications are not configured");
  return supabaseClient;
}

export async function loadNotificationChannels(): Promise<NotificationChannelsConfig> {
  return notificationChannelsConfigSchema.parse(await apiRequest(client(), "/v1/account/notification-channels"));
}

export function useNotificationChannels(enabled = true): NotificationChannelsConfig {
  const query = useQuery({
    queryKey: notificationChannelsKey,
    queryFn: loadNotificationChannels,
    staleTime: 5 * 60_000,
    retry: false,
    enabled,
  });
  return query.data ?? channelsNotReady;
}

export const pushServer: PushServer = {
  async save(input: PushSubscriptionInput) {
    return pushDevicesSchema.parse(
      await apiRequest(client(), "/v1/account/push-subscription", { method: "PUT", body: JSON.stringify(input) }),
    );
  },
  async remove(endpoint: string) {
    return pushDevicesSchema.parse(
      await apiRequest(client(), "/v1/account/push-subscription", { method: "DELETE", body: JSON.stringify({ endpoint }) }),
    );
  },
};
