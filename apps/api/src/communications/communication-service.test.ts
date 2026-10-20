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

  it("routes owner setup checklist progress through service RPCs", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        workspace_id: workspaceId,
        user_id: userId,
        completed_item_ids: ["schedule"],
        closed_at: null,
      },
      error: null,
    });
    const service = createCommunicationServiceWithClient({ rpc });

    await service.markOwnerSetupChecklistItem({
      actorUserId: userId,
      workspaceId,
      itemId: "schedule",
    });

    expect(rpc).toHaveBeenCalledWith(
      "mark_owner_setup_checklist_item_service",
      {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
        target_item_id: "schedule",
      },
    );
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

  // YONETICI-HOME: the managers' Home reads one service. The answer is a real
  // one, from a rolled-back run of manager_home_reads_each_location.test.sql (Ayse).
  it("reads the managers' Home from its one service and keeps its shape", async () => {
    const answer = JSON.parse(
      '{"now": "2026-10-20T04:43:32.075078+00:00", "time_off": [{"id": "7d882f38-2421-4bf0-90b3-fcd0b00913c8", "last_date": "2026-10-30", "first_date": "2026-10-30", "employee_id": "db37ec6e-d3b2-42c4-8045-d8533c17a4d2", "location_ids": ["20409979-fe36-4ee6-8461-1ba62eb4dbac"], "employee_name": "Emre Person"}], "locations": [{"id": "20409979-fe36-4ee6-8461-1ba62eb4dbac", "name": "Kadikoy", "week": [{"date": "2026-10-20", "open": 1, "shifts": 3, "published": true}, {"date": "2026-10-21", "open": 0, "shifts": 0, "published": true}, {"date": "2026-10-22", "open": 1, "shifts": 1, "published": true}, {"date": "2026-10-23", "open": 0, "shifts": 0, "published": true}, {"date": "2026-10-24", "open": 0, "shifts": 0, "published": true}, {"date": "2026-10-25", "open": 0, "shifts": 0, "published": true}, {"date": "2026-10-26", "open": 0, "shifts": 0, "published": true}], "today": "2026-10-20", "timezone": "Europe/Istanbul", "open_shifts": [{"date": "2026-10-20", "ends_at": "2026-10-20T14:00:00+00:00", "job_name": "Server", "starts_at": "2026-10-20T06:00:00+00:00"}, {"date": "2026-10-22", "ends_at": "2026-10-22T14:00:00+00:00", "job_name": "Server", "starts_at": "2026-10-22T06:00:00+00:00"}], "today_shifts": [{"open": true, "ends_at": "2026-10-20T14:00:00+00:00", "starts_at": "2026-10-20T06:00:00+00:00"}, {"open": false, "ends_at": "2026-10-20T14:00:00+00:00", "starts_at": "2026-10-20T06:00:00+00:00"}, {"open": false, "ends_at": "2026-10-20T14:00:00+00:00", "starts_at": "2026-10-20T06:00:00+00:00"}], "floor_managers": [{"name": "Ayse Person", "ends_at": "2026-10-20T14:00:00+00:00", "starts_at": "2026-10-20T06:00:00+00:00"}], "missing_documents": [{"name": "Emre Person", "document": "Food handler card", "employee_id": "db37ec6e-d3b2-42c4-8045-d8533c17a4d2"}]}], "workspace_id": "f7f9131e-5ae4-4d2d-9fd0-d4284e5b8eaa"}',
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
