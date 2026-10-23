import type { NotificationFeed, NotificationItem } from "@newfork/shared";

/** A row as the core writes it (an open time off request of the new table, D7), changed where a test says. */
export function notice(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "13253395-6150-43b9-bb13-364014baae15",
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    type: "time_off.requested",
    area: "time_off",
    topic: "approvals",
    level: "important",
    needs_action: true,
    title: "Time off request from Tom Becker",
    body: "Wed, Oct 21 · Jury duty summons.",
    url: "/app/schedule/requests?type=time_off&request=98020000-0000-4000-8000-000000000001",
    data: {},
    actor_user_id: null,
    subject_type: "time_off",
    subject_id: "98020000-0000-4000-8000-000000000001",
    created_at: "2026-10-16T16:38:10.2327+00:00",
    seen_at: null,
    read_at: null,
    resolved_at: null,
    resolution: null,
    resolved_by: null,
    ...overrides,
  };
}

/** One page of the list with its counts. */
export function feedPage(items: NotificationItem[], overrides: Partial<NotificationFeed> = {}): NotificationFeed {
  return { items, has_more: false, next_cursor: null, unseen_count: 0, unread_count: items.filter((item) => !item.read_at).length, needs_action_count: items.filter((item) => item.needs_action && !item.resolved_at).length, ...overrides };
}
