import {
  notificationCountsSchema,
  notificationFeedSchema,
  notificationReadResultSchema,
  type NotificationFeed,
  type NotificationFilter,
  type NotificationReadInput,
} from "@newfork/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { apiRequest, supabaseClient } from "../lib/supabase";

// BILDIRIM-10: one's own notification list, through the API (the core asks
// notifications.read_own). The first key item is in tenant-query-cache.

export const notificationKeys = {
  all: (workspaceId: string) => ["notifications", workspaceId] as const,
  counts: (workspaceId: string) => ["notifications", workspaceId, "counts"] as const,
  feed: (workspaceId: string, filter: NotificationFilter) => ["notifications", workspaceId, "feed", filter] as const,
};

const pageSize = 30;

function notificationsApi(workspaceId: string, path: string, init?: RequestInit) {
  if (!supabaseClient) throw new Error("Notification storage is not configured");
  return apiRequest(supabaseClient, `/v1/workspaces/${workspaceId}/notifications${path}`, init);
}

export async function getNotificationFeed(workspaceId: string, filter: NotificationFilter, before?: string) {
  const query = new URLSearchParams({ filter, limit: String(pageSize) });
  if (before) query.set("before", before);
  return notificationFeedSchema.parse(await notificationsApi(workspaceId, `?${query}`));
}
export async function getNotificationCounts(workspaceId: string) {
  return notificationCountsSchema.parse(await notificationsApi(workspaceId, "/count"));
}
export async function markNotificationsRead(workspaceId: string, read: NotificationReadInput) {
  return notificationReadResultSchema.parse(
    await notificationsApi(workspaceId, "/read", { method: "POST", body: JSON.stringify(read) }),
  );
}

/** The badge and the tabs' counts; the badge shows unread_count. */
export function useNotificationCounts(workspaceId: string | undefined) {
  return useQuery({
    queryKey: notificationKeys.counts(workspaceId ?? ""),
    queryFn: () => getNotificationCounts(workspaceId!),
    enabled: Boolean(workspaceId),
    // The live signal refreshes it; this only covers a dropped channel.
    refetchInterval: 120_000,
  });
}

export function useNotificationFeed(workspaceId: string, filter: NotificationFilter, enabled = true) {
  return useInfiniteQuery({
    queryKey: notificationKeys.feed(workspaceId, filter),
    queryFn: ({ pageParam }) => getNotificationFeed(workspaceId, filter, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: enabled && Boolean(workspaceId),
  });
}

export function useMarkNotificationsRead(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (read: NotificationReadInput) => markNotificationsRead(workspaceId, read),
    onMutate: (read) => {
      // The row looks read at once; the refetch below brings the core's own answer.
      const now = new Date().toISOString();
      const isRead = (id: string) => "all" in read || read.ids.includes(id);
      client.setQueriesData<InfiniteData<NotificationFeed>>({ queryKey: [...notificationKeys.all(workspaceId), "feed"] }, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.map((item) =>
                  isRead(item.id) && !item.read_at ? { ...item, read_at: now, seen_at: item.seen_at ?? now } : item,
                ),
              })),
            }
          : data,
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: notificationKeys.all(workspaceId) }),
  });
}
