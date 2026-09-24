import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import type { TimeEntriesService } from "./time-entries-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const employeeId = "15000000-0000-4000-8000-000000000001";
const locationId = "11000000-0000-4000-8000-000000000001";
const sessionId = "b6200000-0000-4000-8000-000000000001";
const correctionId = "b6800000-0000-4000-8000-000000000001";
const manualEntryId = "b6900000-0000-4000-8000-000000000001";
const amendmentId = "b7000000-0000-4000-8000-000000000001";
const reviewWindowId = "b7100000-0000-4000-8000-000000000001";
const manualIdempotencyKey = "b6100000-0000-4000-8000-000000000001";
const amendmentIdempotencyKey = "b6100000-0000-4000-8000-000000000002";
const correctionIdempotencyKey = "b6100000-0000-4000-8000-000000000003";
const reviewIdempotencyKey = "b6100000-0000-4000-8000-000000000004";

const mismatchedContext: ActiveWorkspaceContext = {
  userId,
  workspace: {
    id: otherWorkspaceId,
    name: "Other Workspace",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
  membership: {
    id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
    userId,
    workspaceId: otherWorkspaceId,
    role: "manager",
    status: "active",
    allLocations: true,
  },
  permissions: [
    "workspace.read",
    "time.read.location",
    "time.amend.location",
    "time.correction.review.location",
    "time.review.approve.location",
  ],
  actions: [],
  onboarding: { status: "complete", currentStep: 2, revision: 1 },
  locationScope: { allLocations: true, locationIds: [] },
};
const activeContext: ActiveWorkspaceContext = {
  ...mismatchedContext,
  workspace: {
    ...mismatchedContext.workspace,
    id: workspaceId,
    name: "Current Workspace",
  },
  membership: {
    ...mismatchedContext.membership,
    workspaceId,
  },
};

function timeEntriesServiceMock(): TimeEntriesService {
  return {
    get: vi.fn(),
    createManual: vi.fn(),
    amend: vi.fn(),
    decideCorrection: vi.fn(),
    approveReviewWindow: vi.fn(),
  };
}

describe("time entries routes", () => {
  it("returns generic not found for every route when the active workspace context mismatches the path", async () => {
    const service = timeEntriesServiceMock();
    const app = buildApp({
      contextResolver: { resolve: async () => mismatchedContext },
      timeEntriesService: service,
    });
    const routes = [
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/time-entries?from=2026-08-17&to=2026-08-23`,
        serviceMethod: "get",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/time-entries/manual`,
        headers: { "idempotency-key": "b6100000-0000-4000-8000-000000000001" },
        payload: {
          employee_id: employeeId,
          location_id: locationId,
          started_at: "2026-08-17T16:00:00.000Z",
          ended_at: "2026-08-18T00:00:00.000Z",
          reason: "Employee forgot to clock in",
        },
        serviceMethod: "createManual",
      },
      {
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/time-entries/${sessionId}`,
        headers: { "idempotency-key": "b6100000-0000-4000-8000-000000000002" },
        payload: {
          expected_revision: 2,
          effective_started_at: "2026-08-17T16:15:00.000Z",
          effective_ended_at: "2026-08-18T00:00:00.000Z",
          reason: "Corrected from written log",
        },
        serviceMethod: "amend",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/time-entries/corrections/${correctionId}/decision`,
        headers: { "idempotency-key": "b6100000-0000-4000-8000-000000000003" },
        payload: {
          expected_session_revision: 2,
          action: "accept",
          reason: "Verified against signed note",
        },
        serviceMethod: "decideCorrection",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/time-entries/review-windows`,
        headers: { "idempotency-key": "b6100000-0000-4000-8000-000000000004" },
        payload: {
          location_id: locationId,
          from: "2026-08-17",
          to: "2026-08-23",
          sessions: [{ session_id: sessionId, expected_revision: 2 }],
        },
        serviceMethod: "approveReviewWindow",
      },
    ] as const;

    for (const route of routes) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: {
          authorization: "Bearer manager-token",
          ...("headers" in route ? route.headers : {}),
        },
        payload: "payload" in route ? route.payload : undefined,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Workspace not found" });
      expect(service[route.serviceMethod]).not.toHaveBeenCalled();
    }
  });

  it("ignores spoofed actor, workspace and path resource fields in write bodies", async () => {
    const service = timeEntriesServiceMock();
    const timeSession = {
      id: sessionId,
      workspace_id: workspaceId,
      employee_id: employeeId,
      location_id: locationId,
      capture_state: "complete" as const,
      review_state: "unreviewed" as const,
      started_at: "2026-08-17T16:00:00.000Z",
      ended_at: "2026-08-18T00:00:00.000Z",
      effective_started_at: "2026-08-17T16:00:00.000Z",
      effective_ended_at: "2026-08-18T00:00:00.000Z",
      last_event_at: "2026-08-18T00:00:00.000Z",
      revision: 2,
    };
    const amendment = {
      id: amendmentId,
      workspace_id: workspaceId,
      session_id: sessionId,
      actor_user_id: userId,
      reason: "Corrected from written log",
      before_started_at: "2026-08-17T16:00:00.000Z",
      before_ended_at: "2026-08-18T00:00:00.000Z",
      after_started_at: "2026-08-17T16:15:00.000Z",
      after_ended_at: "2026-08-18T00:00:00.000Z",
      base_revision: 2,
      result_revision: 3,
      idempotency_key: amendmentIdempotencyKey,
      created_at: "2026-08-18T00:05:00.000Z",
    };
    vi.mocked(service.createManual).mockResolvedValue({
      session: timeSession,
      events: [
        {
          id: "b7200000-0000-4000-8000-000000000001",
          workspace_id: workspaceId,
          session_id: sessionId,
          employee_id: employeeId,
          location_id: locationId,
          event_type: "clock_in",
          occurred_at: "2026-08-17T16:00:00.000Z",
          received_at: "2026-08-17T16:00:01.000Z",
          actor_user_id: userId,
          actor_employee_id: null,
          kiosk_device_id: null,
          kiosk_action_session_id: null,
          source: "manager",
          idempotency_key: manualIdempotencyKey,
        },
        {
          id: "b7200000-0000-4000-8000-000000000002",
          workspace_id: workspaceId,
          session_id: sessionId,
          employee_id: employeeId,
          location_id: locationId,
          event_type: "clock_out",
          occurred_at: "2026-08-18T00:00:00.000Z",
          received_at: "2026-08-18T00:00:01.000Z",
          actor_user_id: userId,
          actor_employee_id: null,
          kiosk_device_id: null,
          kiosk_action_session_id: null,
          source: "manager",
          idempotency_key: manualIdempotencyKey,
        },
      ],
      manual_entry: {
        id: manualEntryId,
        session_id: sessionId,
        actor_user_id: userId,
        reason: "Employee forgot to clock in",
        idempotency_key: manualIdempotencyKey,
        created_at: "2026-08-18T00:01:00.000Z",
      },
      idempotent_replay: false,
    });
    vi.mocked(service.amend).mockResolvedValue({
      session: { ...timeSession, revision: 3 },
      amendment,
      idempotent_replay: false,
    });
    vi.mocked(service.decideCorrection).mockResolvedValue({
      correction: {
        id: correctionId,
        workspace_id: workspaceId,
        session_id: sessionId,
        employee_id: employeeId,
        location_id: locationId,
        requested_started_at: "2026-08-17T16:15:00.000Z",
        requested_ended_at: "2026-08-18T00:00:00.000Z",
        reason: "Clock-in was later",
        base_revision: 2,
        status: "accepted",
        submitted_at: "2026-08-18T00:02:00.000Z",
        decided_by: userId,
        decision_reason: "Verified against signed note",
        decided_at: "2026-08-18T00:06:00.000Z",
        result_amendment_id: amendmentId,
      },
      amendment,
      session: { ...timeSession, revision: 3 },
      idempotent_replay: false,
    });
    vi.mocked(service.approveReviewWindow).mockResolvedValue({
      window: {
        id: reviewWindowId,
        workspace_id: workspaceId,
        location_id: locationId,
        from_date: "2026-08-17",
        to_date: "2026-08-23",
        status: "approved",
        session_versions: { [sessionId]: 2 },
        approved_by: userId,
        approved_at: "2026-08-24T00:00:00.000Z",
      },
      approved_session_count: 1,
      idempotent_replay: false,
    });
    const app = buildApp({
      contextResolver: { resolve: async () => activeContext },
      timeEntriesService: service,
    });
    const spoofedIdentity = {
      actorUserId: "11111111-1111-4111-8111-111111111111",
      actor_user_id: "11111111-1111-4111-8111-111111111111",
      userId: "11111111-1111-4111-8111-111111111111",
      workspaceId: otherWorkspaceId,
      workspace_id: otherWorkspaceId,
      sessionId: "22222222-2222-4222-8222-222222222222",
      session_id: "22222222-2222-4222-8222-222222222222",
      correctionId: "33333333-3333-4333-8333-333333333333",
      correction_id: "33333333-3333-4333-8333-333333333333",
      idempotency_key: "44444444-4444-4444-8444-444444444444",
    };
    const manualEntry = {
      ...spoofedIdentity,
      employee_id: employeeId,
      location_id: locationId,
      started_at: "2026-08-17T16:00:00.000Z",
      ended_at: "2026-08-18T00:00:00.000Z",
      reason: "Employee forgot to clock in",
    };
    const amendmentInput = {
      ...spoofedIdentity,
      expected_revision: 2,
      effective_started_at: "2026-08-17T16:15:00.000Z",
      effective_ended_at: "2026-08-18T00:00:00.000Z",
      reason: "Corrected from written log",
    };
    const correctionDecision = {
      ...spoofedIdentity,
      expected_session_revision: 2,
      action: "accept",
      reason: "Verified against signed note",
    };
    const reviewWindow = {
      ...spoofedIdentity,
      location_id: locationId,
      from: "2026-08-17",
      to: "2026-08-23",
      sessions: [{ session_id: sessionId, expected_revision: 2 }],
    };

    const requests = [
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/time-entries/manual`,
        headers: { "idempotency-key": manualIdempotencyKey },
        payload: manualEntry,
        expectedStatus: 201,
      },
      {
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/time-entries/${sessionId}`,
        headers: { "idempotency-key": amendmentIdempotencyKey },
        payload: amendmentInput,
        expectedStatus: 200,
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/time-entries/corrections/${correctionId}/decision`,
        headers: { "idempotency-key": correctionIdempotencyKey },
        payload: correctionDecision,
        expectedStatus: 200,
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/time-entries/review-windows`,
        headers: { "idempotency-key": reviewIdempotencyKey },
        payload: reviewWindow,
        expectedStatus: 201,
      },
    ] as const;

    for (const request of requests) {
      const response = await app.inject({
        method: request.method,
        url: request.url,
        headers: {
          authorization: "Bearer manager-token",
          ...request.headers,
        },
        payload: request.payload,
      });
      expect(response.statusCode).toBe(request.expectedStatus);
    }

    expect(service.createManual).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      entry: {
        employee_id: manualEntry.employee_id,
        location_id: manualEntry.location_id,
        started_at: manualEntry.started_at,
        ended_at: manualEntry.ended_at,
        reason: manualEntry.reason,
      },
      idempotencyKey: manualIdempotencyKey,
    });
    expect(service.amend).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      sessionId,
      amendment: {
        expected_revision: amendmentInput.expected_revision,
        effective_started_at: amendmentInput.effective_started_at,
        effective_ended_at: amendmentInput.effective_ended_at,
        reason: amendmentInput.reason,
      },
      idempotencyKey: amendmentIdempotencyKey,
    });
    expect(service.decideCorrection).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      correctionId,
      decision: {
        expected_session_revision: correctionDecision.expected_session_revision,
        action: correctionDecision.action,
        reason: correctionDecision.reason,
      },
      idempotencyKey: correctionIdempotencyKey,
    });
    expect(service.approveReviewWindow).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      review: {
        location_id: reviewWindow.location_id,
        from: reviewWindow.from,
        to: reviewWindow.to,
        sessions: reviewWindow.sessions,
      },
      idempotencyKey: reviewIdempotencyKey,
    });
  });
});
