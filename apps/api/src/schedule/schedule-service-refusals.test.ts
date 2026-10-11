import { beforeEach, describe, expect, it, vi } from "vitest";

import { createScheduleReadService } from "./schedule-service";

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const from = vi.fn();
  const channel = { send: vi.fn(async () => "ok") };
  const createClient = vi.fn(() => ({
    rpc,
    from,
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => "ok"),
  }));
  return { createClient, from, rpc };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const actorUserId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const id = "85000000-0000-4000-8000-000000000001";

// The core's "no": 42501 with its reason in the hint.
const refusal = {
  code: "42501",
  message: "Not allowed",
  hint: "authz.out_of_scope",
  details: "schedule.export",
};

// Every service path a Schedule route calls.
const routeMethods = [
  "getReadModel", "listDrafts", "listWeeklyShifts", "acquireSession", "heartbeat", "mutateShift",
  "createShiftsBatch", "bulkDeleteShifts", "previewDefaultHours", "applyDefaultHours", "saveSession",
  "discardSession", "deleteDraft", "listPendingOps", "addPendingOp",
  "updatePendingOp", "removePendingOp", "getPublicationStatus", "previewPublication", "publish",
  "previewUnpublish", "unpublish", "listTemplates", "getTemplate",
  "createTemplate", "renameTemplate", "deleteTemplate", "applyTemplate", "previewTemplateApply", "previewAutoFill",
  "applyAutoFill", "previewExport", "listExportPresets", "createExportPreset", "updateExportPreset",
  "deleteExportPreset", "listExportSchedules", "createExportSchedule", "updateExportSchedule",
  "deleteExportSchedule", "listRecentExports", "recordExport",
] as const;

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.rpc.mockResolvedValue({ data: null, error: refusal });
  mocks.from.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const key of ["select", "eq", "in", "is", "order", "lte", "or", "insert", "update", "delete", "limit"])
      chain[key] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: null, error: refusal });
    chain.single = chain.maybeSingle;
    chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: null, error: refusal });
    return chain;
  });
});

describe("Schedule service refusals", () => {
  it.each(routeMethods)("%s: the core's no stays a 403 with its reason", async (name) => {
    const service = createScheduleReadService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });
    // One argument shape for both styles: positional methods read the string,
    // input methods read the fields.
    const input = Object.assign(new String(actorUserId), {
      actorUserId, workspaceId, sessionId: id, draftId: id, weekStart: "2026-08-17", locationIds: [id],
      departmentIds: [id], expectedSessionRevision: 1, expectedDraftRevision: 1, operation: "create",
      shiftId: id, shifts: [], shiftIds: [id], fingerprint: "a".repeat(64), overrides: [], pendingOp: {},
      opId: id, templateId: id, presetId: id, scheduleId: id, name: "x", sourceKind: "published",
      sourceType: "published", command: {}, assignments: [], settings: {}, params: {},
    });
    const method = (service as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[name]!;
    await expect(method(input, workspaceId, "2026-08-17", id)).rejects.toMatchObject({
      statusCode: 403,
      reason: "authz.out_of_scope",
    });
  });
});
