import { beforeEach, describe, expect, it, vi } from "vitest";

import { createScheduleReadService } from "./schedule-service";

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const send = vi.fn(async () => "ok");
  const channel = { send };
  const removeChannel = vi.fn(async () => "ok");
  const createClient = vi.fn(() => ({
    rpc,
    channel: vi.fn(() => channel),
    removeChannel,
  }));
  return { channel, createClient, removeChannel, rpc, send };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const actorUserId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const locationId = "11000000-0000-4000-8000-000000000001";
const draftId = "85000000-0000-4000-8000-000000000001";
const departmentId = "22000000-0000-4000-8000-000000000001";

beforeEach(() => {
  mocks.createClient.mockClear();
  mocks.rpc.mockReset();
  mocks.send.mockClear();
  mocks.send.mockResolvedValue("ok");
  mocks.removeChannel.mockClear();
});

describe("createScheduleReadService realtime invalidation", () => {
  it("broadcasts schedule invalidation after publishing a draft", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        status: "published",
        workspace_id: workspaceId,
        week_start: "2026-08-17",
        draft_id: draftId,
        draft_revision: 2,
        location_ids: [locationId],
        publication_ids: ["86000000-0000-4000-8000-000000000001"],
        published_shift_count: 4,
        published_at: "2026-08-17T12:00:00.000Z",
      },
      error: null,
    });

    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });
    const result = await service.publish({
      actorUserId,
      workspaceId,
      draftId,
      locationIds: [locationId],
      expectedDraftRevision: 2,
      fingerprint: "a".repeat(64),
      overrides: [],
    });

    expect(result.status).toBe("published");
    expect(mocks.send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "schedule_invalidation",
      payload: {
        kind: "schedule_invalidation",
        workspace_id: workspaceId,
        actor_user_id: actorUserId,
        week_start: "2026-08-17",
        location_ids: [locationId],
        draft_id: draftId,
        targets: [
          "published_shifts",
          "drafts",
          "pending_ops",
          "lineups",
          "employee_my_schedule",
        ],
      },
    });
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });

  it("passes department publish scope to the Supabase RPC", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: schedulePublicationPreview(),
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: {
        status: "published",
        workspace_id: workspaceId,
        week_start: "2026-08-17",
        draft_id: draftId,
        draft_revision: 2,
        location_ids: [locationId],
        publication_ids: ["86000000-0000-4000-8000-000000000001"],
        published_shift_count: 2,
        published_at: "2026-08-17T12:00:00.000Z",
      },
      error: null,
    });

    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });

    await service.previewPublication({
      actorUserId,
      workspaceId,
      draftId,
      locationIds: [locationId],
      departmentIds: [departmentId],
      includeNoDepartment: false,
    });
    await service.publish({
      actorUserId,
      workspaceId,
      draftId,
      locationIds: [locationId],
      departmentIds: [departmentId],
      includeNoDepartment: false,
      expectedDraftRevision: 2,
      fingerprint: "a".repeat(64),
      overrides: [],
    });

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      "preview_schedule_publication_service",
      expect.objectContaining({
        target_department_ids: [departmentId],
        include_no_department: false,
      }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "publish_schedule_draft_service",
      expect.objectContaining({
        target_department_ids: [departmentId],
        include_no_department: false,
      }),
    );
  });

  it("broadcasts draft-session invalidation after applying auto-fill", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        status: "applied",
        applied: [
          {
            shift_id: "81000000-0000-4000-8000-000000000001",
            employee_id: "15000000-0000-4000-8000-000000000001",
          },
        ],
        rejected: [],
        session: scheduleSessionModel(),
      },
      error: null,
    });

    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });
    const result = await service.applyAutoFill({
      actorUserId,
      workspaceId,
      sessionId: "87000000-0000-4000-8000-000000000001",
      expectedSessionRevision: 2,
      fingerprint: "b".repeat(64),
      assignments: [
        {
          shift_id: "81000000-0000-4000-8000-000000000001",
          employee_id: "15000000-0000-4000-8000-000000000001",
        },
      ],
    });

    expect(result.status).toBe("applied");
    expect(mocks.send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "schedule_invalidation",
      payload: {
        kind: "schedule_invalidation",
        workspace_id: workspaceId,
        actor_user_id: actorUserId,
        week_start: "2026-08-17",
        location_ids: [locationId],
        draft_id: draftId,
        targets: ["draft_shifts", "pending_ops", "edit_lock"],
        changed_shift_ids: ["81000000-0000-4000-8000-000000000001"],
      },
    });
  });

  it("keeps successful writes successful when realtime broadcast fails", async () => {
    mocks.send.mockRejectedValueOnce(new Error("realtime unavailable"));
    mocks.rpc.mockResolvedValueOnce({
      data: {
        id: draftId,
        workspace_id: workspaceId,
        week_start: "2026-08-17",
        name: "Dinner draft",
        revision: 1,
        created_by: actorUserId,
        updated_by: actorUserId,
        created_at: "2026-08-17T12:00:00.000Z",
        updated_at: "2026-08-17T12:00:00.000Z",
      },
      error: null,
    });

    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });
    const result = await service.saveSession({
      actorUserId,
      workspaceId,
      sessionId: "87000000-0000-4000-8000-000000000001",
      expectedSessionRevision: 1,
      name: "Dinner draft",
      draftId: null,
      expectedDraftRevision: null,
    });

    expect(result.id).toBe(draftId);
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });
});

function scheduleSessionModel() {
  return {
    id: "87000000-0000-4000-8000-000000000001",
    workspace_id: workspaceId,
    week_start: "2026-08-17",
    source_kind: "draft",
    source_draft_id: draftId,
    source_revision: 1,
    holder_user_id: actorUserId,
    holder_name: "Local Owner",
    revision: 3,
    dirty: true,
    last_heartbeat: "2026-08-17T12:00:00.000Z",
    expires_at: "2026-08-17T12:04:00.000Z",
    shifts: [
      {
        id: "81000000-0000-4000-8000-000000000001",
        location_id: locationId,
        employee_id: "15000000-0000-4000-8000-000000000001",
        job_id: "33000000-0000-4000-8000-000000000001",
        shift_type_id: null,
        scheduled_date: "2026-08-17",
        start_time: "17:00",
        end_time: "21:00",
        crosses_midnight: false,
        unpaid_break_minutes: 0,
        hide_time_on_badge: false,
        label_ids: [],
        label_names: [],
        note: "",
        warning_codes: [],
        revision: 2,
      },
    ],
  };
}

function schedulePublicationPreview() {
  return {
    status: "publish_ready",
    workspace_id: workspaceId,
    week_start: "2026-08-17",
    draft_id: draftId,
    draft_revision: 2,
    fingerprint: "a".repeat(64),
    locations: [
      {
        location_id: locationId,
        location_name: "Main Dining",
        active_publication_id: null,
        active_version: null,
        current_shift_count: 0,
        next_shift_count: 2,
        added: 2,
        updated: 0,
        removed: 0,
        unchanged: 0,
        affected_employee_ids: [],
      },
    ],
    findings: [],
  };
}
