import { z } from "zod";

// BILDIRIM-10: a person's notification list (KARARLAR S-123..S-126). The core
// (get_notification_feed_service and its two mark services) decides what is in
// it; these are the shapes the API answers with and the web reads.

const id = z.string().uuid();
const instant = z.string().datetime({ offset: true });

export const notificationFilterSchema = z.enum(["all", "unread", "needs_action"]);
export type NotificationFilter = z.infer<typeof notificationFilterSchema>;

export const notificationAreaSchema = z.enum([
  "schedule",
  "shift_changes",
  "time_off",
  "lineup",
  "people",
  "documents",
  "announcements",
  "account",
  "workspace",
]);
export type NotificationArea = z.infer<typeof notificationAreaSchema>;

export const notificationItemSchema = z.object({
  id,
  // null: a notice about the person's own account, in no workspace.
  workspace_id: id.nullable(),
  type: z.string().min(1),
  area: notificationAreaSchema,
  topic: z.string().min(1),
  level: z.enum(["required", "important", "optional"]),
  needs_action: z.boolean(),
  title: z.string().min(1),
  body: z.string().nullable(),
  // A path inside the app, never another site (the table checks it too).
  url: z.string().regex(/^\/(?:[^/\\\u0000-\u001f\u007f][^\u0000-\u001f\u007f]*)?$/).nullable(),
  data: z.record(z.string(), z.unknown()),
  actor_user_id: id.nullable(),
  subject_type: z.string().nullable(),
  subject_id: id.nullable(),
  created_at: instant,
  seen_at: instant.nullable(),
  read_at: instant.nullable(),
  resolved_at: instant.nullable(),
  resolution: z.string().nullable(),
  resolved_by: id.nullable(),
  // Who closed it, as the workspace names people (S-247): "Approved by Maria Lopez". Optional: a core
  // without it (before the slice 2 migration) still answers the contract.
  resolved_by_name: z.string().nullable().optional(),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationCountsSchema = z.object({
  unseen_count: z.number().int().nonnegative(),
  unread_count: z.number().int().nonnegative(),
  needs_action_count: z.number().int().nonnegative(),
});
export type NotificationCounts = z.infer<typeof notificationCountsSchema>;

/** A page cursor: opaque to the web, which sends it back as it came; only the API reads it. */
export const notificationCursorSchema = z.string().regex(/^[A-Za-z0-9_-]{1,300}$/);

/** One page, newest first; `next_cursor` asks for the page after it. */
export const notificationFeedSchema = notificationCountsSchema.extend({
  items: z.array(notificationItemSchema),
  has_more: z.boolean(),
  next_cursor: notificationCursorSchema.nullable(),
});
export type NotificationFeed = z.infer<typeof notificationFeedSchema>;

export const notificationFeedQuerySchema = z.object({
  filter: notificationFilterSchema.default("all"),
  before: notificationCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type NotificationFeedQuery = z.infer<typeof notificationFeedQuerySchema>;

/** Rows by id, or every unread one ("Mark all as read"); never an empty body read as "all". */
export const notificationReadInputSchema = z.union([
  z.object({ ids: z.array(id).min(1).max(100) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);
export type NotificationReadInput = z.infer<typeof notificationReadInputSchema>;

/** Read rows to mark unread again, by id (S-251); there is no "all". The answer is a read's. */
export const notificationUnreadInputSchema = z.object({ ids: z.array(id).min(1).max(100) }).strict();
export type NotificationUnreadInput = z.infer<typeof notificationUnreadInputSchema>;

export const notificationReadResultSchema = z.object({
  updated: z.number().int().nonnegative(),
  unread_count: z.number().int().nonnegative(),
});
export type NotificationReadResult = z.infer<typeof notificationReadResultSchema>;

export const notificationSeenResultSchema = z.object({
  unseen_count: z.number().int().nonnegative(),
});
export type NotificationSeenResult = z.infer<typeof notificationSeenResultSchema>;
