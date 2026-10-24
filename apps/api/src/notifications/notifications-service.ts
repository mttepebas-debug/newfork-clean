import { createClient } from "@supabase/supabase-js";
import {
  notificationCountsSchema,
  notificationFeedSchema,
  notificationReadResultSchema,
  notificationSeenResultSchema,
  type NotificationCounts,
  type NotificationFeed,
  type NotificationFilter,
  type NotificationReadInput,
  type NotificationReadResult,
  type NotificationSeenResult,
  type NotificationUnreadInput,
} from "@newfork/shared";
import { rpcFailure } from "../http-error";
import { encodeNotificationCursor, type NotificationCursor } from "./notifications-cursor";

interface Actor {
  readonly actorUserId: string;
  readonly workspaceId: string;
}

/** A page request with its cursor already read (the route decodes it). */
export interface NotificationPageRequest {
  readonly filter: NotificationFilter;
  readonly before: NotificationCursor | null;
  readonly limit: number;
}

export interface NotificationsService {
  feed(input: Actor & { readonly query: NotificationPageRequest }): Promise<NotificationFeed>;
  counts(input: Actor): Promise<NotificationCounts>;
  markSeen(input: Actor): Promise<NotificationSeenResult>;
  markRead(input: Actor & { readonly read: NotificationReadInput }): Promise<NotificationReadResult>;
  markUnread(input: Actor & { readonly unread: NotificationUnreadInput }): Promise<NotificationReadResult>;
}

type RpcError = { message: string; code?: string; hint?: string | null; details?: string | null };
interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

export function createNotificationsService(options: { url: string; serviceRoleKey: string }): NotificationsService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as RpcClient;
  return notificationsService(client);
}

export function notificationsServiceFromEnvironment(): NotificationsService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? createNotificationsService({ url, serviceRoleKey }) : null;
}

/**
 * BILDIRIM-10: the person's own list. Every core service asks the
 * authorization core itself (notifications.read_own), so a stranger's no comes
 * back as 404 and any other as 403 through rpcFailure.
 */
export function notificationsService(client: RpcClient): NotificationsService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw rpcFailure(error);
    return data;
  }
  // The core pages by time and id (BILDIRIM-12): the cursor's two halves, both or neither.
  const feedArgs = (actor: Actor, filter: string, before: NotificationCursor | null, limit: number) => ({
    actor_user_id: actor.actorUserId,
    target_workspace_id: actor.workspaceId,
    target_filter: filter,
    target_before: before?.at ?? null,
    target_before_id: before?.id ?? null,
    target_limit: limit,
  });
  return {
    async feed({ query, ...actor }) {
      const page = notificationFeedSchema
        .omit({ next_cursor: true })
        .parse(await rpc("get_notification_feed_service", feedArgs(actor, query.filter, query.before, query.limit)));
      const last = page.items.at(-1);
      return { ...page, next_cursor: page.has_more && last ? encodeNotificationCursor({ at: last.created_at, id: last.id }) : null };
    },
    async counts(actor) {
      // The badge reads the counts beside the newest row; one row is the smallest page the core gives.
      return notificationCountsSchema.parse(await rpc("get_notification_feed_service", feedArgs(actor, "all", null, 1)));
    },
    async markSeen(actor) {
      return notificationSeenResultSchema.parse(await rpc("mark_notifications_seen_service", {
        actor_user_id: actor.actorUserId, target_workspace_id: actor.workspaceId,
      }));
    },
    async markRead({ read, ...actor }) {
      return notificationReadResultSchema.parse(await rpc("mark_notifications_read_service", {
        actor_user_id: actor.actorUserId, target_workspace_id: actor.workspaceId,
        target_ids: "ids" in read ? read.ids : null,
      }));
    },
    // S-251: only rows named by id; the core refuses none (22023) rather than reading it as all.
    async markUnread({ unread, ...actor }) {
      return notificationReadResultSchema.parse(await rpc("mark_notifications_unread_service", {
        actor_user_id: actor.actorUserId, target_workspace_id: actor.workspaceId, target_ids: unread.ids,
      }));
    },
  };
}
