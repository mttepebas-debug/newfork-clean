import { describe, expect, it, vi } from "vitest";
import { decodeNotificationCursor } from "./notifications-cursor";
import { notificationsService } from "./notifications-service";

const actor = { actorUserId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5", workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd" };
const row = (id: string, created_at: string) => ({
  id, workspace_id: actor.workspaceId, type: "schedule.published", area: "schedule", topic: "my_schedule", level: "important",
  needs_action: false, title: "Your schedule is out", body: null, url: "/app/employee-hub/schedule", data: {},
  actor_user_id: null, subject_type: null, subject_id: null, created_at, seen_at: null, read_at: null,
  resolved_at: null, resolution: null, resolved_by: null,
});
const counts = { unseen_count: 1, unread_count: 2, needs_action_count: 0 };

function client(data: unknown) {
  return { rpc: vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data, error: null })) };
}

describe("notifications service", () => {
  it("asks the core for a page and names the next one by its last row", async () => {
    const rows = [row("13253395-6150-43b9-bb13-364014baae15", "2026-10-16T16:38:10.2327+00:00"),
      row("5beb3f8b-0b54-48ed-ac48-abc004de70de", "2026-10-16T15:00:00+00:00")];
    const rpc = client({ items: rows, has_more: true, ...counts });
    const page = await notificationsService(rpc).feed({ ...actor, query: { filter: "unread", before: { at: "2026-10-17T00:00:00Z", id: "5beb3f8b-0b54-48ed-ac48-abc004de70de" }, limit: 2 } });
    expect(rpc.rpc).toHaveBeenCalledWith("get_notification_feed_service", {
      actor_user_id: actor.actorUserId, target_workspace_id: actor.workspaceId,
      target_filter: "unread", target_before: "2026-10-17T00:00:00Z",
      // BILDIRIM-12: the core pages by time and id; two notices of one time never lose one at a page break.
      target_before_id: "5beb3f8b-0b54-48ed-ac48-abc004de70de", target_limit: 2,
    });
    expect(decodeNotificationCursor(page.next_cursor!)).toEqual({ at: "2026-10-16T15:00:00+00:00", id: "5beb3f8b-0b54-48ed-ac48-abc004de70de" });
    expect(page.items).toHaveLength(2);
  });

  it("has no next page on the last one", async () => {
    const rpc = client({ items: [row("13253395-6150-43b9-bb13-364014baae15", "2026-10-16T16:38:10+00:00")], has_more: false, ...counts });
    const page = await notificationsService(rpc).feed({ ...actor, query: { filter: "all", before: null, limit: 30 } });
    expect(page.next_cursor).toBeNull();
    expect(rpc.rpc.mock.calls[0]?.[1]).toMatchObject({ target_before: null, target_before_id: null });
  });

  it("counts from the smallest page", async () => {
    const rpc = client({ items: [], has_more: false, ...counts });
    expect(await notificationsService(rpc).counts(actor)).toEqual(counts);
    expect(rpc.rpc.mock.calls[0]?.[1]).toMatchObject({ target_filter: "all", target_limit: 1 });
  });

  it("reads rows by id, and every row with no ids", async () => {
    const rpc = client({ updated: 1, unread_count: 0 });
    const service = notificationsService(rpc);
    await service.markRead({ ...actor, read: { ids: ["13253395-6150-43b9-bb13-364014baae15"] } });
    await service.markRead({ ...actor, read: { all: true } });
    expect(rpc.rpc.mock.calls[0]).toEqual(["mark_notifications_read_service", {
      actor_user_id: actor.actorUserId, target_workspace_id: actor.workspaceId, target_ids: ["13253395-6150-43b9-bb13-364014baae15"],
    }]);
    expect(rpc.rpc.mock.calls[1]?.[1]).toMatchObject({ target_ids: null });
  });

  it("marks rows unread again by id (S-251)", async () => {
    const rpc = client({ updated: 1, unread_count: 3 });
    const result = await notificationsService(rpc).markUnread({ ...actor, unread: { ids: ["13253395-6150-43b9-bb13-364014baae15"] } });
    expect(result).toEqual({ updated: 1, unread_count: 3 });
    expect(rpc.rpc).toHaveBeenCalledWith("mark_notifications_unread_service", {
      actor_user_id: actor.actorUserId, target_workspace_id: actor.workspaceId, target_ids: ["13253395-6150-43b9-bb13-364014baae15"],
    });
  });

  it("answers the core's 'no rows named' with 400", async () => {
    const refusing = { rpc: vi.fn(async () => ({ data: null, error: { message: "notifications to mark unread required", code: "22023", hint: "notifications.ids_required" } })) };
    await expect(notificationsService(refusing).markUnread({ ...actor, unread: { ids: ["13253395-6150-43b9-bb13-364014baae15"] } }))
      .rejects.toMatchObject({ statusCode: 400, reason: "notifications.ids_required" });
  });

  it("refuses an unread answer that is not the core's shape", async () => {
    await expect(notificationsService(client({ updated: -1 })).markUnread({ ...actor, unread: { ids: ["13253395-6150-43b9-bb13-364014baae15"] } }))
      .rejects.toThrow();
  });

  it("marks the list seen", async () => {
    const rpc = client({ unseen_count: 0 });
    expect(await notificationsService(rpc).markSeen(actor)).toEqual({ unseen_count: 0 });
    expect(rpc.rpc).toHaveBeenCalledWith("mark_notifications_seen_service", {
      actor_user_id: actor.actorUserId, target_workspace_id: actor.workspaceId,
    });
  });

  it("turns the core's no into 404 and 403", async () => {
    const refusing = (hint: string) => ({ rpc: vi.fn(async () => ({ data: null, error: { message: "Not allowed", code: "42501", hint } })) });
    await expect(notificationsService(refusing("authz.not_member")).counts(actor)).rejects.toMatchObject({ statusCode: 404 });
    await expect(notificationsService(refusing("authz.out_of_scope")).markSeen(actor)).rejects.toMatchObject({ statusCode: 403, reason: "authz.out_of_scope" });
    const unread = { ...actor, unread: { ids: ["13253395-6150-43b9-bb13-364014baae15"] } };
    await expect(notificationsService(refusing("authz.not_member")).markUnread(unread)).rejects.toMatchObject({ statusCode: 404, reason: "authz.not_member" });
    await expect(notificationsService(refusing("authz.not_active")).markUnread(unread)).rejects.toMatchObject({ statusCode: 403, reason: "authz.not_active" });
  });
});
