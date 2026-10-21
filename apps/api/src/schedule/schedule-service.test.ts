import { beforeEach, describe, expect, it, vi } from "vitest";

import { createScheduleReadService } from "./schedule-service";

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const from = vi.fn();
  // `send` records what was broadcast; the service broadcasts over REST with
  // httpSend (BL-435), the channel has no implicit-fallback send.
  const send = vi.fn(async (_message: { type: string; event: string; payload: unknown }) => "ok");
  const httpSend = vi.fn(async (event: string, payload: unknown) => {
    await send({ type: "broadcast", event, payload });
    return { success: true as const };
  });
  const channel = { httpSend };
  const removeChannel = vi.fn(async () => "ok");
  const channelFn = vi.fn((_topic: string, _options: unknown) => channel);
  const createClient = vi.fn(() => ({
    rpc,
    from,
    channel: channelFn,
    removeChannel,
  }));
  return { channel, channelFn, createClient, from, removeChannel, rpc, send };
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
  mocks.channelFn.mockClear();
});

describe("createScheduleReadService read model", () => {
  it("loads short names only within the RPC-authorized workspace and location scope", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { workspace_id: workspaceId, week_start: "2026-09-14", week_start_day: "monday",
      locations: [{ id: locationId, name: "Main", timezone: "UTC", sort_order: 0, publication_status: "published", published_at: null }],
      departments: [], jobs: [], shift_types: [], referenced_jobs: [], referenced_shift_types: [], employees: [], shifts: [], closures: [],
    }, error: null });
    const locationEq = vi.fn(); const locationIn = vi.fn();
    mocks.from.mockImplementation((table: string) => {
      const chain = {
        select: () => chain, eq: (...args: unknown[]) => { if (table === "locations") locationEq(...args); return chain; },
        in: (...args: unknown[]) => { if (table === "locations") locationIn(...args); return chain; },
        is: () => chain, order: () => chain, lte: () => chain, gte: () => chain,
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
  it("passes the Schedule's conflict rules through, so a drag can tell allowed from blocked (DRAG-API)", async () => {
    const settings = {
      time_format: "24h",
      conflict_rules: { approved_time_off: "block", closed_location: "confirm_once", minimum_travel: "confirm",
        minimum_rest: "confirm", document_required: "confirm", document_conditional_grace: "warn", document_conditional_overdue: "confirm" },
      minimum_travel_minutes: 30,
      minimum_rest_minutes: 600,
    };
    mocks.rpc.mockResolvedValueOnce({ data: { workspace_id: workspaceId, week_start: "2026-09-14", week_start_day: "monday", settings,
      locations: [{ id: locationId, name: "Main", timezone: "UTC", sort_order: 0, publication_status: "published", published_at: null }],
      departments: [], jobs: [], shift_types: [], referenced_jobs: [], referenced_shift_types: [], employees: [], shifts: [], closures: [],
    }, error: null });
    mocks.from.mockImplementation(() => {
      const chain = {
        select: () => chain, eq: () => chain, in: () => chain, is: () => chain, order: () => chain, lte: () => chain, gte: () => chain, or: () => chain,
        maybeSingle: () => Promise.resolve({ data: { time_format: "12h" }, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
      }; return chain;
    });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    const result = await service.getReadModel(actorUserId, workspaceId, "2026-09-14");
    expect(result.settings).toEqual(settings);
  });
  it("takes the week's closures and important dates from the read model, reading neither table itself (BL-701)", async () => {
    // The id public.schedule_closures gave Oct 28 on the local database (EKRAN-08 D4): an
    // md5 made into a uuid (BL-959).
    const closedDay = { id: "c6717f17-012c-8945-cc5c-fca50e875fae", location_id: locationId, closed_date: "2026-10-28",
      title: "Staff training", is_all_day: false, kind: "short", opens: "10:00", closes: "15:00", status: "published",
      publish_at: null, on_schedule: true, announcement_id: "70000000-0000-4000-8000-000000000001" };
    const importantDate = { id: "70000000-0000-4000-8000-000000000001", location_id: locationId, title: "Staff training",
      category: "staff_meeting", category_other: null, starts_on: "2026-10-28", ends_on: "2026-10-28", status: "published",
      publish_at: null, day: "short", opens: "10:00", closes: "15:00", event_from: null, event_until: null };
    mocks.rpc.mockResolvedValueOnce({ data: { workspace_id: workspaceId, week_start: "2026-10-26", week_start_day: "monday",
      locations: [{ id: locationId, name: "Main", timezone: "UTC", sort_order: 0, publication_status: "published", published_at: null }],
      departments: [], jobs: [], shift_types: [], referenced_jobs: [], referenced_shift_types: [], employees: [], shifts: [],
      closures: [closedDay], important_dates: [importantDate],
    }, error: null });
    const tables: string[] = [];
    mocks.from.mockImplementation((table: string) => {
      tables.push(table);
      const chain = {
        select: () => chain, eq: () => chain, in: () => chain, is: () => chain, order: () => chain, lte: () => chain, gte: () => chain, or: () => chain,
        maybeSingle: () => Promise.resolve({ data: { time_format: "12h" }, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
      }; return chain;
    });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    const result = await service.getReadModel(actorUserId, workspaceId, "2026-10-26");
    expect(tables).not.toContain("schedule_closures");
    expect(tables).not.toContain("announcements");
    expect(result.closures).toEqual([expect.objectContaining({ id: closedDay.id, kind: "short", opens: "10:00", closes: "15:00" })]);
    expect(result.important_dates.map((date) => date.title)).toEqual(["Staff training"]);
  });
  it("hands the Schedule Management's and Owner's system keys and the stored primary job (BL-218)", async () => {
    // From get_schedule_read_model_service on the "r" world of
    // supabase/tests/employee_references_ask_the_core.test.sql, with the
    // BL-218 .3a migration applied and rolled back: the owner works only the
    // Owner job and has no primary; Ayse's primary is Cook.
    const departments = [
      { id: "893f064e-2952-49ae-80f7-cc5ab30e192a", name: "Management", color: "#3C7A68", system_key: "management" },
      { id: "b2ab1ea5-1a32-4f1c-8da8-6d6422205939", name: "Kitchen", color: "#3C7A68", system_key: null },
    ];
    const jobs = [
      { id: "285cb253-3c31-41c3-950a-74c93ded13fb", name: "Owner", color: "#4478A8", system_key: "owner", department_id: "893f064e-2952-49ae-80f7-cc5ab30e192a" },
      { id: "49f49836-56a9-49c9-ac67-7f469cc09e82", name: "Cook", color: "#D39A36", system_key: null, department_id: "b2ab1ea5-1a32-4f1c-8da8-6d6422205939" },
    ];
    const employees = [
      { id: "0ece5bab-720d-40f7-88f8-6833c661558e", job_ids: ["285cb253-3c31-41c3-950a-74c93ded13fb"], display_name: "Olcay Owner", location_ids: ["e92f96de-3eb0-4203-a15c-aff6edfd4c39", "eddd6f15-289e-416a-8727-e4ce6bca5600"], employee_code: "E-0001", primary_job_id: null, is_excluded_from_schedule: false },
      { id: "4b551d02-784b-4dcb-af8b-083a2885f894", job_ids: ["49f49836-56a9-49c9-ac67-7f469cc09e82"], display_name: "Ayse Person", location_ids: ["e92f96de-3eb0-4203-a15c-aff6edfd4c39"], employee_code: "E-0002", primary_job_id: "49f49836-56a9-49c9-ac67-7f469cc09e82", is_excluded_from_schedule: false },
    ];
    mocks.rpc.mockResolvedValueOnce({ data: { workspace_id: workspaceId, week_start: "2026-09-14", week_start_day: "monday",
      locations: [], departments, jobs, shift_types: [], referenced_jobs: [], referenced_shift_types: [], employees, shifts: [], closures: [],
    }, error: null });
    mocks.from.mockImplementation(() => {
      const chain = {
        select: () => chain, eq: () => chain, in: () => chain, is: () => chain, order: () => chain, lte: () => chain, gte: () => chain,
        maybeSingle: () => Promise.resolve({ data: { time_format: "12h" }, error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
      }; return chain;
    });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    const result = await service.getReadModel(actorUserId, workspaceId, "2026-09-14");
    expect(result.departments).toEqual(departments);
    expect(result.jobs).toEqual(jobs);
    expect(result.employees.map((employee) => employee.primary_job_id)).toEqual([null, jobs[1]!.id]);
  });
});

// S1: when the idle countdown ends the edit is kept as an "Auto-save" draft.
// S2 (KK-171): Undo takes the edit's last step back on the server.
describe("createScheduleReadService undo", () => {
  it("reads the person's own open edit for Export without touching the lease or telling anyone", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: scheduleSessionModel(), error: null });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });

    const session = await service.getEditSession!(actorUserId, workspaceId, "87000000-0000-4000-8000-000000000001");

    expect(session.revision).toBe(3);
    expect(mocks.rpc).toHaveBeenCalledWith("get_schedule_edit_session_service", {
      actor_user_id: actorUserId, target_workspace_id: workspaceId, target_session_id: "87000000-0000-4000-8000-000000000001",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("lists the week's drafts with their shifts, paid minutes and last saver, and the live total (New Schedule window)", async () => {
    const draft = {
      id: draftId, workspace_id: workspaceId, week_start: "2026-08-17", name: "Week A", revision: 2,
      created_by: actorUserId, updated_by: actorUserId,
      created_at: "2026-08-17T12:00:00+00:00", updated_at: "2026-08-17T13:00:00+00:00",
      updated_by_name: "Olcay Owner", shift_count: 3, paid_minutes: 1050,
    };
    mocks.rpc.mockResolvedValueOnce({ data: { drafts: [draft], published: { shift_count: 2, paid_minutes: 810 } }, error: null });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });

    const list = await service.listDrafts(actorUserId, workspaceId, "2026-08-17");

    expect(list.drafts[0]).toMatchObject({ updated_by_name: "Olcay Owner", shift_count: 3, paid_minutes: 1050 });
    // A database from before QA 41 sends no open count: it reads as none.
    expect(list.published).toEqual({ shift_count: 2, paid_minutes: 810, open_shift_count: 0 });
    // An answer without the facts is a broken contract, not an empty window.
    mocks.rpc.mockResolvedValueOnce({ data: { drafts: [draft] }, error: null });
    await expect(service.listDrafts(actorUserId, workspaceId, "2026-08-17")).rejects.toThrow();
  });

  it("asks the server to take the last step back and tells the edit's locations", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...scheduleSessionModel(), revision: 4, undo_depth: 2 }, error: null });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });

    const session = await service.undoSessionStep({
      actorUserId, workspaceId, sessionId: "87000000-0000-4000-8000-000000000001", expectedSessionRevision: 3,
    });

    expect(session.undo_depth).toBe(2);
    expect(mocks.rpc).toHaveBeenCalledWith("undo_schedule_edit_session_step_service", {
      actor_user_id: actorUserId, target_workspace_id: workspaceId,
      target_session_id: "87000000-0000-4000-8000-000000000001", expected_session_revision: 3,
    });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ targets: ["draft_shifts", "pending_ops", "edit_lock"] }),
    }));
  });

  // BL-998: a step that could not come back left the history; the screen reads why.
  it("passes on why the last step was taken off the Undo list", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ...scheduleSessionModel(), revision: 5, undo_depth: 1, undo_refused: { reason: "conflict_acceptance" } },
      error: null,
    });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });

    const session = await service.undoSessionStep({
      actorUserId, workspaceId, sessionId: "87000000-0000-4000-8000-000000000001", expectedSessionRevision: 4,
    });

    expect(session.undo_refused).toEqual({ reason: "conflict_acceptance" });
    expect(session.undo_depth).toBe(1);
  });

  it("keeps the database's reason when there is nothing to undo", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "nothing to undo", hint: "schedule.nothing_to_undo" } });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });

    await expect(service.undoSessionStep({
      actorUserId, workspaceId, sessionId: "87000000-0000-4000-8000-000000000001", expectedSessionRevision: 3,
    })).rejects.toMatchObject({ statusCode: 409, reason: "schedule.nothing_to_undo" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("createScheduleReadService autosave", () => {
  it("keeps an idle edit as a draft and tells that draft's locations", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { status: "saved", draft_id: draftId, draft_name: "Auto-save · Ayse Yilmaz · Oct 5, 9:14 PM" },
      error: null,
    });
    mocks.from.mockImplementation(() => {
      const chain = { select: () => chain, eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: { location_ids: [locationId] }, error: null }) };
      return chain;
    });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    const sessionId = "87000000-0000-4000-8000-000000000001";

    await expect(service.autosaveSession(actorUserId, workspaceId, sessionId)).resolves.toEqual({
      status: "saved", draft_id: draftId, draft_name: "Auto-save · Ayse Yilmaz · Oct 5, 9:14 PM",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("autosave_schedule_edit_session_service", {
      actor_user_id: actorUserId, target_workspace_id: workspaceId, target_session_id: sessionId,
    });
    expect(mocks.channelFn).toHaveBeenCalledWith(`schedule:invalidation:${workspaceId}:${locationId}`, { config: { private: true } });
  });

  it("closes an edit with nothing to keep without telling anyone", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { status: "nothing_to_save", draft_id: null, draft_name: null }, error: null });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });

    await expect(service.autosaveSession(actorUserId, workspaceId, "87000000-0000-4000-8000-000000000001"))
      .resolves.toEqual({ status: "nothing_to_save", draft_id: null, draft_name: null });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("createScheduleReadService scheduled export record", () => {
  const recorded = { id: "8a000000-0000-4000-8000-000000000001" };
  it("passes a partly delivered email's note to the database, and none for a full one (KK-166)", async () => {
    mocks.rpc.mockResolvedValue({ data: recorded, error: { code: "stop", message: "parse skipped" } });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    const base = { workspaceId, scheduleId: recorded.id, sentAt: new Date("2026-08-17T15:00:00.000Z"), format: "csv", params: {} };
    await service.recordScheduledExportSuccess({ ...base, undelivered: "Not delivered to 1 of 2 recipients: two@example.test" }).catch(() => undefined);
    await service.recordScheduledExportSuccess(base).catch(() => undefined);

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "record_schedule_export_schedule_success_service", expect.objectContaining({
      target_undelivered: "Not delivered to 1 of 2 recipients: two@example.test",
    }));
    expect(mocks.rpc.mock.calls[1]?.[1]).not.toHaveProperty("target_undelivered");
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
    await expect(service.publish(publishInput)).rejects.toMatchObject({ statusCode: 409, pgCode: "PT409", message: "Approved exchange changed" });
    expect(mocks.rpc).toHaveBeenCalledOnce(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not return stale preview when the refreshed read loses access", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "stale publication preview" } })
      .mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Publish access denied" } });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    await expect(service.publish(publishInput)).rejects.toMatchObject({ statusCode: 403, pgCode: "42501" });
    expect(mocks.rpc).toHaveBeenCalledTimes(2); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("preserves the database stale-assessment code and does not broadcast a failed mutation", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "Review the current availability assessment before saving", hint: "schedule.availability_review_required" } });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    await expect(service.mutateShift({ actorUserId, workspaceId, sessionId: draftId, shiftId: departmentId, expectedSessionRevision: 1, operation: "create" })).rejects.toMatchObject({ statusCode: 409, pgCode: "PT409", reason: "schedule.availability_review_required" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("carries the authorization core's refusal and hides database internals", async () => {
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Not allowed", hint: "authz.out_of_scope", details: "schedule.edit" } });
    await expect(service.listDrafts(actorUserId, workspaceId, "2026-08-17")).rejects.toMatchObject({
      statusCode: 403, reason: "authz.out_of_scope", detail: "schedule.edit",
    });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied for table schedule_drafts" } });
    await expect(service.listDrafts(actorUserId, workspaceId, "2026-08-17")).rejects.toMatchObject({
      statusCode: 403, message: "Not allowed",
    });
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
        week_start: "2026-08-17",
        location_ids: [locationId],
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

  // BILDIRIM-03: the old notification system is gone, so publish names nobody to notify. The
  // database's retired recipient parameter is left out (it defaults to none) so publish keeps
  // working once teardown part C1 drops it.
  it("publishes without naming anyone to notify", async () => {
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
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "publish_schedule_draft_service",
      expect.objectContaining({ actor_user_id: actorUserId, target_workspace_id: workspaceId }),
    );
    expect(mocks.rpc.mock.calls[0]?.[1]).not.toHaveProperty("target_notify_employee_ids");
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
        error: { code: "23514", message: "schedule has hard document blockers" },
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
      error: { code: "23514", message: "schedule has hard document blockers" },
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
        error: { code: "23514", message: "schedule has hard document blockers" },
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

  it("reads each scheduled export on its own, so one unreadable row stops no one else (BL-272)", async () => {
    const readable = {
      id: "8a000000-0000-4000-8000-000000000001",
      workspace_id: workspaceId,
      workspace_name: "Meyhouse",
      created_by: actorUserId,
      preset_id: "89000000-0000-4000-8000-000000000001",
      preset_name: "Payroll export",
      settings: {
        format: "csv",
        layout: "weekly",
        time_format: "12h",
        include_unassigned: true,
        include_notes: false,
        include_scheduled_hours: true,
        csv_delimiter: ",",
      },
      name: "Monday managers",
      recipients: ["manager@example.test"],
      location_ids: [],
      day_of_week: 1,
      send_hour: 8,
      timezone: "America/Los_Angeles",
      week_start_day: "sunday",
      last_sent_at: null,
      consecutive_failures: 0,
    };
    const unreadable = {
      ...readable,
      id: "8a000000-0000-4000-8000-000000000002",
      recipients: ["not an email"],
    };
    mocks.rpc.mockResolvedValueOnce({
      data: { schedules: [unreadable, readable] },
      error: null,
    });

    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });

    const result = await service.listScheduledExportCronCandidates(
      new Date("2026-09-05T12:00:00.000Z"),
    );

    expect(mocks.rpc).toHaveBeenCalledWith(
      "list_schedule_export_cron_candidates_service",
      { target_now: "2026-09-05T12:00:00.000Z" },
    );
    expect(result.schedules.map((schedule) => schedule.id)).toEqual([readable.id]);
    // Every location deleted: still listed, so the cron can say why it stopped.
    expect(result.schedules[0]?.location_ids).toEqual([]);
    expect(result.schedules[0]?.week_start_day).toBe("sunday");
    expect(result.unreadable).toEqual([
      { id: unreadable.id, workspace_id: workspaceId },
    ]);
    // The database hands over everything; no table is read with the service key.
    expect(mocks.from).not.toHaveBeenCalled();
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
        overrides: [],
      }),
    // An error nobody raises on purpose is a bug: 500, the database sentence kept for the log only.
    ).rejects.toMatchObject({ statusCode: 500, message: "Internal server error" });
  });

  it("passes an approved shift change the draft would undo to the screen (BL-198)", async () => {
    // Verbatim from a real run of shift_exchange_draft_undoes() (nf-db bl198-fix ae3f31b9,
    // approved_exchange_survives_a_stale_draft green run): times arrive as HH:MM.
    const undone = {"id": "shift_exchange_undone:d766ef91-397b-4f46-af27-5bab6c044268", "code": "shift_exchange_undone", "tier": "blocker", "message": "This shift was swapped from Ali Person to Deniz Person after the schedule was last published, and this draft does not have it. Publishing would undo it.", "end_time": "15:00", "severity": "hard", "shift_ids": ["f60a3476-ba75-4532-a061-9b0c0672cc08"], "introduced": true, "start_time": "09:00", "employee_id": "51017f0c-a2f8-4fd0-8568-b49c88bd8a50", "location_id": "f1a169ae-0ac7-4cea-82aa-be9fc3ee3cb8", "overrideable": false, "employee_name": "Deniz Person", "exchange_kind": "swap", "location_name": "Kadikoy", "scheduled_date": "2028-08-29", "to_employee_id": "51017f0c-a2f8-4fd0-8568-b49c88bd8a50", "exchange_case_id": "b2df6d9b-eb62-41fa-802d-63290c32016e", "from_employee_id": "cbea0cee-6fc4-4ab3-ab2a-3289fb33ca2c", "to_employee_name": "Deniz Person", "draft_employee_id": "4cd03230-948b-45d6-846b-1f03931ff361", "from_employee_name": "Ali Person", "draft_employee_name": "Emre Person"};
    const preview = schedulePublicationPreview();
    mocks.rpc.mockResolvedValueOnce({ data: { ...preview, findings: [undone] }, error: null });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    const result = await service.previewPublication({ actorUserId, workspaceId, draftId, locationIds: [locationId] });
    expect(result.findings).toEqual([undone]);
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

  // Open shifts in the pool (Mert, 2026-10-20): the choice goes only when made, so a publish
  // without one keeps the open shifts as before.
  it("sends the open shifts' choice to the publish only when one is made", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: "published",
        workspace_id: workspaceId,
        week_start: "2026-08-17",
        draft_id: draftId,
        draft_revision: 2,
        location_ids: [locationId],
        publication_ids: ["86000000-0000-4000-8000-000000000001"],
        published_shift_count: 1,
        published_at: "2026-08-17T12:00:00.000Z",
      },
      error: null,
    });
    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });
    const input = {
      actorUserId,
      workspaceId,
      draftId,
      locationIds: [locationId],
      expectedDraftRevision: 2,
      fingerprint: "a".repeat(64),
      overrides: [],
    };
    await service.publish({ ...input, openShifts: "offer" });
    await service.publish(input);
    expect(mocks.rpc.mock.calls[0]?.[1]).toMatchObject({ open_shift_choice: "offer" });
    expect(mocks.rpc.mock.calls[1]?.[1]).not.toHaveProperty("open_shift_choice");
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
        week_start: "2026-08-17",
        location_ids: [locationId],
        targets: ["draft_shifts", "pending_ops", "edit_lock"],
      },
    });
  });

  // KK-162 (BL-694): Replace's first click says how many shifts it removes; the
  // database counts them (only the template's lanes, never a started shift).
  it("asks the database how many shifts a template replace removes", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { removed_shift_count: 10 }, error: null });

    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });
    const result = await service.previewTemplateApply({
      actorUserId,
      workspaceId,
      sessionId: "87000000-0000-4000-8000-000000000001",
      templateId: "86000000-0000-4000-8000-000000000001",
      departmentKeys: ["__no_department__"],
    });

    expect(result).toEqual({ removed_shift_count: 10 });
    expect(mocks.rpc).toHaveBeenLastCalledWith("preview_schedule_template_apply_service", {
      actor_user_id: actorUserId,
      target_workspace_id: workspaceId,
      target_session_id: "87000000-0000-4000-8000-000000000001",
      target_template_id: "86000000-0000-4000-8000-000000000001",
      department_keys: ["__no_department__"],
    });
  });

  it("passes the labels a template could not apply to the screen (BL-197)", async () => {
    // Verbatim from a real run of apply_schedule_template_service() (migration
    // 20260927140000, rolled back): Standby was archived after "Standard week" was saved.
    const answer = {"mode": "merge", "status": "applied", "session": {"id": "5fcdb17c-6782-44f9-b1de-5ff57d8e9d86", "dirty": true, "shifts": [{"id": "493b3bd6-7629-4ce7-a360-0308f5caa3c4", "note": "", "job_id": "0fa432e2-9746-4a72-83bd-bbcf00caac59", "locked": false, "end_time": "15:00", "revision": 1, "label_ids": ["d123f2f7-ae36-4600-83e3-3726774136a1"], "start_time": "09:00", "time_basis": "explicit", "employee_id": null, "label_names": ["Opener"], "location_id": "bcf27afe-a1c1-4c2b-9741-5955be7a69ae", "shift_type_id": null, "time_snapshot": null, "time_timezone": "Europe/Istanbul", "warning_codes": [], "scheduled_date": "2028-09-05", "pending_op_type": null, "crosses_midnight": false, "hide_time_on_badge": false, "unpaid_break_minutes": 0, "source_published_shift_id": null}, {"id": "3bc439a0-45be-4cec-959a-ee3efc11721f", "note": "", "job_id": "0fa432e2-9746-4a72-83bd-bbcf00caac59", "locked": false, "end_time": "15:00", "revision": 1, "label_ids": [], "start_time": "09:00", "time_basis": "explicit", "employee_id": null, "label_names": [], "location_id": "bcf27afe-a1c1-4c2b-9741-5955be7a69ae", "shift_type_id": null, "time_snapshot": null, "time_timezone": "Europe/Istanbul", "warning_codes": [], "scheduled_date": "2028-09-06", "pending_op_type": null, "crosses_midnight": false, "hide_time_on_badge": false, "unpaid_break_minutes": 0, "source_published_shift_id": null}], "revision": 2, "expires_at": "2026-09-28T01:31:50.366372+00:00", "week_start": "2028-09-04", "holder_name": "Olcay Owner", "source_kind": "blank", "location_ids": ["bcf27afe-a1c1-4c2b-9741-5955be7a69ae", "cfc71385-03e2-46a0-9d26-824e077da40e"], "workspace_id": "08b697b2-76e2-405b-a102-0b5d12089288", "holder_user_id": "d72cbff6-f055-48b1-920b-64b88a1e1c2f", "last_heartbeat": "2026-09-28T01:27:50.366372+00:00", "source_draft_id": null, "source_revision": 0}, "skipped": [{"kind": "archived_label", "name": "Standby", "shift_count": 2}], "applied_shift_count": 2, "converted_open_count": 0};
    mocks.rpc.mockResolvedValueOnce({ data: answer, error: null });

    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });
    const result = await service.applyTemplate({
      actorUserId,
      workspaceId,
      sessionId: answer.session.id,
      expectedSessionRevision: 1,
      templateId: "86000000-0000-4000-8000-000000000001",
      mode: "merge",
      departmentKeys: null,
    });

    expect(result.skipped).toEqual([
      { kind: "archived_label", name: "Standby", shift_count: 2 },
    ]);
  });

  it("keeps successful writes successful when realtime broadcast fails", async () => {
    mocks.send.mockRejectedValueOnce(new Error("realtime unavailable"));
    mocks.from.mockImplementation(() => {
      const chain = { select: () => chain, eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: { location_ids: [locationId] }, error: null }) };
      return chain;
    });
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

  // DB-2: one private channel per location; Kadikoy's channel never names Besiktas.
  it("sends each location its own channel, naming only that location", async () => {
    const otherLocationId = "11000000-0000-4000-8000-000000000002";
    mocks.rpc.mockResolvedValueOnce({
      data: {
        status: "published", workspace_id: workspaceId, week_start: "2026-08-17", draft_id: draftId,
        draft_revision: 2, location_ids: [locationId, otherLocationId],
        publication_ids: ["86000000-0000-4000-8000-000000000001"], published_shift_count: 4,
        published_at: "2026-08-17T12:00:00.000Z",
      },
      error: null,
    });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    await service.publish({ actorUserId, workspaceId, draftId, locationIds: [locationId, otherLocationId],
      expectedDraftRevision: 2, fingerprint: "a".repeat(64), overrides: [] });

    expect(mocks.channelFn.mock.calls).toEqual([
      [`schedule:invalidation:${workspaceId}:${locationId}`, { config: { private: true } }],
      [`schedule:invalidation:${workspaceId}:${otherLocationId}`, { config: { private: true } }],
    ]);
    const payloads = mocks.send.mock.calls.map((call) => (call as unknown as [{ payload: Record<string, unknown> }])[0].payload);
    expect(payloads.map((payload) => payload.location_ids)).toEqual([[locationId], [otherLocationId]]);
    for (const payload of payloads) {
      expect(payload).not.toHaveProperty("draft_id");
      expect(payload).not.toHaveProperty("actor_user_id");
    }
  });

  it("sends nothing when a change names no location", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { status: "ok", op_id: draftId }, error: null });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    await service.removePendingOp({ actorUserId, workspaceId, opId: draftId });

    expect(mocks.channelFn).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("finds a saved draft's locations in the workspace before sending", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { id: draftId, workspace_id: workspaceId, week_start: "2026-08-17", name: "Dinner draft", revision: 1,
        created_by: actorUserId, updated_by: actorUserId, created_at: "2026-08-17T12:00:00.000Z",
        updated_at: "2026-08-17T12:00:00.000Z" },
      error: null,
    });
    const eq = vi.fn();
    mocks.from.mockImplementation(() => {
      const chain = {
        select: () => chain,
        eq: (...args: unknown[]) => { eq(...args); return chain; },
        maybeSingle: () => Promise.resolve({ data: { location_ids: [locationId] }, error: null }),
      };
      return chain;
    });
    const service = createScheduleReadService({ url: "https://example.supabase.co", serviceRoleKey: "service-role" });
    await service.saveSession({ actorUserId, workspaceId, sessionId: "87000000-0000-4000-8000-000000000001",
      expectedSessionRevision: 1, name: "Dinner draft", draftId: null, expectedDraftRevision: null });

    expect(mocks.from).toHaveBeenCalledWith("schedule_drafts");
    expect(eq).toHaveBeenCalledWith("workspace_id", workspaceId);
    expect(eq).toHaveBeenCalledWith("id", draftId);
    expect(mocks.channelFn).toHaveBeenCalledWith(`schedule:invalidation:${workspaceId}:${locationId}`, { config: { private: true } });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      payload: { kind: "schedule_invalidation", workspace_id: workspaceId, week_start: "2026-08-17",
        location_ids: [locationId], targets: ["drafts", "draft_shifts", "pending_ops"] },
    }));
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
