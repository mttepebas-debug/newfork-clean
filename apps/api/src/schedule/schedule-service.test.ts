import { beforeEach, describe, expect, it, vi } from "vitest";

import { createScheduleReadService } from "./schedule-service";

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const from = vi.fn();
  const send = vi.fn(async () => "ok");
  const channel = { send };
  const removeChannel = vi.fn(async () => "ok");
  const createClient = vi.fn(() => ({
    rpc,
    from,
    channel: vi.fn(() => channel),
    removeChannel,
  }));
  return { channel, createClient, from, removeChannel, rpc, send };
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
  mocks.from.mockReset();
  mocks.rpc.mockReset();
  mocks.send.mockClear();
  mocks.send.mockResolvedValue("ok");
  mocks.removeChannel.mockClear();
});

describe("createScheduleReadService read model", () => {
  it("loads short names only within the RPC-authorized workspace and location scope", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { workspace_id: workspaceId, week_start: "2026-09-14", week_start_day: "monday",
      locations: [{ id: locationId, name: "Main", timezone: "UTC", sort_order: 0, publication_status: "published", published_at: null }],
      departments: [], jobs: [], shift_types: [], employees: [], shifts: [],
    }, error: null });
    const locationEq = vi.fn(); const locationIn = vi.fn();
    mocks.from.mockImplementation((table: string) => {
      const chain = {
        select: () => chain, eq: (...args: unknown[]) => { if (table === "locations") locationEq(...args); return chain; },
        in: (...args: unknown[]) => { if (table === "locations") locationIn(...args); return chain; },
        is: () => chain, order: () => chain, lte: () => chain, or: () => chain,
        maybeSingle: () => Promise.resolve({ data: { time_format: "12h" }, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: table === "locations" ? [{ id: locationId, short_name: "MAIN" }] : [], error: null }),
      }; return chain;
    });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    const result = await service.getReadModel(actorUserId, workspaceId, "2026-09-14");
    expect(result.locations[0]).toMatchObject({ id: locationId, short_name: "MAIN" });
    expect(locationEq).toHaveBeenCalledWith("workspace_id", workspaceId);
    expect(locationIn).toHaveBeenCalledWith("id", [locationId]);
  });
  it("loads independent metadata concurrently after the authorized read model", async () => {
    let resolveSettings!: (value: { data: { time_format: string }; error: null }) => void;
    const settingsResult = new Promise<{ data: { time_format: string }; error: null }>((resolve) => {
      resolveSettings = resolve;
    });
    mocks.rpc.mockResolvedValueOnce({
      data: {
        workspace_id: workspaceId,
        week_start: "2026-08-17",
        week_start_day: "monday",
        locations: [],
        departments: [],
        jobs: [],
        shift_types: [],
        shift_labels: [],
        employees: [],
        shifts: [],
      },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === "workspace_scheduling_settings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => settingsResult,
            }),
          }),
        };
      }
      if (table === "important_dates") {
        const chain = {
          eq: () => chain,
          is: () => chain,
          order: () => chain,
          select: () => chain,
          then: (
            resolve: (value: { data: never[]; error: null }) => unknown,
          ) => resolve({ data: [], error: null }),
        };
        return chain;
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });

    const result = service.getReadModel(actorUserId, workspaceId, "2026-08-19");
    await vi.waitFor(() => expect(mocks.from).toHaveBeenCalledWith("important_dates"));
    resolveSettings({ data: { time_format: "12h" }, error: null });
    await expect(result).resolves.toMatchObject({
      workspace_id: workspaceId,
      week_start: "2026-08-17",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_schedule_read_model_service", {
      actor_user_id: actorUserId,
      target_workspace_id: workspaceId,
      target_date: "2026-08-19",
    });
  });
});

describe("createScheduleReadService realtime invalidation", () => {
  const refreshedPreview = { status: "publish_ready", workspace_id: workspaceId, week_start: "2026-08-17", draft_id: draftId, draft_revision: 2, fingerprint: "b".repeat(64), locations: [], findings: [] };
  const publishInput = { actorUserId, workspaceId, draftId, locationIds: [locationId], departmentIds: [departmentId], includeNoDepartment: false, expectedDraftRevision: 2, fingerprint: "a".repeat(64), overrides: [] };
  it.each(["40001", "PT409"])("returns scoped current preflight after a definite %s stale-publication rejection", async code => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code, message: "stale publication preview" } })
      .mockResolvedValueOnce({ data: refreshedPreview, error: null });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    await expect(service.publish(publishInput)).resolves.toMatchObject({ status: "preflight", preflight: refreshedPreview, preflight_block_reason: "stale_fingerprint" });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "preview_schedule_publication_service", {
      actor_user_id: actorUserId, target_workspace_id: workspaceId, target_draft_id: draftId,
      target_location_ids: [locationId], target_department_ids: [departmentId], include_no_department: false,
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not retry publication or convert unrelated failures to preflight", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "Approved exchange changed" } });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    await expect(service.publish(publishInput)).rejects.toMatchObject({ code: "PT409", message: "Approved exchange changed" });
    expect(mocks.rpc).toHaveBeenCalledOnce(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not return stale preview when the refreshed read loses access", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "stale publication preview" } })
      .mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Publish access denied" } });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    await expect(service.publish(publishInput)).rejects.toMatchObject({ code: "42501" });
    expect(mocks.rpc).toHaveBeenCalledTimes(2); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("preserves the database stale-assessment code and does not broadcast a failed mutation", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "Review the current availability assessment before saving" } });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    await expect(service.mutateShift({ actorUserId, workspaceId, sessionId: draftId, shiftId: departmentId, expectedSessionRevision: 1, operation: "create" })).rejects.toMatchObject({ code: "PT409" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
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
          "employee_my_schedule",
        ],
      },
    });
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });

  it("passes notification recipients into the atomic publish RPC", async () => {
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
        notification_event_id: "e1510000-0000-4000-8000-000000000001",
        notification_enqueued_count: 1,
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
      notifyEmployeeIds: ["15000000-0000-4000-8000-000000000001"],
      overrides: [],
    });

    expect(result).toMatchObject({
      status: "published",
      notification_enqueued_count: 1,
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      "publish_schedule_draft_service",
      expect.objectContaining({
        actor_user_id: actorUserId,
        target_workspace_id: workspaceId,
        target_notify_employee_ids: ["15000000-0000-4000-8000-000000000001"],
      }),
    );
  });

  it("does not turn an empty recipient selection into a notify-all request", async () => {
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
      notifyEmployeeIds: [],
      overrides: [],
    });

    expect(result.status).toBe("published");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "publish_schedule_draft_service",
      expect.objectContaining({ target_notify_employee_ids: null }),
    );
  });

  it("recovers hard document blockers as scoped publish conflicts", async () => {
    const documentConflict = {
      kind: "document_expiry",
      employee_id: "15000000-0000-4000-8000-000000000001",
      employee_name: "Alex Rivera",
      shift_id: "77777777-7777-4777-8777-777777777777",
      location_id: locationId,
      location_name: "Downtown",
      date: "2026-08-17",
      start_time: "16:00",
      end_time: "19:00",
      document_type_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      requirement_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      document_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      document_title: "Food handler card",
      expiry_date: "2026-08-01",
      expiry_policy_version: 2,
      pending_document_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      review_action: "review_document",
      severity: "hard",
      overrideable: false,
      warning_text: "Food handler card is expired and blocks scheduling.",
      conflict_fingerprint: "b".repeat(64),
    };
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: "schedule has hard document blockers" },
      })
      .mockResolvedValueOnce({
        data: {
          status: "ok",
          conflicts: [documentConflict],
          fingerprint: "b".repeat(64),
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
      weekStart: "2026-08-17",
      locationIds: [locationId],
      departmentIds: [departmentId],
      includeNoDepartment: false,
      expectedDraftRevision: 2,
      fingerprint: "a".repeat(64),
      overrides: [],
    });

    expect(result).toEqual({
      status: "schedule_conflicts",
      schedule_conflicts: [documentConflict],
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "list_schedule_draft_document_conflicts_service",
      {
        actor_user_id: actorUserId,
        target_workspace_id: workspaceId,
        target_draft_id: draftId,
        target_week_start: "2026-08-17",
        target_location_ids: [locationId],
        target_department_ids: [departmentId],
        include_no_department: false,
      },
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not recover hard document blockers without the publish week scope", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "schedule has hard document blockers" },
    });

    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });

    await expect(
      service.publish({
        actorUserId,
        workspaceId,
        draftId,
        locationIds: [locationId],
        expectedDraftRevision: 2,
        fingerprint: "a".repeat(64),
        overrides: [],
      }),
    ).rejects.toThrow("schedule has hard document blockers");

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "publish_schedule_draft_service",
      expect.objectContaining({
        target_workspace_id: workspaceId,
        target_draft_id: draftId,
      }),
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not publish or widen scope when document blocker recovery returns no scoped conflicts", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: "schedule has hard document blockers" },
      })
      .mockResolvedValueOnce({
        data: {
          status: "ok",
          conflicts: [],
          fingerprint: "b".repeat(64),
        },
        error: null,
      });

    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });

    await expect(
      service.publish({
        actorUserId,
        workspaceId,
        draftId,
        weekStart: "2026-08-17",
        locationIds: [locationId],
        departmentIds: [departmentId],
        includeNoDepartment: false,
        expectedDraftRevision: 2,
        fingerprint: "a".repeat(64),
        overrides: [],
      }),
    ).rejects.toThrow("schedule has hard document blockers");

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "list_schedule_draft_document_conflicts_service",
      {
        actor_user_id: actorUserId,
        target_workspace_id: workspaceId,
        target_draft_id: draftId,
        target_week_start: "2026-08-17",
        target_location_ids: [locationId],
        target_department_ids: [departmentId],
        include_no_department: false,
      },
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects scheduled export candidates for deleted workspaces before exporting", async () => {
    const maybeSingle = vi.fn(async () => ({
      data: {
        id: workspaceId,
        lifecycle_status: "deleted",
        closure_effective_at: null,
      },
      error: null,
    }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    mocks.from.mockReturnValueOnce({ select });

    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });

    await expect(
      service.revalidateScheduledExportCandidate?.({
        workspaceId,
        requesterUserId: actorUserId,
        locationIds: [locationId],
        now: new Date("2026-09-05T12:00:00.000Z"),
      }),
    ).resolves.toBe(false);

    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith("workspaces");
    expect(select).toHaveBeenCalledWith(
      "id,lifecycle_status,closure_effective_at",
    );
    expect(eq).toHaveBeenCalledWith("id", workspaceId);
  });

  it("rejects scheduled export candidates for incomplete owner onboarding before exporting", async () => {
    const workspaceMaybeSingle = vi.fn(async () => ({
      data: {
        id: workspaceId,
        lifecycle_status: "active",
        closure_effective_at: null,
      },
      error: null,
    }));
    const onboardingMaybeSingle = vi.fn(async () => ({
      data: { status: "incomplete" },
      error: null,
    }));
    const workspaceEq = vi.fn(() => ({ maybeSingle: workspaceMaybeSingle }));
    const onboardingEq = vi.fn(() => ({
      maybeSingle: onboardingMaybeSingle,
    }));
    const workspaceSelect = vi.fn(() => ({ eq: workspaceEq }));
    const onboardingSelect = vi.fn(() => ({ eq: onboardingEq }));
    mocks.from
      .mockReturnValueOnce({ select: workspaceSelect })
      .mockReturnValueOnce({ select: onboardingSelect });

    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });

    await expect(
      service.revalidateScheduledExportCandidate?.({
        workspaceId,
        requesterUserId: actorUserId,
        locationIds: [locationId],
        now: new Date("2026-09-05T12:00:00.000Z"),
      }),
    ).resolves.toBe(false);

    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.from).toHaveBeenNthCalledWith(1, "workspaces");
    expect(mocks.from).toHaveBeenNthCalledWith(2, "workspace_onboarding");
    expect(workspaceSelect).toHaveBeenCalledWith(
      "id,lifecycle_status,closure_effective_at",
    );
    expect(onboardingSelect).toHaveBeenCalledWith("status");
    expect(onboardingEq).toHaveBeenCalledWith("workspace_id", workspaceId);
  });

  it("fails publish when the atomic publish and enqueue transaction is unavailable", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "atomic publish unavailable" },
    });

    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });
    await expect(
      service.publish({
        actorUserId,
        workspaceId,
        draftId,
        locationIds: [locationId],
        expectedDraftRevision: 2,
        fingerprint: "a".repeat(64),
        notifyEmployeeIds: ["15000000-0000-4000-8000-000000000001"],
        overrides: [],
      }),
    ).rejects.toThrow("atomic publish unavailable");
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
    location_ids: ["11000000-0000-4000-8000-000000000001"],
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
        changed_since_start: null,
        affected_employee_ids: [],
      },
    ],
    findings: [],
  };
}
