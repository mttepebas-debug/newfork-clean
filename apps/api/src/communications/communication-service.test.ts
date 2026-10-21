import { describe, expect, it, vi } from "vitest";
import { createCommunicationServiceWithClient } from "./communication-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";

describe("communication service", () => {
  it("hands the drawer to the one save service with its intent, and the preview its intent in the payload (EKRAN-08)", async () => {
    const announcementId = "a8200000-0000-4000-8000-000000000001";
    const draft = {
      title: "Closed for inventory", body: "", category: "other" as const, category_other: "Inventory",
      starts_on: "2027-01-04", ends_on: null, event_from: null, event_until: null, recurrence: "none" as const,
      on_important_dates: true, on_calendar: false, on_schedule: true, ask_ack: false, publish_at: null,
      locations: [{ location_id: announcementId, day: "closed" as const, opens: null, closes: null }],
      people: [], choices: {}, fingerprint: "f", bring_back: [],
    };
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          problems: [], fingerprint: "f", shifts: [], hidden_count: 0, quiet_count: 0,
          counts: { removed: 0, edited: 0, opened: 0, kept: 0, quiet: 0 }, bring_back: [],
          time_zone: "America/Los_Angeles", starts_at: null, ends_at: null, recipient_count: 2,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          status: "published", display_status: "published", announcement_id: announcementId, revision: 1,
          recipient_count: 2, shift_changes: 0, brought_back: 0,
        },
        error: null,
      });
    const service = createCommunicationServiceWithClient({ rpc });

    await service.previewAnnouncement({ actorUserId: userId, workspaceId, announcementId: null, intent: "publish", announcement: draft });
    const saved = await service.saveAnnouncement({
      actorUserId: userId, workspaceId, announcementId: null, expectedRevision: null, intent: "publish", announcement: draft,
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "preview_announcement_service", {
      actor_user_id: userId, target_workspace_id: workspaceId, target_announcement_id: null,
      target_payload: { ...draft, intent: "publish" },
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "save_announcement_service", {
      actor_user_id: userId, target_workspace_id: workspaceId, target_announcement_id: null,
      target_expected_revision: null, target_payload: draft, target_intent: "publish",
    });
    expect(saved.recipient_count).toBe(2);
  });

  it("routes manual Workspace todo creation through the service RPC", async () => {
    const todoId = "a9700000-0000-4000-8000-000000000011";
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: todoId,
        workspace_id: workspaceId,
        title: "Follow up",
        body: "Call employee",
        severity: "info",
        status: "open",
        system_generated: false,
        source_type: "manual",
        source_id: "a9700000-0000-4000-8000-000000000012",
        source_key: "manual:a9700000-0000-4000-8000-000000000012",
        employee_id: null,
        due_at: null,
        action_url: null,
        created_at: "2026-09-05T12:00:00.000Z",
      },
      error: null,
    });
    const service = createCommunicationServiceWithClient({ rpc });

    const result = await service.createWorkspaceTodo({
      actorUserId: userId,
      workspaceId,
      todo: {
        title: "Follow up",
        body: "Call employee",
        employee_id: null,
        due_at: null,
      },
    });

    expect(result.id).toBe(todoId);
    expect(rpc).toHaveBeenCalledWith("create_workspace_todo_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      todo_title: "Follow up",
      todo_body: "Call employee",
      target_employee_id: null,
      target_due_at: null,
    });
  });

  it("routes manual Workspace todo resolution through the service RPC", async () => {
    const todoId = "a9700000-0000-4000-8000-000000000011";
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: todoId,
        workspace_id: workspaceId,
        title: "Follow up",
        body: "",
        severity: "info",
        status: "resolved",
        system_generated: false,
        source_type: "manual",
        source_id: "a9700000-0000-4000-8000-000000000012",
        source_key: "manual:a9700000-0000-4000-8000-000000000012",
        employee_id: null,
        due_at: null,
        action_url: null,
        created_at: "2026-09-05T12:00:00.000Z",
      },
      error: null,
    });
    const service = createCommunicationServiceWithClient({ rpc });

    await service.resolveWorkspaceTodo({
      actorUserId: userId,
      workspaceId,
      todoId,
    });

    expect(rpc).toHaveBeenCalledWith("resolve_workspace_todo_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      target_todo_id: todoId,
    });
  });

  // S-220: Customize saves the eight sections and the person's own order of the location cards.
  it("saves the Home layout with the location order through the five-argument service", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { status: "saved" }, error: null });
    const service = createCommunicationServiceWithClient({ rpc });
    const order = ["operations", "pending_requests", "quick_actions", "updates", "open_shifts", "announcements", "coming_up", "todos"] as const;
    const locationId = "20409979-fe36-4ee6-8461-1ba62eb4dbac";

    await service.saveWorkspaceLayout({
      actorUserId: userId,
      workspaceId,
      layout: { widget_order: [...order], hidden_widget_ids: ["todos"], location_order: [locationId] },
    });

    expect(rpc).toHaveBeenCalledWith("save_workspace_layout_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      target_widget_order: [...order],
      target_hidden_widget_ids: ["todos"],
      target_location_order: [locationId],
    });
  });

  // YONETICI-HOME: the managers' Home reads one service. The answer is a real
  // one, from a rolled-back run of manager_home_order_updates_coming_up.test.sql (Ayse):
  // her layout, Updates and Coming up too (S-220, S-225).
  it("reads the managers' Home from its one service and keeps its shape", async () => {
    const answer = JSON.parse(
      '{"now": "2026-10-21T04:45:15.185072+00:00", "layout": {"widget_order": ["updates", "operations", "pending_requests", "quick_actions", "open_shifts", "announcements", "coming_up", "todos"], "hidden_widget_ids": []}, "updates": [{"at": "2026-10-21T04:45:15.185072+00:00", "by": "Bora Person", "id": "05604630-43e8-4250-9247-abc4e0c12315", "kind": "swap", "person": "Emre Person", "approved": false, "last_date": "2026-10-25", "first_date": "2026-10-25", "location_ids": ["c4afe605-602b-418e-9598-b046202a79fe"]}, {"at": "2026-10-21T04:45:15.185072+00:00", "id": "43df3a12-fd42-4aa1-8b06-caa61e04630d", "kind": "joined", "person": "Emre Person", "location_ids": ["c4afe605-602b-418e-9598-b046202a79fe"]}, {"at": "2026-10-21T04:45:15.185072+00:00", "by": "Olcay Owner", "id": "8524a466-f2ca-4061-9f84-87d2fddb4daf", "kind": "published", "shifts": 0, "last_date": "2026-10-27", "first_date": "2026-10-21", "location_ids": ["c4afe605-602b-418e-9598-b046202a79fe"]}, {"at": "2026-10-21T04:45:15.185072+00:00", "by": "Olcay Owner", "id": "a2cd076e-4e00-444c-a6b8-815c323ac702", "kind": "time_off", "person": "Emre Person", "approved": true, "last_date": "2026-10-26", "first_date": "2026-10-24", "location_ids": ["c4afe605-602b-418e-9598-b046202a79fe"]}, {"at": "2026-10-21T04:45:15.185072+00:00", "by": "Ayse Person", "id": "fd3e28e7-86fa-4ee9-8fe3-bd6632b7bb12", "kind": "cover", "person": "Emre Person", "approved": true, "last_date": "2026-10-23", "first_date": "2026-10-23", "location_ids": ["c4afe605-602b-418e-9598-b046202a79fe"]}], "time_off": [], "coming_up": [{"id": "a0717425-0c6b-4bca-99aa-8a57313973dd", "kind": "time_off", "person": "Emre Person", "last_date": "2026-10-26", "first_date": "2026-10-24", "location_ids": ["c4afe605-602b-418e-9598-b046202a79fe"]}, {"id": "c4afe605-602b-418e-9598-b046202a79fe:2026-10-28", "kind": "unpublished", "last_date": "2026-11-03", "first_date": "2026-10-28", "location_ids": ["c4afe605-602b-418e-9598-b046202a79fe"]}, {"id": "0bc6eb01-db89-4494-b1b4-a67ec977b9ca", "kind": "closed", "name": "Republic Day", "last_date": "2026-10-30", "first_date": "2026-10-30", "location_ids": ["c4afe605-602b-418e-9598-b046202a79fe"]}], "locations": [{"id": "c4afe605-602b-418e-9598-b046202a79fe", "name": "Kadikoy", "week": [{"date": "2026-10-21", "open": 0, "shifts": 0, "published": true}, {"date": "2026-10-22", "open": 0, "shifts": 0, "published": true}, {"date": "2026-10-23", "open": 0, "shifts": 0, "published": true}, {"date": "2026-10-24", "open": 0, "shifts": 0, "published": true}, {"date": "2026-10-25", "open": 0, "shifts": 0, "published": true}, {"date": "2026-10-26", "open": 0, "shifts": 0, "published": true}, {"date": "2026-10-27", "open": 0, "shifts": 0, "published": true}], "today": "2026-10-21", "timezone": "Europe/Istanbul", "open_shifts": [], "today_shifts": [], "floor_managers": [], "missing_documents": []}], "workspace_id": "daa7b7d5-f57b-4fd0-bb2d-554cb3942ab3"}',
    );
    const rpc = vi.fn().mockResolvedValue({ data: answer, error: null });
    const service = createCommunicationServiceWithClient({ rpc });

    const home = await service.getManagerHome({ actorUserId: userId, workspaceId });

    expect(rpc).toHaveBeenCalledWith("get_manager_home_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
    });
    expect(home).toEqual(answer);
  });
});
