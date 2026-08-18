import { describe, expect, it } from "vitest";
import { buildApp } from "./app";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import type { EmployeeOnboardingService } from "./employees/onboarding-service";
import type { ScheduleReadService } from "./schedule/schedule-service";
import type { ScheduleLineupService } from "./schedule/schedule-lineup-service";
import type { ScheduleRequestsService } from "./schedule/schedule-requests-service";
import type { EmployeeHubService } from "./employee-hub/employee-hub-service";
import type { CommunicationService } from "./communications/communication-service";
import type { TimeEntriesService } from "./time-entries/time-entries-service";

const resolvedContext: ActiveWorkspaceContext = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: { id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", name: "Meyhouse" },
  membership: {
    id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
    userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
    workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    role: "owner",
    status: "active",
    allLocations: true,
  },
  permissions: [
    "workspace.read",
    "workspace.manage",
    "schedule.read",
    "schedule.manage",
    "schedule.publish",
    "schedule.templates.manage",
    "schedule.export",
    "schedule.lineup.read",
    "schedule.lineup.manage",
    "schedule.lineup.share",
    "schedule.time_off_requests.read",
    "schedule.time_off_requests.manage",
    "schedule.shift_change_requests.read",
    "schedule.shift_change_requests.manage",
    "roles.read",
    "roles.manage",
    "documents.read",
    "documents.manage",
    "signature_templates.read",
    "signature_templates.manage",
    "employees.read",
    "employees.manage",
    "employees.archive",
    "employee_access.manage",
    "employee_onboarding.review",
    "employee_documents.review",
    "announcements.read",
    "announcements.manage",
    "notifications.read",
    "time.capture.own",
    "time.read.own",
    "time.correction.request.own",
    "time.read.location",
    "time.amend.location",
    "time.correction.review.location",
    "time.review.approve.location",
    "time.audit.read",
    "kiosk.device.enroll.location",
    "kiosk.device.read.location",
    "kiosk.device.revoke.location",
    "kiosk.pin.reset.location",
    "kiosk.audit.read.location",
  ],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
};

describe("api app", () => {
  it("serves the current phase health endpoint", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: "newfork-api",
      phase: "phase-10",
    });
  });

  it("requires a valid active workspace context", async () => {
    const app = buildApp();
    const unauthorized = await app.inject({
      method: "GET",
      url: "/v1/development/context",
    });
    expect(unauthorized.statusCode).toBe(401);

    const response = await app.inject({
      method: "GET",
      url: "/v1/development/context",
      headers: {
        "x-user-id": "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
        "x-workspace-id": "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        "x-workspace-role": "manager",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      workspace: { id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd" },
      membership: { role: "manager" },
      permissions: expect.arrayContaining(["schedule.manage"]),
    });
  });

  it("does not expose development identity in production mode", async () => {
    const app = buildApp({ allowDevelopmentIdentity: false });
    const response = await app.inject({
      method: "GET",
      url: "/v1/development/context",
    });

    expect(response.statusCode).toBe(404);
  });

  it("resolves authenticated bearer sessions through the injected auth boundary", async () => {
    const app = buildApp({
      contextResolver: {
        resolve: async (token) =>
          token === "valid-token" ? resolvedContext : null,
      },
    });

    const unauthorized = await app.inject({
      method: "GET",
      url: "/v1/context",
    });
    expect(unauthorized.statusCode).toBe(401);

    const response = await app.inject({
      method: "GET",
      url: "/v1/context",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(resolvedContext);
  });

  it("derives Employee Hub reads from the authenticated actor", async () => {
    const calls: unknown[] = [];
    const service = {
      get: async (input: unknown) => {
        calls.push(input);
        return {
          workspace_id: resolvedContext.workspace.id,
          employee: {
            id: "15000000-0000-4000-8000-000000000001",
            display_name: "Alex Kim",
          },
          locations: [],
          shifts: [],
          open_shifts: [],
          team_shifts: [],
          requests: [],
          availability: null,
          team: [],
          lineup: [],
        };
      },
    } as unknown as EmployeeHubService;
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      employeeHubService: service,
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/employee-hub?from=2026-08-17&to=2026-09-28`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        from: "2026-08-17",
        to: "2026-09-28",
      },
    ]);
  });

  it("validates employee time off input before the service boundary", async () => {
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      employeeHubService: {} as EmployeeHubService,
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/employee-hub/time-off`,
      headers: { authorization: "Bearer valid-token" },
      payload: { location_id: "not-a-uuid", dates: [] },
    });
    expect(response.statusCode).toBe(400);
  });

  it("forwards a revision-guarded employee request action", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      employeeHubService: {
        actOnRequest: async (input: unknown) => {
          calls.push(input);
          return {
            status: "cancelled",
            request_id: "98200000-0000-4000-8000-000000000001",
            revision: 2,
          };
        },
      } as unknown as EmployeeHubService,
    });
    const action = {
      request_id: "98200000-0000-4000-8000-000000000001",
      kind: "time_off",
      action: "cancel",
      expected_revision: 1,
    };
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/employee-hub/request-action`,
      headers: { authorization: "Bearer valid-token" },
      payload: action,
    });
    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        action,
      },
    ]);
  });

  it("derives personal time reads from the authenticated actor", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      employeeHubService: {
        getTimeTracking: async (input: unknown) => {
          calls.push(input);
          return {
            workspace_id: resolvedContext.workspace.id,
            employee: {
              id: "15000000-0000-4000-8000-000000000001",
              display_name: "Alex Kim",
            },
            locations: [],
            current_session: null,
            sessions: [],
          };
        },
      } as unknown as EmployeeHubService,
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/employee-hub/time-tracking`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
      },
    ]);
  });

  it("requires an idempotency key for employee time capture", async () => {
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      employeeHubService: {} as EmployeeHubService,
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/employee-hub/time-tracking/events`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        location_id: "11000000-0000-4000-8000-000000000001",
        session_id: null,
        event_type: "clock_in",
        occurred_at: "2026-08-17T16:00:00.000Z",
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("forwards employee capture without accepting employee or source fields", async () => {
    const calls: unknown[] = [];
    const event = {
      location_id: "11000000-0000-4000-8000-000000000001",
      session_id: null,
      event_type: "clock_in" as const,
      occurred_at: "2026-08-17T16:00:00.000Z",
    };
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      employeeHubService: {
        captureTimeEvent: async (input: unknown) => {
          calls.push(input);
          return {};
        },
      } as unknown as EmployeeHubService,
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/employee-hub/time-tracking/events`,
      headers: {
        authorization: "Bearer valid-token",
        "idempotency-key": "a6200000-0000-4000-8000-000000000001",
      },
      payload: { ...event, employee_id: "spoofed", source: "manager" },
    });
    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        event,
        idempotencyKey: "a6200000-0000-4000-8000-000000000001",
      },
    ]);
  });

  it("forwards own correction requests from authenticated employee context", async () => {
    const calls: unknown[] = [];
    const correction = {
      session_id: "b6200000-0000-4000-8000-000000000001",
      expected_revision: 2,
      requested_started_at: "2026-08-17T16:30:00.000Z",
      requested_ended_at: "2026-08-18T00:00:00.000Z",
      reason: "Clock-in was later",
    };
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      employeeHubService: {
        requestTimeCorrection: async (input: unknown) => {
          calls.push(input);
          return {};
        },
      } as unknown as EmployeeHubService,
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/employee-hub/time-tracking/corrections`,
      headers: {
        authorization: "Bearer valid-token",
        "idempotency-key": "a6200000-0000-4000-8000-000000000002",
      },
      payload: correction,
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        correction,
        idempotencyKey: "a6200000-0000-4000-8000-000000000002",
      },
    ]);
  });

  it("forwards the authenticated actor to the manager Workspace service", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      communicationService: {
        getWorkspace: async (input: unknown) => {
          calls.push(input);
          return {
            workspace_id: resolvedContext.workspace.id,
            display_name: "Development Owner",
            metrics: {
              today_shift_count: 0,
              today_open_shift_count: 0,
              pending_time_off_count: 0,
              pending_shift_change_count: 0,
              unread_notification_count: 0,
            },
            announcements: [],
            notifications: [],
            layout: {
              widget_order: [
                "operations",
                "pending_requests",
                "open_shifts",
                "announcements",
                "notifications",
                "quick_actions",
              ],
              hidden_widget_ids: [],
            },
          };
        },
      } as unknown as CommunicationService,
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/workspace`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
      },
    ]);
  });

  it("validates announcement content before the service boundary", async () => {
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      communicationService: {} as CommunicationService,
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/communications/announcements`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        announcement: {
          title: "",
          body: "Briefing",
          category: "operations",
          audience_roles: [],
          location_ids: [],
          publish_at: null,
          expires_at: null,
          action_url: "https://outside.example",
        },
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("forwards personal notification actions", async () => {
    const calls: unknown[] = [];
    const notificationId = "a8300000-0000-4000-8000-000000000001";
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      communicationService: {
        actOnNotification: async (input: unknown) => {
          calls.push(input);
          return { status: "saved", affected: 1 };
        },
      } as unknown as CommunicationService,
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/communications/notifications/action`,
      headers: { authorization: "Bearer valid-token" },
      payload: { notification_id: notificationId, action: "read" },
    });
    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        action: { notification_id: notificationId, action: "read" },
      },
    ]);
  });

  it("keeps the manager Workspace unavailable to employee-only roles", async () => {
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...resolvedContext,
          membership: { ...resolvedContext.membership, role: "employee" },
          permissions: [
            "workspace.read",
            "schedule.read",
            "announcements.read",
            "notifications.read",
          ],
        }),
      },
      communicationService: {} as CommunicationService,
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/workspace`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("forwards authorized Line-up scope to the dedicated service", async () => {
    const calls: unknown[] = [];
    const lineupService = {
      get: async (input: unknown) => {
        calls.push(input);
        return {
          workspace_id: resolvedContext.workspace.id,
          date: "2026-08-17",
          source: "published" as const,
          locations: [],
          sections: [],
          jobs: [],
          shift_types: [],
          employees: [],
        };
      },
    } as unknown as ScheduleLineupService;
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleLineupService: lineupService,
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/schedule/lineup?date=2026-08-17&location_ids=11000000-0000-4000-8000-000000000001`,
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        date: "2026-08-17",
        locationIds: ["11000000-0000-4000-8000-000000000001"],
        shiftTypeIds: null,
      },
    ]);
  });

  it("forwards revision-guarded Line-up section creation", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleLineupService: {
        saveSection: async (
          input: Parameters<ScheduleLineupService["saveSection"]>[0],
        ) => {
          calls.push(input);
          return {
            id: "96000000-0000-4000-8000-000000000001",
            workspace_id: resolvedContext.workspace.id,
            name: input.section.name,
            color: input.section.color,
            sort_order: input.section.sort_order,
            revision: 1,
          };
        },
      } as unknown as ScheduleLineupService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/schedule/lineup/sections`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        expected_revision: null,
        section: { name: "Host stand", color: "#336699", sort_order: 30 },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        sectionId: null,
        expectedRevision: null,
        section: { name: "Host stand", color: "#336699", sort_order: 30 },
      },
    ]);
  });

  it("forwards Schedule Requests filters and cursors", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleRequestsService: {
        get: async (input: Parameters<ScheduleRequestsService["get"]>[0]) => {
          calls.push(input);
          return {
            workspace_id: resolvedContext.workspace.id,
            locations: [],
            time_off_pending_count: 0,
            shift_change_pending_count: 0,
            time_off_next_cursor: null,
            shift_change_next_cursor: null,
            time_off_requests: [],
            shift_change_requests: [],
          };
        },
      } as unknown as ScheduleRequestsService,
    });
    const cursor = "2026-08-17T12:00:00.000Z";
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/schedule/requests?time_off_queue=closed&shift_queue=history&search=alex&limit=25&time_off_cursor=${encodeURIComponent(cursor)}`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        timeOffQueue: "closed",
        shiftQueue: "history",
        locationId: null,
        search: "alex",
        timeOffCursor: cursor,
        shiftCursor: null,
        limit: 25,
      },
    ]);
  });

  it("forwards revision-guarded time off decisions", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleRequestsService: {
        resolveTimeOff: async (
          input: Parameters<ScheduleRequestsService["resolveTimeOff"]>[0],
        ) => {
          calls.push(input);
          return {
            status: "partially_approved",
            request_id: input.requestId,
            revision: 2,
          };
        },
      } as unknown as ScheduleRequestsService,
    });
    const requestId = "97200000-0000-4000-8000-000000000001";
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/schedule/requests/time-off/${requestId}/decision`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        expected_revision: 1,
        action: "partial_approve",
        note: "First day approved",
        segment_decisions: [
          {
            segment_id: "97300000-0000-4000-8000-000000000001",
            status: "approved",
          },
        ],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        requestId,
        decision: {
          expected_revision: 1,
          action: "partial_approve",
          note: "First day approved",
          segment_decisions: [
            {
              segment_id: "97300000-0000-4000-8000-000000000001",
              status: "approved",
            },
          ],
        },
      },
    ]);
  });

  it("denies Schedule Requests mutations without the matching manage capability", async () => {
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...resolvedContext,
          permissions: resolvedContext.permissions.filter(
            (permission) =>
              permission !== "schedule.shift_change_requests.manage",
          ),
        }),
      },
      scheduleRequestsService: {} as ScheduleRequestsService,
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/schedule/requests/shift-changes/97400000-0000-4000-8000-000000000001/decision`,
      headers: { authorization: "Bearer valid-token" },
      payload: { expected_revision: 1, action: "reject", note: "" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("prepares employee invitations only inside the authorized workspace", async () => {
    const prepared: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      invitationService: {
        preview: async () => ({
          workspaceName: "Meyhouse",
          emailHint: "em***@example.test",
          expiresAt: "2026-08-24T12:00:00.000Z",
        }),
        prepare: async (input) => {
          prepared.push(input);
          return {
            id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
            expiresAt: "2026-08-24T12:00:00.000Z",
            developmentUrl: "http://127.0.0.1:5173/accept-invite?token=test",
          };
        },
        revoke: async () => undefined,
        accept: async () => ({
          workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        }),
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/employees/fe201916-aa0e-480b-9144-1e1c8da20a31/invitations",
      headers: { authorization: "Bearer valid-token" },
      payload: { email: "employee@example.test" },
    });
    expect(response.statusCode).toBe(200);
    expect(prepared).toHaveLength(1);

    const crossWorkspace = await app.inject({
      method: "POST",
      url: "/v1/workspaces/1131ca31-392f-4ea0-bdc2-e1235e1496b1/employees/fe201916-aa0e-480b-9144-1e1c8da20a31/invitations",
      headers: { authorization: "Bearer valid-token" },
      payload: { email: "employee@example.test" },
    });
    expect(crossWorkspace.statusCode).toBe(403);
  });

  it("accepts invitation tokens through the authenticated identity boundary", async () => {
    const app = buildApp({
      contextResolver: null,
      invitationService: {
        preview: async () => ({
          workspaceName: "Meyhouse",
          emailHint: "em***@example.test",
          expiresAt: "2026-08-24T12:00:00.000Z",
        }),
        prepare: async () => {
          throw new Error("not used");
        },
        revoke: async () => undefined,
        accept: async (accessToken, token) => {
          expect(accessToken).toBe("employee-token");
          expect(token).toBe("a".repeat(64));
          return { workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd" };
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/invitations/accept",
      headers: { authorization: "Bearer employee-token" },
      payload: { token: "a".repeat(64) },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    });
  });

  it("serves self-scoped onboarding without an active workspace context", async () => {
    const service = onboardingServiceMock();
    const app = buildApp({ contextResolver: null, onboardingService: service });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me/onboarding",
      headers: { authorization: "Bearer pending-member-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      membership_status: "pending_activation",
      first_actionable_path: "/welcome/profile",
    });
  });

  it("validates SSN before crossing the encryption service boundary", async () => {
    let received = "";
    const service = onboardingServiceMock({
      saveSsn: async (_token, ssn) => {
        received = ssn;
        return 2;
      },
    });
    const app = buildApp({ onboardingService: service });
    const invalid = await app.inject({
      method: "PUT",
      url: "/v1/me/onboarding/ssn",
      headers: { authorization: "Bearer pending-member-token" },
      payload: { ssn: "1234", revision: 1 },
    });
    expect(invalid.statusCode).toBe(400);
    expect(received).toBe("");

    const valid = await app.inject({
      method: "PUT",
      url: "/v1/me/onboarding/ssn",
      headers: { authorization: "Bearer pending-member-token" },
      payload: { ssn: "123456789", revision: 1 },
    });
    expect(valid.statusCode).toBe(200);
    expect(received).toBe("123456789");
    expect(valid.body).not.toContain("123456789");
  });

  it("serves manager Schedule reads through the authenticated service boundary", async () => {
    const calls: string[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        getReadModel: async (_actor, _workspace, date) => {
          calls.push(date);
          return scheduleServiceMockModel();
        },
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule?date=2026-08-19&view=week",
      headers: { authorization: "Bearer owner-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().week_start).toBe("2026-08-17");
    expect(calls).toEqual(["2026-08-19"]);
  });

  it("does not expose manager Schedule reads to employee access class", async () => {
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...resolvedContext,
          membership: { ...resolvedContext.membership, role: "employee" },
        }),
      },
      scheduleService: scheduleServiceMock(),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule?date=2026-08-19&view=day",
      headers: { authorization: "Bearer employee-token" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("acquires a revisioned Schedule editing session", async () => {
    const calls: string[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        acquireSession: async (input) => {
          calls.push(`${input.sourceKind}:${input.weekStart}`);
          return { status: "acquired", session: scheduleSessionMockModel() };
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule/edit-sessions",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        week_start: "2026-08-17",
        source_kind: "published",
        source_draft_id: null,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("acquired");
    expect(calls).toEqual(["published:2026-08-17"]);
  });

  it("requires an idempotency key and forwards shift revisions", async () => {
    const revisions: number[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        mutateShift: async (input) => {
          revisions.push(input.expectedSessionRevision);
          return scheduleSessionMockModel();
        },
      }),
    });
    const url =
      "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule/edit-sessions/87000000-0000-4000-8000-000000000001/shifts";
    const payload = {
      expected_session_revision: 3,
      shift: {
        location_id: "11000000-0000-4000-8000-000000000001",
        employee_id: null,
        job_id: "33000000-0000-4000-8000-000000000001",
        shift_type_id: null,
        scheduled_date: "2026-08-17",
        start_time: "09:00",
        end_time: "17:00",
        note: "",
      },
    };
    const missing = await app.inject({
      method: "POST",
      url,
      headers: { authorization: "Bearer owner-token" },
      payload,
    });
    expect(missing.statusCode).toBe(400);
    const valid = await app.inject({
      method: "POST",
      url,
      headers: {
        authorization: "Bearer owner-token",
        "idempotency-key": "89000000-0000-4000-8000-000000000001",
      },
      payload,
    });
    expect(valid.statusCode).toBe(200);
    expect(revisions).toEqual([3]);
  });

  it("maps stale Schedule writes to conflict without invoking another mutation", async () => {
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        saveSession: async () => {
          throw new Error("session revision stale");
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule/edit-sessions/87000000-0000-4000-8000-000000000001/save",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        expected_session_revision: 2,
        name: "Opening plan",
        draft_id: null,
        expected_draft_revision: null,
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("session revision stale");
  });

  it("forwards canonical Schedule publication preview scope", async () => {
    const scopes: string[][] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        previewPublication: async (input) => {
          scopes.push(input.locationIds);
          return schedulePublicationPreviewMock();
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule/publication-preview",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        draft_id: "85000000-0000-4000-8000-000000000001",
        location_ids: ["11000000-0000-4000-8000-000000000001"],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("publish_ready");
    expect(scopes).toEqual([["11000000-0000-4000-8000-000000000001"]]);
  });

  it("returns publication history through the publish capability boundary", async () => {
    const weeks: string[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        getPublicationHistory: async (_actor, _workspace, weekStart) => {
          weeks.push(weekStart);
          return {
            workspace_id: resolvedContext.workspace.id,
            week_start: weekStart,
            publications: [],
          };
        },
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule/publication-history?week_start=2026-08-17",
      headers: { authorization: "Bearer owner-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().publications).toEqual([]);
    expect(weeks).toEqual(["2026-08-17"]);
  });

  it("requires the independent Schedule publish capability", async () => {
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...resolvedContext,
          permissions: resolvedContext.permissions.filter(
            (permission) => permission !== "schedule.publish",
          ),
        }),
      },
      scheduleService: scheduleServiceMock(),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule/publication-preview",
      headers: { authorization: "Bearer manager-token" },
      payload: {
        draft_id: "85000000-0000-4000-8000-000000000001",
        location_ids: ["11000000-0000-4000-8000-000000000001"],
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it("maps hard publication blockers and stale previews distinctly", async () => {
    const basePayload = {
      draft_id: "85000000-0000-4000-8000-000000000001",
      location_ids: ["11000000-0000-4000-8000-000000000001"],
      expected_draft_revision: 1,
      fingerprint: "a".repeat(64),
      overrides: [],
    };
    const hardApp = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        publish: async () => {
          throw new Error("schedule has hard publication blockers");
        },
      }),
    });
    const hard = await hardApp.inject({
      method: "POST",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule/publications",
      headers: { authorization: "Bearer owner-token" },
      payload: basePayload,
    });
    expect(hard.statusCode).toBe(422);

    const staleApp = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        publish: async () => {
          throw new Error("stale publication preview");
        },
      }),
    });
    const stale = await staleApp.inject({
      method: "POST",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule/publications",
      headers: { authorization: "Bearer owner-token" },
      payload: basePayload,
    });
    expect(stale.statusCode).toBe(409);
  });

  it("requires the independent Schedule template capability", async () => {
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...resolvedContext,
          permissions: resolvedContext.permissions.filter(
            (permission) => permission !== "schedule.templates.manage",
          ),
        }),
      },
      scheduleService: scheduleServiceMock(),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule/templates",
      headers: { authorization: "Bearer manager-token" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("forwards canonical Schedule export scope and settings", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        previewExport: async (input) => {
          calls.push(input);
          return scheduleExportPreviewMockModel();
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule/export-preview",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        week_start: "2026-08-17",
        source: { type: "published" },
        location_ids: ["11000000-0000-4000-8000-000000000001"],
        settings: {
          format: "csv",
          layout: "weekly",
          time_format: "12h",
          include_unassigned: false,
          include_notes: false,
          include_scheduled_hours: true,
          csv_delimiter: ",",
        },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("export_ready");
    expect(calls).toEqual([
      expect.objectContaining({
        sourceType: "published",
        sourceDraftId: null,
        locationIds: ["11000000-0000-4000-8000-000000000001"],
      }),
    ]);
  });

  it("forwards manager Time Entries reads from authenticated actor context", async () => {
    const calls: unknown[] = [];
    const service = {
      get: async (input: unknown) => {
        calls.push(input);
        return { sessions: [] };
      },
    } as unknown as TimeEntriesService;
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      timeEntriesService: service,
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/time-entries?from=2026-08-17&to=2026-08-23`,
      headers: { authorization: "Bearer manager-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        from: "2026-08-17",
        to: "2026-08-23",
      },
    ]);
  });

  it("derives manager manual-entry provenance outside the client payload", async () => {
    const calls: unknown[] = [];
    const service = {
      createManual: async (input: unknown) => {
        calls.push(input);
        return { idempotent_replay: false };
      },
    } as unknown as TimeEntriesService;
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      timeEntriesService: service,
    });
    const entry = {
      employee_id: "15000000-0000-4000-8000-000000000001",
      location_id: "11000000-0000-4000-8000-000000000001",
      started_at: "2026-08-17T16:00:00.000Z",
      ended_at: "2026-08-18T00:00:00.000Z",
      reason: "Employee forgot to clock in",
    };
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/time-entries/manual`,
      headers: {
        authorization: "Bearer manager-token",
        "idempotency-key": "b6100000-0000-4000-8000-000000000001",
      },
      payload: entry,
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        entry,
        idempotencyKey: "b6100000-0000-4000-8000-000000000001",
      },
    ]);
  });

  it("forwards revision-guarded manager time amendments", async () => {
    const calls: unknown[] = [];
    const service = {
      amend: async (input: unknown) => {
        calls.push(input);
        return { idempotent_replay: false };
      },
    } as unknown as TimeEntriesService;
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      timeEntriesService: service,
    });
    const amendment = {
      expected_revision: 2,
      effective_started_at: "2026-08-17T16:15:00.000Z",
      effective_ended_at: "2026-08-18T00:00:00.000Z",
      reason: "Corrected from written log",
    };
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/time-entries/b6200000-0000-4000-8000-000000000001`,
      headers: {
        authorization: "Bearer manager-token",
        "idempotency-key": "b6100000-0000-4000-8000-000000000002",
      },
      payload: amendment,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        sessionId: "b6200000-0000-4000-8000-000000000001",
        amendment,
        idempotencyKey: "b6100000-0000-4000-8000-000000000002",
      },
    ]);
  });

  it("forwards revision-guarded correction decisions", async () => {
    const calls: unknown[] = [];
    const service = {
      decideCorrection: async (input: unknown) => {
        calls.push(input);
        return {};
      },
    } as unknown as TimeEntriesService;
    const decision = {
      expected_session_revision: 2,
      action: "accept",
      reason: "Verified against signed note",
    };
    const correctionId = "b6800000-0000-4000-8000-000000000001";
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      timeEntriesService: service,
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/time-entries/corrections/${correctionId}/decision`,
      headers: {
        authorization: "Bearer manager-token",
        "idempotency-key": "b6100000-0000-4000-8000-000000000004",
      },
      payload: decision,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        correctionId,
        decision,
        idempotencyKey: "b6100000-0000-4000-8000-000000000004",
      },
    ]);
  });

  it("forwards exact session revisions for review-window approval", async () => {
    const calls: unknown[] = [];
    const service = {
      approveReviewWindow: async (input: unknown) => {
        calls.push(input);
        return {};
      },
    } as unknown as TimeEntriesService;
    const review = {
      location_id: "11000000-0000-4000-8000-000000000001",
      from: "2026-08-17",
      to: "2026-08-23",
      sessions: [
        {
          session_id: "b6200000-0000-4000-8000-000000000001",
          expected_revision: 2,
        },
      ],
    };
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      timeEntriesService: service,
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/time-entries/review-windows`,
      headers: {
        authorization: "Bearer manager-token",
        "idempotency-key": "b6100000-0000-4000-8000-000000000005",
      },
      payload: review,
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        review,
        idempotencyKey: "b6100000-0000-4000-8000-000000000005",
      },
    ]);
  });

  it("requires independent location-time permissions for manager routes", async () => {
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...resolvedContext,
          permissions: resolvedContext.permissions.filter(
            (permission) =>
              permission !== "time.read.location" &&
              permission !== "time.amend.location" &&
              permission !== "time.correction.review.location" &&
              permission !== "time.review.approve.location",
          ),
        }),
      },
      timeEntriesService: {} as TimeEntriesService,
    });
    const read = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/time-entries?from=2026-08-17&to=2026-08-23`,
      headers: { authorization: "Bearer manager-token" },
    });
    const write = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/time-entries/manual`,
      headers: {
        authorization: "Bearer manager-token",
        "idempotency-key": "b6100000-0000-4000-8000-000000000003",
      },
      payload: {
        employee_id: "15000000-0000-4000-8000-000000000001",
        location_id: "11000000-0000-4000-8000-000000000001",
        started_at: "2026-08-17T16:00:00.000Z",
        ended_at: "2026-08-18T00:00:00.000Z",
        reason: "Employee forgot to clock in",
      },
    });
    const decision = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/time-entries/corrections/b6800000-0000-4000-8000-000000000001/decision`,
      headers: {
        authorization: "Bearer manager-token",
        "idempotency-key": "b6100000-0000-4000-8000-000000000006",
      },
      payload: {
        expected_session_revision: 1,
        action: "reject",
        reason: "Request cannot be verified",
      },
    });
    const approval = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/time-entries/review-windows`,
      headers: {
        authorization: "Bearer manager-token",
        "idempotency-key": "b6100000-0000-4000-8000-000000000007",
      },
      payload: {
        location_id: "11000000-0000-4000-8000-000000000001",
        from: "2026-08-17",
        to: "2026-08-23",
        sessions: [
          {
            session_id: "b6200000-0000-4000-8000-000000000001",
            expected_revision: 1,
          },
        ],
      },
    });
    expect(read.statusCode).toBe(403);
    expect(write.statusCode, write.body).toBe(403);
    expect(decision.statusCode).toBe(403);
    expect(approval.statusCode).toBe(403);
  });
});

function scheduleServiceMock(
  overrides: Partial<ScheduleReadService> = {},
): ScheduleReadService {
  return {
    getReadModel: async () => scheduleServiceMockModel(),
    listDrafts: async () => ({ drafts: [] }),
    acquireSession: async () => ({
      status: "conflict",
      holder_name: "Another manager",
      last_heartbeat: "2026-08-17T12:00:00.000Z",
      expires_at: "2026-08-17T12:04:00.000Z",
    }),
    heartbeat: async () => scheduleSessionMockModel(),
    mutateShift: async () => scheduleSessionMockModel(),
    saveSession: async () => ({
      id: "88000000-0000-4000-8000-000000000001",
      workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      week_start: "2026-08-17",
      name: "Manager draft",
      revision: 1,
      created_by: resolvedContext.userId,
      updated_by: resolvedContext.userId,
      created_at: "2026-08-17T12:00:00.000Z",
      updated_at: "2026-08-17T12:00:00.000Z",
    }),
    discardSession: async () => undefined,
    previewPublication: async () => schedulePublicationPreviewMock(),
    publish: async () => ({
      status: "published",
      workspace_id: resolvedContext.workspace.id,
      week_start: "2026-08-17",
      draft_id: "85000000-0000-4000-8000-000000000001",
      draft_revision: 1,
      location_ids: ["11000000-0000-4000-8000-000000000001"],
      publication_ids: ["86000000-0000-4000-8000-000000000001"],
      published_shift_count: 1,
      published_at: "2026-08-17T12:00:00.000Z",
    }),
    previewUnpublish: async () => ({
      status: "unpublish_ready",
      workspace_id: resolvedContext.workspace.id,
      week_start: "2026-08-17",
      locations: [
        {
          location_id: "11000000-0000-4000-8000-000000000001",
          location_name: "Main Dining",
          publication_id: "86000000-0000-4000-8000-000000000001",
          version: 1,
          shift_count: 1,
        },
      ],
      fingerprint: "b".repeat(64),
    }),
    unpublish: async () => ({
      status: "unpublished",
      workspace_id: resolvedContext.workspace.id,
      week_start: "2026-08-17",
      location_ids: ["11000000-0000-4000-8000-000000000001"],
      publication_ids: ["86000000-0000-4000-8000-000000000001"],
      unpublished_at: "2026-08-17T12:00:00.000Z",
    }),
    getPublicationHistory: async () => ({
      workspace_id: resolvedContext.workspace.id,
      week_start: "2026-08-17",
      publications: [],
    }),
    listTemplates: async () => ({ templates: [] }),
    getTemplate: async () => scheduleTemplateMockModel(),
    createTemplate: async () => scheduleTemplateMockModel(),
    renameTemplate: async () => scheduleTemplateMockModel(),
    deleteTemplate: async () => undefined,
    applyTemplate: async () => ({
      status: "applied",
      mode: "overwrite",
      applied_shift_count: 0,
      converted_open_count: 0,
      session: scheduleSessionMockModel(),
    }),
    previewAutoFill: async () => ({
      status: "review_ready",
      workspace_id: resolvedContext.workspace.id,
      session_id: scheduleSessionMockModel().id,
      session_revision: 1,
      fingerprint: "c".repeat(64),
      proposals: [],
      unfilled: [],
    }),
    applyAutoFill: async () => ({
      status: "applied",
      applied: [],
      rejected: [],
      session: scheduleSessionMockModel(),
    }),
    previewExport: async () => scheduleExportPreviewMockModel(),
    listExportPresets: async () => ({ presets: [] }),
    createExportPreset: async (input) => ({
      id: "89000000-0000-4000-8000-000000000001",
      workspace_id: input.workspaceId,
      name: input.name,
      settings: input.settings,
      created_by: input.actorUserId,
      updated_at: "2026-08-17T12:00:00.000Z",
    }),
    deleteExportPreset: async () => undefined,
    ...overrides,
  };
}

function scheduleTemplateMockModel() {
  return {
    template: {
      id: "88000000-0000-4000-8000-000000000002",
      workspace_id: resolvedContext.workspace.id,
      name: "Dinner template",
      revision: 1,
      shift_count: 0,
      open_slot_count: 0,
      created_by_name: "Local Owner",
      updated_at: "2026-08-17T12:00:00.000Z",
    },
    shifts: [],
  };
}

function scheduleExportPreviewMockModel() {
  return {
    status: "export_ready" as const,
    workspace_id: resolvedContext.workspace.id,
    workspace_name: resolvedContext.workspace.name,
    week_start: "2026-08-17",
    source: { type: "published" as const },
    source_revision: 1,
    fingerprint: "d".repeat(64),
    locations: [],
    rows: [],
    summary: { shift_count: 0, employee_count: 0, scheduled_minutes: 0 },
  };
}

function schedulePublicationPreviewMock() {
  return {
    status: "publish_ready" as const,
    workspace_id: resolvedContext.workspace.id,
    week_start: "2026-08-17",
    draft_id: "85000000-0000-4000-8000-000000000001",
    draft_revision: 1,
    fingerprint: "a".repeat(64),
    locations: [
      {
        location_id: "11000000-0000-4000-8000-000000000001",
        location_name: "Main Dining",
        active_publication_id: null,
        active_version: null,
        current_shift_count: 0,
        next_shift_count: 1,
        added: 1,
        updated: 0,
        removed: 0,
        unchanged: 0,
      },
    ],
    findings: [],
  };
}

function scheduleSessionMockModel() {
  return {
    id: "87000000-0000-4000-8000-000000000001",
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    week_start: "2026-08-17",
    source_kind: "published" as const,
    source_draft_id: null,
    source_revision: 0,
    holder_user_id: resolvedContext.userId,
    holder_name: "Local Owner",
    revision: 1,
    dirty: false,
    last_heartbeat: "2026-08-17T12:00:00.000Z",
    expires_at: "2026-08-17T12:04:00.000Z",
    shifts: [],
  };
}

function scheduleServiceMockModel() {
  return {
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    week_start: "2026-08-17",
    week_start_day: "monday" as const,
    locations: [],
    departments: [],
    jobs: [],
    shift_types: [],
    employees: [],
    shifts: [],
    closures: [],
  };
}

function onboardingServiceMock(
  overrides: Partial<EmployeeOnboardingService> = {},
): EmployeeOnboardingService {
  return {
    get: async () => ({
      case_id: "0e4e60ab-a80c-4f95-a70d-8c01ab3e9a33",
      workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      workspace_name: "Meyhouse",
      employee_id: "fe201916-aa0e-480b-9144-1e1c8da20a31",
      employee_name: "Test Employee",
      membership_id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
      membership_status: "pending_activation",
      case_status: "in_progress",
      revision: 1,
      progress_completed: 0,
      progress_total: 3,
      first_actionable_path: "/welcome/profile",
      ssn_status: { present: false, last_four: null },
      profile: null,
      availability: null,
      assignments: { locations: [], jobs: [] },
      requirements: [],
    }),
    saveProfile: async () => 2,
    saveSsn: async () => 2,
    saveAvailability: async () => 2,
    prepareDocumentUpload: async () => ({ path: "test", token: "test" }),
    confirmDocument: async () => 2,
    acknowledge: async () => 2,
    submit: async () => 2,
    getReview: async () => {
      throw new Error("not used");
    },
    getDocumentDownload: async () => {
      throw new Error("not used");
    },
    review: async () => 2,
    ...overrides,
  };
}
