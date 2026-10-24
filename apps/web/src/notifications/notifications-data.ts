import {
  notificationCountsSchema,
  notificationFeedSchema,
  notificationReadResultSchema,
  notificationSeenResultSchema,
  type NotificationCounts,
  type NotificationFeed,
  type NotificationFilter,
  type NotificationReadInput,
  type NotificationUnreadInput,
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
/** The answer is a read's: how many rows changed and the unread count now. */
export async function markNotificationsUnread(workspaceId: string, unread: NotificationUnreadInput) {
  return notificationReadResultSchema.parse(
    await notificationsApi(workspaceId, "/unread", { method: "POST", body: JSON.stringify(unread) }),
  );
}
export async function markNotificationsSeen(workspaceId: string) {
  return notificationSeenResultSchema.parse(await notificationsApi(workspaceId, "/seen", { method: "POST" }));
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

type CachedFeed = InfiniteData<NotificationFeed> | NotificationFeed;
const feedItems = (data: CachedFeed) => ("pages" in data ? data.pages.flatMap((page) => page.items) : data.items);

export function useMarkNotificationsRead(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (read: NotificationReadInput) => markNotificationsRead(workspaceId, read),
    onMutate: async (read) => {
      // A refresh already on its way (the one an Unread just started) carries the answer from before this read.
      await client.cancelQueries({ queryKey: notificationKeys.all(workspaceId) });
      // The row looks read at once, and the bell and the tabs drop with it; the refetch below brings the core's own answer.
      // The list keeps pages; employee Home keeps one plain page under the same key prefix.
      const now = new Date().toISOString();
      const isRead = (id: string) => "all" in read || read.ids.includes(id);
      const feeds = client.getQueriesData<CachedFeed>({ queryKey: [...notificationKeys.all(workspaceId), "feed"] });
      const newlyRead = new Set(
        feeds.flatMap(([, data]) => (data ? feedItems(data) : [])).filter((item) => isRead(item.id) && !item.read_at).map((item) => item.id),
      );
      const readItem = (item: NotificationFeed["items"][number]) =>
        isRead(item.id) && !item.read_at ? { ...item, read_at: now, seen_at: item.seen_at ?? now } : item;
      client.setQueriesData<CachedFeed>({ queryKey: [...notificationKeys.all(workspaceId), "feed"] }, (data) => {
        if (!data) return data;
        if ("pages" in data) return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map(readItem) })) };
        return { ...data, items: data.items.map(readItem) };
      });
      client.setQueryData<NotificationCounts>(notificationKeys.counts(workspaceId), (counts) =>
        counts ? { ...counts, unread_count: "all" in read ? 0 : Math.max(0, counts.unread_count - newlyRead.size) } : counts,
      );
    },
    onSuccess: (result) =>
      client.setQueryData<NotificationCounts>(notificationKeys.counts(workspaceId), (counts) =>
        counts ? { ...counts, unread_count: result.unread_count } : counts,
      ),
    onSettled: () => client.invalidateQueries({ queryKey: notificationKeys.all(workspaceId) }),
  });
}

/**
 * A read row swiped on the phone is unread again (S-251), like a read in reverse: the row shows its dot at once in
 * the list and on employee Home, the bell and the tabs rise with it, and the refetch brings the core's own answer.
 * It keeps seen_at, so it stays under New or Earlier where it was.
 */
export function useMarkNotificationsUnread(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (unread: NotificationUnreadInput) => markNotificationsUnread(workspaceId, unread),
    onMutate: async (unread) => {
      // A refresh already on its way (the one a Read just started) carries the answer from before this Unread.
      await client.cancelQueries({ queryKey: notificationKeys.all(workspaceId) });
      const isRead = (item: NotificationFeed["items"][number]) => unread.ids.includes(item.id) && Boolean(item.read_at);
      const feeds = client.getQueriesData<CachedFeed>({ queryKey: [...notificationKeys.all(workspaceId), "feed"] });
      const newlyUnread = new Set(feeds.flatMap(([, data]) => (data ? feedItems(data) : [])).filter(isRead).map((item) => item.id));
      const unreadItem = (item: NotificationFeed["items"][number]) => (isRead(item) ? { ...item, read_at: null } : item);
      client.setQueriesData<CachedFeed>({ queryKey: [...notificationKeys.all(workspaceId), "feed"] }, (data) => {
        if (!data) return data;
        if ("pages" in data) return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map(unreadItem) })) };
        return { ...data, items: data.items.map(unreadItem) };
      });
      client.setQueryData<NotificationCounts>(notificationKeys.counts(workspaceId), (counts) =>
        counts ? { ...counts, unread_count: counts.unread_count + newlyUnread.size } : counts,
      );
    },
    onSuccess: (result) =>
      client.setQueryData<NotificationCounts>(notificationKeys.counts(workspaceId), (counts) =>
        counts ? { ...counts, unread_count: result.unread_count } : counts,
      ),
    onSettled: () => client.invalidateQueries({ queryKey: notificationKeys.all(workspaceId) }),
  });
}

/**
 * Opening the list marks what it shows as seen (S-247 (2)); the badge is the unread count, so it stays.
 * `ids` are the rows this list showed as new: the cache marks them seen, so a list opened again within the
 * cache's life shows them under Earlier (a notice that came in between keeps its New).
 */
export function useMarkNotificationsSeen(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (_ids: readonly string[]) => markNotificationsSeen(workspaceId),
    onSuccess: (_result, ids) => {
      const now = new Date().toISOString();
      const seeItem = (item: NotificationFeed["items"][number]) => (ids.includes(item.id) && !item.seen_at ? { ...item, seen_at: now } : item);
      client.setQueriesData<CachedFeed>({ queryKey: [...notificationKeys.all(workspaceId), "feed"] }, (data) => {
        if (!data) return data;
        if ("pages" in data) return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map(seeItem) })) };
        return { ...data, items: data.items.map(seeItem) };
      });
    },
  });
}
