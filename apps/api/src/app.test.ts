import { describe, expect, it, vi } from "vitest";
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
  workspace: {
    id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    name: "Meyhouse",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
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

  it("runs scheduled schedule exports only with the cron secret", async () => {
    const send = vi.fn(async () => undefined);
    const app = buildApp({
      scheduleService: scheduleServiceMock({
        listScheduledExportCronCandidates: async () => ({
          schedules: [
            {
              id: "8a000000-0000-4000-8000-000000000001",
              workspace_id: resolvedContext.workspace.id,
              workspace_name: resolvedContext.workspace.name,
              created_by: resolvedContext.userId,
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
              location_ids: ["11000000-0000-4000-8000-000000000001"],
              day_of_week: 1,
              send_hour: 8,
              timezone: "America/Los_Angeles",
              last_sent_at: null,
              consecutive_failures: 0,
            },
          ],
        }),
      }),
      scheduleExportCron: {
        cronSecret: "cron-secret",
        delivery: { send },
        now: () => new Date("2026-08-17T15:00:00.000Z"),
      },
    });

    const denied = await app.inject({
      method: "POST",
      url: "/internal/cron/scheduled-exports",
      headers: { authorization: "Bearer wrong" },
    });
    expect(denied.statusCode).toBe(401);

    const response = await app.inject({
      method: "POST",
      url: "/internal/cron/scheduled-exports",
      headers: { authorization: "Bearer cron-secret" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      checked: 1,
      due: 1,
      sent: 1,
      failed: 0,
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "manager@example.test",
        attachment: expect.objectContaining({
          filename: "schedule-2026-08-17.csv",
        }),
      }),
    );
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

  it("resolves development bearer sessions only when development identity is enabled", async () => {
    const enabled = buildApp();
    const developmentResponse = await enabled.inject({
      method: "GET",
      url: "/v1/context",
      headers: { authorization: "Bearer development-owner-token" },
    });
    expect(developmentResponse.statusCode).toBe(200);
    expect(developmentResponse.json()).toMatchObject({
      workspace: { id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd" },
      membership: { role: "owner" },
      permissions: expect.arrayContaining(["schedule.manage"]),
    });

    const disabled = buildApp({
      allowDevelopmentIdentity: false,
      contextResolver: { resolve: async () => null },
    });
    const productionLikeResponse = await disabled.inject({
      method: "GET",
      url: "/v1/context",
      headers: { authorization: "Bearer development-owner-token" },
    });
    expect(productionLikeResponse.statusCode).toBe(401);
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

  it("forwards reference-style Line-up aliases from active workspace context", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleLineupService: {
        get: async (input: Parameters<ScheduleLineupService["get"]>[0]) => {
          calls.push({ kind: "get", input });
          return {
            workspace_id: resolvedContext.workspace.id,
            date: input.date,
            source: "published" as const,
            locations: [],
            sections: [],
            jobs: [],
            shift_types: [],
            employees: [],
          };
        },
        saveSection: async (
          input: Parameters<ScheduleLineupService["saveSection"]>[0],
        ) => {
          calls.push({ kind: "section", input });
          return {
            id: "96000000-0000-4000-8000-000000000001",
            workspace_id: resolvedContext.workspace.id,
            name: input.section.name,
            color: input.section.color,
            sort_order: input.section.sort_order,
            revision: 1,
          };
        },
        previewShare: async (
          input: Parameters<ScheduleLineupService["previewShare"]>[0],
        ) => {
          calls.push({ kind: "share-preview", input });
          return {
            status: "share_ready",
            workspace_id: resolvedContext.workspace.id,
            date: input.date,
            fingerprint: "b".repeat(64),
            locations: [],
          };
        },
        moveEntry: async (
          input: Parameters<ScheduleLineupService["moveEntry"]>[0],
        ) => {
          calls.push({ kind: "move", input });
          return {
            status: "saved",
            lineup_id: "97000000-0000-4000-8000-000000000001",
            lineup_revision: 2,
            entry_id: input.move.source_entry_id,
            entry_revision: 2,
          };
        },
      } as unknown as ScheduleLineupService,
    });

    const read = await app.inject({
      method: "GET",
      url: "/schedule/lineups?date=2026-08-17&location_ids=11000000-0000-4000-8000-000000000001&shift_type_ids=55000000-0000-4000-8000-000000000001",
      headers: { authorization: "Bearer valid-token" },
    });
    const section = await app.inject({
      method: "POST",
      url: "/schedule/lineups/sections",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        expected_revision: null,
        section: { name: "Expo", color: "#336699", sort_order: 20 },
      },
    });
    const share = await app.inject({
      method: "POST",
      url: "/schedule/lineups/share-preview",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        date: "2026-08-17",
        location_ids: ["11000000-0000-4000-8000-000000000001"],
      },
    });
    const move = await app.inject({
      method: "POST",
      url: "/schedule/lineups/entries/move",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        source_entry_id: "98000000-0000-4000-8000-000000000001",
        target_location_id: "11000000-0000-4000-8000-000000000001",
        target_date: "2026-08-17",
        target_section_id: "96000000-0000-4000-8000-000000000001",
        display_order: 3,
      },
    });

    expect(read.statusCode).toBe(200);
    expect(section.statusCode).toBe(201);
    expect(share.statusCode).toBe(200);
    expect(move.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        kind: "get",
        input: {
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          date: "2026-08-17",
          locationIds: ["11000000-0000-4000-8000-000000000001"],
          shiftTypeIds: ["55000000-0000-4000-8000-000000000001"],
        },
      },
      {
        kind: "section",
        input: {
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          sectionId: null,
          expectedRevision: null,
          section: { name: "Expo", color: "#336699", sort_order: 20 },
        },
      },
      {
        kind: "share-preview",
        input: {
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          date: "2026-08-17",
          locationIds: ["11000000-0000-4000-8000-000000000001"],
        },
      },
      {
        kind: "move",
        input: {
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          move: {
            source_entry_id: "98000000-0000-4000-8000-000000000001",
            target_location_id: "11000000-0000-4000-8000-000000000001",
            target_date: "2026-08-17",
            target_section_id: "96000000-0000-4000-8000-000000000001",
            display_order: 3,
          },
        },
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

  it("forwards reference-style Schedule Requests aliases from active workspace context", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleRequestsService: {
        get: async (input: Parameters<ScheduleRequestsService["get"]>[0]) => {
          calls.push({ kind: "get", input });
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
        markTimeOffViewed: async (
          input: Parameters<ScheduleRequestsService["markTimeOffViewed"]>[0],
        ) => {
          calls.push({ kind: "viewed", input });
          return { status: "viewed", request_id: input.requestId, revision: 3 };
        },
        resolveShiftChange: async (
          input: Parameters<ScheduleRequestsService["resolveShiftChange"]>[0],
        ) => {
          calls.push({ kind: "shift-decision", input });
          return {
            status: "approved",
            request_id: input.requestId,
            revision: 4,
          };
        },
      } as unknown as ScheduleRequestsService,
    });
    const requestId = "97200000-0000-4000-8000-000000000001";

    const read = await app.inject({
      method: "GET",
      url: "/schedule/requests?time_off_queue=closed&shift_queue=history&search=alex&limit=25",
      headers: { authorization: "Bearer valid-token" },
    });
    const viewed = await app.inject({
      method: "POST",
      url: `/schedule/requests/time-off/${requestId}/viewed`,
      headers: { authorization: "Bearer valid-token" },
    });
    const decision = await app.inject({
      method: "POST",
      url: `/schedule/requests/shift-changes/${requestId}/decision`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        expected_revision: 3,
        action: "approve",
        note: "Coverage approved.",
      },
    });

    expect(read.statusCode).toBe(200);
    expect(viewed.statusCode).toBe(200);
    expect(decision.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        kind: "get",
        input: {
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          timeOffQueue: "closed",
          shiftQueue: "history",
          locationId: null,
          search: "alex",
          timeOffCursor: null,
          shiftCursor: null,
          limit: 25,
        },
      },
      {
        kind: "viewed",
        input: {
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          requestId,
        },
      },
      {
        kind: "shift-decision",
        input: {
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          requestId,
          decision: {
            expected_revision: 3,
            action: "approve",
            note: "Coverage approved.",
          },
        },
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
            developmentUrl: "http://127.0.0.1:5555/accept-invite?token=test",
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
      payload: {
        email: "employee@example.test",
        roleId: "cb8b3ca2-bdaa-460b-9ae8-ef6b8c049226",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(prepared).toHaveLength(1);
    expect(prepared[0]).toMatchObject({
      roleId: "cb8b3ca2-bdaa-460b-9ae8-ef6b8c049226",
    });

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

  it("serves reference-style Schedule reads from active workspace context", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        getReadModel: async (actorUserId, workspaceId, date) => {
          calls.push({ actorUserId, workspaceId, date });
          return scheduleServiceMockModel();
        },
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: "/schedule/reference?week_start=2026-08-17",
      headers: { authorization: "Bearer owner-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        date: "2026-08-17",
      },
    ]);
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

  it("forwards Schedule shift label selections", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        mutateShift: async (input) => {
          calls.push(input);
          return scheduleSessionMockModel();
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule/edit-sessions/87000000-0000-4000-8000-000000000001/shifts",
      headers: {
        authorization: "Bearer owner-token",
        "idempotency-key": "89000000-0000-4000-8000-000000000001",
      },
      payload: {
        expected_session_revision: 3,
        shift: {
          location_id: "11000000-0000-4000-8000-000000000001",
          employee_id: null,
          job_id: "33000000-0000-4000-8000-000000000001",
          shift_type_id: null,
          scheduled_date: "2026-08-17",
          start_time: "09:00",
          end_time: "17:00",
          label_ids: ["50000000-0000-4000-8000-000000000001"],
          label_names: ["Training"],
          note: "",
        },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        shift: expect.objectContaining({
          label_ids: ["50000000-0000-4000-8000-000000000001"],
          label_names: ["Training"],
        }),
      }),
    );
  });

  it("forwards staged live shift restore mutations", async () => {
    const calls: Array<{
      operation: string;
      expectedSessionRevision: number;
      expectedShiftRevision: number | undefined;
      shiftId: string;
    }> = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        mutateShift: async (input) => {
          calls.push({
            operation: input.operation,
            expectedSessionRevision: input.expectedSessionRevision,
            expectedShiftRevision: input.expectedShiftRevision,
            shiftId: input.shiftId,
          });
          return scheduleSessionMockModel();
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule/edit-sessions/87000000-0000-4000-8000-000000000001/shifts/66000000-0000-4000-8000-000000000001/restore",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        expected_session_revision: 4,
        expected_shift_revision: 2,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        operation: "restore",
        expectedSessionRevision: 4,
        expectedShiftRevision: 2,
        shiftId: "66000000-0000-4000-8000-000000000001",
      },
    ]);
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

  it("forwards Schedule retroactive save acknowledgements and preserves past-edit findings", async () => {
    const calls: Array<boolean | undefined> = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        saveSession: async (input) => {
          calls.push(input.acknowledgePastEdits);
          throw new Error(
            JSON.stringify({
              status: "past_shift_edit_requires_ack",
              past_edits: [
                {
                  op_type: "update",
                  shift_id: "66000000-0000-4000-8000-000000000001",
                  scheduled_date: "2026-08-17",
                  location_name: "Main Dining",
                  employee_name: "Alex Rivera",
                  reason: "shift_started",
                  severity: "warning",
                },
              ],
              past_edit_messages: [
                "Alex Rivera already worked Main Dining on 2026-08-17.",
              ],
            }),
          );
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
        acknowledge_past_edits: true,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(calls).toEqual([true]);
    expect(response.json()).toMatchObject({
      status: "past_shift_edit_requires_ack",
      past_edits: [
        {
          reason: "shift_started",
          severity: "warning",
        },
      ],
      past_edit_messages: [
        "Alex Rivera already worked Main Dining on 2026-08-17.",
      ],
    });
  });

  it("maps blocked Schedule retroactive saves to forbidden with findings intact", async () => {
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        saveSession: async () => {
          throw new Error(
            JSON.stringify({
              status: "past_edit_blocked",
              past_edits: [
                {
                  op_type: "delete",
                  shift_id: "66000000-0000-4000-8000-000000000001",
                  scheduled_date: "2026-08-17",
                  location_name: "Main Dining",
                  employee_name: "Alex Rivera",
                  reason: "time_entry_exists",
                  severity: "blocked",
                },
              ],
              past_edit_messages: [
                "Alex Rivera already has a time entry for Main Dining on 2026-08-17.",
              ],
            }),
          );
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/schedule/drafts/save",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        session_id: "87000000-0000-4000-8000-000000000001",
        expected_session_revision: 2,
        name: "Opening plan",
        draft_id: null,
        expected_draft_revision: null,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      status: "past_edit_blocked",
      past_edits: [
        {
          reason: "time_entry_exists",
          severity: "blocked",
        },
      ],
    });
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

  it("forwards reference-style Schedule publish preview from active workspace context", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        previewPublication: async (input) => {
          calls.push(input);
          return schedulePublicationPreviewMock();
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/schedule/publish-preview",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        draft_id: "85000000-0000-4000-8000-000000000001",
        location_ids: ["11000000-0000-4000-8000-000000000001"],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        draftId: "85000000-0000-4000-8000-000000000001",
        locationIds: ["11000000-0000-4000-8000-000000000001"],
      },
    ]);
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

  it("forwards canonical Schedule publish notification recipients", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        publish: async (input) => {
          calls.push(input);
          return {
            status: "published",
            workspace_id: resolvedContext.workspace.id,
            week_start: "2026-08-17",
            draft_id: input.draftId,
            draft_revision: input.expectedDraftRevision,
            location_ids: input.locationIds,
            publication_ids: ["86000000-0000-4000-8000-000000000001"],
            published_shift_count: 1,
            published_at: "2026-08-17T12:00:00.000Z",
            notification_count: input.notifyEmployeeIds?.length ?? 0,
          };
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule/publications",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        draft_id: "85000000-0000-4000-8000-000000000001",
        location_ids: ["11000000-0000-4000-8000-000000000001"],
        expected_draft_revision: 1,
        fingerprint: "a".repeat(64),
        notify_employee_ids: ["15000000-0000-4000-8000-000000000001"],
        overrides: [
          {
            finding_id: "availability-1234567890abcdef",
            reason: "Employee confirmed availability for this service.",
          },
        ],
        preflight_ack: {
          fingerprint: "a".repeat(64),
          decisions: [
            {
              finding_id: "availability-1234567890abcdef",
              reason: "Employee confirmed availability for this service.",
            },
          ],
        },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().notification_count).toBe(1);
    expect(calls).toEqual([
      expect.objectContaining({
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        draftId: "85000000-0000-4000-8000-000000000001",
        locationIds: ["11000000-0000-4000-8000-000000000001"],
        notifyEmployeeIds: ["15000000-0000-4000-8000-000000000001"],
        preflightAck: {
          fingerprint: "a".repeat(64),
          decisions: [
            {
              finding_id: "availability-1234567890abcdef",
              reason: "Employee confirmed availability for this service.",
            },
          ],
        },
      }),
    ]);
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

  it("returns structured Schedule publish recovery results as conflicts", async () => {
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        publish: async () => ({
          status: "schedule_conflicts",
          schedule_conflicts: [
            {
              employee_id: "51000000-0000-4000-8000-000000000001",
              employee_name: "Alex Rivera",
              date: "2026-08-17",
              reason: "time_overlap",
              first: {
                shift_id: "71000000-0000-4000-8000-000000000001",
                time_range: "4:00 PM - 7:00 PM",
              },
              second: {
                shift_id: "71000000-0000-4000-8000-000000000002",
                time_range: "6:00 PM - 10:00 PM",
              },
            },
          ],
        }),
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/schedule/publications",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        draft_id: "85000000-0000-4000-8000-000000000001",
        location_ids: ["11000000-0000-4000-8000-000000000001"],
        expected_draft_revision: 1,
        fingerprint: "a".repeat(64),
        overrides: [],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      status: "schedule_conflicts",
      schedule_conflicts: [
        expect.objectContaining({
          employee_name: "Alex Rivera",
          date: "2026-08-17",
        }),
      ],
    });
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

  it("forwards reference-style Schedule export and shift writes from active workspace context", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        previewExport: async (input) => {
          calls.push({ kind: "export", input });
          return scheduleExportPreviewMockModel();
        },
        mutateShift: async (input) => {
          calls.push({ kind: "shift", input });
          return scheduleSessionMockModel();
        },
      }),
    });
    const exportResponse = await app.inject({
      method: "POST",
      url: "/schedule/export/preview",
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
    const shiftResponse = await app.inject({
      method: "POST",
      url: "/shifts",
      headers: {
        authorization: "Bearer owner-token",
        "idempotency-key": "89000000-0000-4000-8000-000000000001",
      },
      payload: {
        session_id: "87000000-0000-4000-8000-000000000001",
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
      },
    });

    expect(exportResponse.statusCode).toBe(200);
    expect(shiftResponse.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        kind: "export",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          weekStart: "2026-08-17",
          sourceType: "published",
          sourceDraftId: null,
          locationIds: ["11000000-0000-4000-8000-000000000001"],
        }),
      },
      {
        kind: "shift",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          sessionId: "87000000-0000-4000-8000-000000000001",
          expectedSessionRevision: 3,
          operation: "create",
          idempotencyKey: "89000000-0000-4000-8000-000000000001",
        }),
      },
    ]);
  });

  it("forwards reference-style Schedule save, discard, template, html preview, and restore aliases", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        saveSession: async (input) => {
          calls.push({ kind: "save", input });
          return {
            id: "85000000-0000-4000-8000-000000000001",
            workspace_id: resolvedContext.workspace.id,
            name: "Dinner draft",
            week_start: "2026-08-17",
            revision: 2,
            created_by: resolvedContext.userId,
            updated_by: resolvedContext.userId,
            created_at: "2026-08-17T12:00:00.000Z",
            updated_at: "2026-08-17T12:00:00.000Z",
          };
        },
        discardSession: async (actorUserId, workspaceId, sessionId) => {
          calls.push({ kind: "discard", actorUserId, workspaceId, sessionId });
        },
        deleteDraft: async (actorUserId, workspaceId, draftId) => {
          calls.push({
            kind: "delete-draft",
            actorUserId,
            workspaceId,
            draftId,
          });
          return { status: "deleted", draft_id: draftId };
        },
        listWeeklyShifts: async (input) => {
          calls.push({ kind: "weekly-shifts", input });
          return { shifts: [scheduleShiftMockModel()], ghost_shifts: [] };
        },
        previewPublication: async (input) => {
          calls.push({ kind: "legacy-publish-preview", input });
          return schedulePublicationPreviewMock();
        },
        publish: async (input) => {
          calls.push({ kind: "legacy-publish", input });
          return {
            status: "published",
            workspace_id: resolvedContext.workspace.id,
            week_start: "2026-08-17",
            draft_id: input.draftId,
            draft_revision: input.expectedDraftRevision,
            location_ids: input.locationIds,
            publication_ids: ["86000000-0000-4000-8000-000000000001"],
            published_shift_count: 1,
            published_at: "2026-08-17T12:00:00.000Z",
          };
        },
        listDraftAvailabilityConflicts: async (
          actorUserId,
          workspaceId,
          draftId,
          weekStart,
        ) => {
          calls.push({
            kind: "availability-conflicts",
            actorUserId,
            workspaceId,
            draftId,
            weekStart,
          });
          return { status: "ok", conflicts: [], fingerprint: "none" };
        },
        getPublicationStatus: async (actorUserId, workspaceId, weekStart) => {
          calls.push({
            kind: "publication-status",
            actorUserId,
            workspaceId,
            weekStart,
          });
          return schedulePublicationStatusMockModel();
        },
        listPendingOps: async (input) => {
          calls.push({ kind: "list-pending-ops", input });
          return { pending_ops: [schedulePendingOpMockModel()] };
        },
        addPendingOp: async (input) => {
          calls.push({ kind: "add-pending-op", input });
          return {
            status: "ok",
            op_id: "81000000-0000-4000-8000-000000000001",
          };
        },
        updatePendingOp: async (input) => {
          calls.push({ kind: "update-pending-op", input });
          return { status: "ok", op_id: input.opId };
        },
        removePendingOp: async (input) => {
          calls.push({ kind: "remove-pending-op", input });
          return { status: "ok", op_id: input.opId };
        },
        takeover: async (actorUserId, workspaceId, sessionId) => {
          calls.push({ kind: "takeover", actorUserId, workspaceId, sessionId });
          return { status: "acquired", session: scheduleSessionMockModel() };
        },
        acquireSession: async (input) => {
          calls.push({
            kind:
              input.sourceKind === "draft"
                ? "draft-auto-fill-session"
                : "materialize-live-draft",
            input,
          });
          return { status: "acquired", session: scheduleSessionMockModel() };
        },
        getTemplate: async (actorUserId, workspaceId, templateId) => {
          calls.push({
            kind: "template",
            actorUserId,
            workspaceId,
            templateId,
          });
          return scheduleTemplateMockModel();
        },
        previewUnpublish: async (input) => {
          calls.push({ kind: "unpublish-preview", input });
          return {
            status: "unpublish_ready",
            workspace_id: resolvedContext.workspace.id,
            week_start: "2026-08-17",
            locations: [],
            fingerprint: "b".repeat(64),
          };
        },
        applyTemplate: async (input) => {
          calls.push({ kind: "apply-template", input });
          return {
            status: "applied",
            mode: input.mode,
            applied_shift_count: 0,
            converted_open_count: 0,
            session: scheduleSessionMockModel(),
          };
        },
        previewAutoFill: async (actorUserId, workspaceId, sessionId) => {
          calls.push({
            kind: "auto-fill-preview",
            actorUserId,
            workspaceId,
            sessionId,
          });
          return {
            status: "review_ready",
            workspace_id: resolvedContext.workspace.id,
            session_id: sessionId,
            session_revision: 1,
            fingerprint: "c".repeat(64),
            proposals: [],
            unfilled: [],
          };
        },
        applyAutoFill: async (input) => {
          calls.push({ kind: "auto-fill-apply", input });
          return {
            status: "applied",
            applied: [],
            rejected: [],
            session: scheduleSessionMockModel(),
          };
        },
        bulkDeleteShifts: async (input) => {
          calls.push({ kind: "bulk-delete", input });
          return {
            deleted_count: input.shiftIds.length,
            session: scheduleSessionMockModel(),
          };
        },
        previewExport: async (input) => {
          calls.push({ kind: "preview-html", input });
          return scheduleExportPreviewMockModel();
        },
        updateExportPreset: async (input) => {
          calls.push({ kind: "update-preset", input });
          return {
            id: input.presetId,
            workspace_id: input.workspaceId,
            name: input.name,
            settings: input.settings,
            created_by: input.actorUserId,
            updated_at: "2026-08-17T12:00:00.000Z",
          };
        },
        listExportSchedules: async (actorUserId, workspaceId) => {
          calls.push({
            kind: "list-export-schedules",
            actorUserId,
            workspaceId,
          });
          return { schedules: [scheduleExportScheduleMockModel()] };
        },
        createExportSchedule: async (input) => {
          calls.push({ kind: "create-export-schedule", input });
          return {
            ...scheduleExportScheduleMockModel(),
            workspace_id: input.workspaceId,
            name: input.schedule.name,
            preset_id: input.schedule.preset_id,
            recipients: input.schedule.recipients,
            location_ids: input.schedule.location_ids,
            day_of_week: input.schedule.day_of_week,
            send_hour: input.schedule.send_hour,
            timezone: input.schedule.timezone,
          };
        },
        updateExportSchedule: async (input) => {
          calls.push({ kind: "update-export-schedule", input });
          return {
            ...scheduleExportScheduleMockModel(),
            id: input.scheduleId,
            enabled: input.schedule.enabled ?? true,
          };
        },
        deleteExportSchedule: async (actorUserId, workspaceId, scheduleId) => {
          calls.push({
            kind: "delete-export-schedule",
            actorUserId,
            workspaceId,
            scheduleId,
          });
        },
        mutateShift: async (input) => {
          calls.push({ kind: "restore", input });
          return scheduleSessionMockModel();
        },
      }),
    });

    const save = await app.inject({
      method: "POST",
      url: "/schedule/drafts/save",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        session_id: "87000000-0000-4000-8000-000000000001",
        expected_session_revision: 1,
        name: "Dinner draft",
        draft_id: null,
        expected_draft_revision: null,
      },
    });
    const discard = await app.inject({
      method: "POST",
      url: "/schedule/edit-session/discard",
      headers: { authorization: "Bearer owner-token" },
      payload: { session_id: "87000000-0000-4000-8000-000000000001" },
    });
    const deleteDraft = await app.inject({
      method: "DELETE",
      url: "/schedule/drafts/85000000-0000-4000-8000-000000000001",
      headers: { authorization: "Bearer owner-token" },
    });
    const weeklyShifts = await app.inject({
      method: "GET",
      url: "/schedule/shifts?week_start=2026-08-17&location_ids=11000000-0000-4000-8000-000000000001&location_ids=11000000-0000-4000-8000-000000000002&draft_id=85000000-0000-4000-8000-000000000001&include_live=true",
      headers: { authorization: "Bearer owner-token" },
    });
    const legacyShifts = await app.inject({
      method: "GET",
      url: "/shifts?week_start=2026-08-17&location_ids=11000000-0000-4000-8000-000000000001",
      headers: { authorization: "Bearer owner-token" },
    });
    const availabilityConflicts = await app.inject({
      method: "GET",
      url: "/schedule/drafts/85000000-0000-4000-8000-000000000001/availability-conflicts?week_start=2026-08-17",
      headers: { authorization: "Bearer owner-token" },
    });
    const publicationStatus = await app.inject({
      method: "GET",
      url: "/schedule/publication-status?week_start=2026-08-17",
      headers: { authorization: "Bearer owner-token" },
    });
    const pendingOps = await app.inject({
      method: "GET",
      url: "/schedule/pending-ops?week_start=2026-08-17&location_ids=11000000-0000-4000-8000-000000000001&draft_id=85000000-0000-4000-8000-000000000001",
      headers: { authorization: "Bearer owner-token" },
    });
    const addPendingOp = await app.inject({
      method: "POST",
      url: "/schedule/pending-ops",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        lock_id: "87000000-0000-4000-8000-000000000001",
        op_type: "update",
        target_shift_id: "81000000-0000-4000-8000-000000000001",
        payload: {
          scheduled_date: "2026-08-17",
          start_time: "17:00",
          end_time: "21:00",
          location_id: "11000000-0000-4000-8000-000000000001",
          job_id: "33000000-0000-4000-8000-000000000001",
        },
      },
    });
    const updatePendingOp = await app.inject({
      method: "PATCH",
      url: "/schedule/pending-ops/81000000-0000-4000-8000-000000000001",
      headers: { authorization: "Bearer owner-token" },
      payload: { payload: { note: "Updated" } },
    });
    const removePendingOp = await app.inject({
      method: "DELETE",
      url: "/schedule/pending-ops/81000000-0000-4000-8000-000000000001",
      headers: { authorization: "Bearer owner-token" },
    });
    const takeover = await app.inject({
      method: "POST",
      url: "/schedule/edit-lock/takeover",
      headers: { authorization: "Bearer owner-token" },
      payload: { session_id: "87000000-0000-4000-8000-000000000001" },
    });
    const materializeLiveDraft = await app.inject({
      method: "POST",
      url: "/schedule/edit-session/materialize-live-draft",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        week_start: "2026-08-17",
        location_ids: ["11000000-0000-4000-8000-000000000001"],
      },
    });
    const template = await app.inject({
      method: "GET",
      url: "/schedule/templates/88000000-0000-4000-8000-000000000002",
      headers: { authorization: "Bearer owner-token" },
    });
    const unpublishPreview = await app.inject({
      method: "POST",
      url: "/schedule/unpublish-preview",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        week_start: "2026-08-17",
        location_ids: ["11000000-0000-4000-8000-000000000001"],
      },
    });
    const applyTemplate = await app.inject({
      method: "POST",
      url: "/schedule/edit-sessions/87000000-0000-4000-8000-000000000001/apply-template",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        template_id: "88000000-0000-4000-8000-000000000002",
        mode: "overwrite",
        expected_session_revision: 2,
        department_keys: [
          "22000000-0000-4000-8000-000000000001",
          "__no_department__",
        ],
      },
    });
    const autoFillPreview = await app.inject({
      method: "POST",
      url: "/schedule/edit-sessions/87000000-0000-4000-8000-000000000001/auto-fill-preview",
      headers: { authorization: "Bearer owner-token" },
    });
    const autoFillApply = await app.inject({
      method: "POST",
      url: "/schedule/edit-sessions/87000000-0000-4000-8000-000000000001/auto-fill-apply",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        expected_session_revision: 2,
        fingerprint: "c".repeat(64),
        assignments: [],
      },
    });
    const draftAutoFillPreview = await app.inject({
      method: "POST",
      url: "/schedule/drafts/85000000-0000-4000-8000-000000000001/auto-fill/preview",
      headers: { authorization: "Bearer owner-token" },
      payload: { week_start: "2026-08-17" },
    });
    const draftAutoFillApply = await app.inject({
      method: "POST",
      url: "/schedule/drafts/85000000-0000-4000-8000-000000000001/auto-fill/apply",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        week_start: "2026-08-17",
        assignments: [
          {
            shift_id: "81000000-0000-4000-8000-000000000001",
            employee_id: "15000000-0000-4000-8000-000000000001",
          },
        ],
      },
    });
    const bulkDelete = await app.inject({
      method: "POST",
      url: "/shifts/bulk-delete",
      headers: { authorization: "Bearer owner-token" },
      payload: { ids: ["81000000-0000-4000-8000-000000000001"] },
    });
    const legacyPublish = await app.inject({
      method: "PATCH",
      url: "/shifts/publish",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        week_start: "2026-08-17",
        location_id: "11000000-0000-4000-8000-000000000001",
      },
    });
    const html = await app.inject({
      method: "POST",
      url: "/schedule/export/preview-html",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        week_start: "2026-08-17",
        source: { type: "published" },
        location_ids: ["11000000-0000-4000-8000-000000000001"],
        settings: {
          format: "print",
          layout: "weekly",
          time_format: "12h",
          include_unassigned: true,
          include_notes: true,
          include_scheduled_hours: true,
          csv_delimiter: ",",
        },
      },
    });
    const pdfExport = await app.inject({
      method: "POST",
      url: "/schedule/export",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        week_start: "2026-08-17",
        source: { type: "published" },
        location_ids: ["11000000-0000-4000-8000-000000000001"],
        settings: {
          format: "pdf",
          layout: "weekly",
          time_format: "12h",
          include_unassigned: true,
          include_notes: true,
          include_scheduled_hours: true,
          csv_delimiter: ",",
        },
      },
    });
    const updatePreset = await app.inject({
      method: "PATCH",
      url: "/schedule/export-presets/89000000-0000-4000-8000-000000000001",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        name: "Manager weekly print",
        settings: {
          format: "print",
          layout: "weekly",
          time_format: "12h",
          include_unassigned: true,
          include_notes: false,
          include_scheduled_hours: true,
          csv_delimiter: ",",
        },
      },
    });
    const listExportSchedules = await app.inject({
      method: "GET",
      url: "/schedule/export-schedules",
      headers: { authorization: "Bearer owner-token" },
    });
    const createExportSchedule = await app.inject({
      method: "POST",
      url: "/schedule/export-schedules",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        name: "Monday managers",
        preset_id: "89000000-0000-4000-8000-000000000001",
        recipients: ["manager@example.test"],
        location_ids: ["11000000-0000-4000-8000-000000000001"],
        day_of_week: 1,
        send_hour: 8,
        timezone: "America/Los_Angeles",
      },
    });
    const updateExportSchedule = await app.inject({
      method: "PATCH",
      url: "/schedule/export-schedules/8a000000-0000-4000-8000-000000000001",
      headers: { authorization: "Bearer owner-token" },
      payload: { enabled: false },
    });
    const deleteExportSchedule = await app.inject({
      method: "DELETE",
      url: "/schedule/export-schedules/8a000000-0000-4000-8000-000000000001",
      headers: { authorization: "Bearer owner-token" },
    });
    const restore = await app.inject({
      method: "PATCH",
      url: "/shifts/81000000-0000-4000-8000-000000000001/restore",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        session_id: "87000000-0000-4000-8000-000000000001",
        expected_session_revision: 4,
        expected_shift_revision: 2,
      },
    });

    expect(save.statusCode).toBe(200);
    expect(discard.statusCode).toBe(200);
    expect(deleteDraft.statusCode).toBe(200);
    expect(weeklyShifts.statusCode).toBe(200);
    expect(legacyShifts.statusCode).toBe(200);
    expect(availabilityConflicts.statusCode).toBe(200);
    expect(publicationStatus.statusCode).toBe(200);
    expect(pendingOps.statusCode).toBe(200);
    expect(addPendingOp.statusCode).toBe(201);
    expect(updatePendingOp.statusCode).toBe(200);
    expect(removePendingOp.statusCode).toBe(200);
    expect(takeover.statusCode).toBe(200);
    expect(materializeLiveDraft.statusCode).toBe(200);
    expect(template.statusCode).toBe(200);
    expect(unpublishPreview.statusCode).toBe(200);
    expect(applyTemplate.statusCode).toBe(200);
    expect(autoFillPreview.statusCode).toBe(200);
    expect(autoFillApply.statusCode).toBe(200);
    expect(draftAutoFillPreview.statusCode).toBe(200);
    expect(draftAutoFillApply.statusCode).toBe(200);
    expect(bulkDelete.statusCode).toBe(200);
    expect(legacyPublish.statusCode).toBe(200);
    expect(legacyPublish.json()).toEqual({ published_count: 1 });
    expect(html.statusCode).toBe(200);
    expect(html.json().html).toContain("<!doctype html>");
    expect(pdfExport.statusCode).toBe(200);
    expect(pdfExport.headers["content-type"]).toContain("application/pdf");
    expect(pdfExport.rawPayload.subarray(0, 8).toString("utf8")).toBe(
      "%PDF-1.4",
    );
    expect(updatePreset.statusCode).toBe(200);
    expect(listExportSchedules.statusCode).toBe(200);
    expect(createExportSchedule.statusCode).toBe(201);
    expect(updateExportSchedule.statusCode).toBe(200);
    expect(deleteExportSchedule.statusCode).toBe(204);
    expect(restore.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        kind: "save",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          sessionId: "87000000-0000-4000-8000-000000000001",
          expectedSessionRevision: 1,
          name: "Dinner draft",
        }),
      },
      {
        kind: "discard",
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        sessionId: "87000000-0000-4000-8000-000000000001",
      },
      {
        kind: "delete-draft",
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        draftId: "85000000-0000-4000-8000-000000000001",
      },
      {
        kind: "weekly-shifts",
        input: {
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          weekStart: "2026-08-17",
          locationIds: [
            "11000000-0000-4000-8000-000000000001",
            "11000000-0000-4000-8000-000000000002",
          ],
          draftId: "85000000-0000-4000-8000-000000000001",
          includeLive: true,
        },
      },
      {
        kind: "weekly-shifts",
        input: {
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          weekStart: "2026-08-17",
          locationIds: ["11000000-0000-4000-8000-000000000001"],
          draftId: null,
          includeLive: false,
        },
      },
      {
        kind: "availability-conflicts",
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        draftId: "85000000-0000-4000-8000-000000000001",
        weekStart: "2026-08-17",
      },
      {
        kind: "publication-status",
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        weekStart: "2026-08-17",
      },
      {
        kind: "list-pending-ops",
        input: {
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          weekStart: "2026-08-17",
          locationIds: ["11000000-0000-4000-8000-000000000001"],
          draftId: "85000000-0000-4000-8000-000000000001",
        },
      },
      {
        kind: "add-pending-op",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          pendingOp: expect.objectContaining({
            lock_id: "87000000-0000-4000-8000-000000000001",
            op_type: "update",
          }),
        }),
      },
      {
        kind: "update-pending-op",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          opId: "81000000-0000-4000-8000-000000000001",
        }),
      },
      {
        kind: "remove-pending-op",
        input: {
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          opId: "81000000-0000-4000-8000-000000000001",
        },
      },
      {
        kind: "takeover",
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        sessionId: "87000000-0000-4000-8000-000000000001",
      },
      {
        kind: "materialize-live-draft",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          weekStart: "2026-08-17",
          sourceKind: "published",
          sourceDraftId: null,
        }),
      },
      {
        kind: "template",
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        templateId: "88000000-0000-4000-8000-000000000002",
      },
      {
        kind: "unpublish-preview",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          weekStart: "2026-08-17",
          locationIds: ["11000000-0000-4000-8000-000000000001"],
        }),
      },
      {
        kind: "apply-template",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          sessionId: "87000000-0000-4000-8000-000000000001",
          expectedSessionRevision: 2,
          templateId: "88000000-0000-4000-8000-000000000002",
          mode: "overwrite",
          departmentKeys: [
            "22000000-0000-4000-8000-000000000001",
            "__no_department__",
          ],
        }),
      },
      {
        kind: "auto-fill-preview",
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        sessionId: "87000000-0000-4000-8000-000000000001",
      },
      {
        kind: "auto-fill-apply",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          sessionId: "87000000-0000-4000-8000-000000000001",
          expectedSessionRevision: 2,
          fingerprint: "c".repeat(64),
          assignments: [],
        }),
      },
      {
        kind: "draft-auto-fill-session",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          weekStart: "2026-08-17",
          sourceKind: "draft",
          sourceDraftId: "85000000-0000-4000-8000-000000000001",
        }),
      },
      {
        kind: "auto-fill-preview",
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        sessionId: "87000000-0000-4000-8000-000000000001",
      },
      {
        kind: "discard",
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        sessionId: "87000000-0000-4000-8000-000000000001",
      },
      {
        kind: "draft-auto-fill-session",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          weekStart: "2026-08-17",
          sourceKind: "draft",
          sourceDraftId: "85000000-0000-4000-8000-000000000001",
        }),
      },
      {
        kind: "auto-fill-preview",
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        sessionId: "87000000-0000-4000-8000-000000000001",
      },
      {
        kind: "auto-fill-apply",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          sessionId: "87000000-0000-4000-8000-000000000001",
          expectedSessionRevision: 1,
          fingerprint: "c".repeat(64),
          assignments: [
            {
              shift_id: "81000000-0000-4000-8000-000000000001",
              employee_id: "15000000-0000-4000-8000-000000000001",
            },
          ],
        }),
      },
      {
        kind: "save",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          sessionId: "87000000-0000-4000-8000-000000000001",
          expectedSessionRevision: 1,
          name: "Manager draft",
          draftId: "85000000-0000-4000-8000-000000000001",
          expectedDraftRevision: 1,
        }),
      },
      {
        kind: "bulk-delete",
        input: {
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          shiftIds: ["81000000-0000-4000-8000-000000000001"],
        },
      },
      {
        kind: "legacy-publish-preview",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          draftId: "85000000-0000-4000-8000-000000000001",
          locationIds: ["11000000-0000-4000-8000-000000000001"],
        }),
      },
      {
        kind: "legacy-publish",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          draftId: "85000000-0000-4000-8000-000000000001",
          locationIds: ["11000000-0000-4000-8000-000000000001"],
          expectedDraftRevision: 1,
          fingerprint: "a".repeat(64),
          overrides: [],
        }),
      },
      {
        kind: "preview-html",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          weekStart: "2026-08-17",
        }),
      },
      {
        kind: "preview-html",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          weekStart: "2026-08-17",
          sourceType: "published",
          sourceDraftId: null,
          locationIds: ["11000000-0000-4000-8000-000000000001"],
        }),
      },
      {
        kind: "update-preset",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          presetId: "89000000-0000-4000-8000-000000000001",
          name: "Manager weekly print",
        }),
      },
      {
        kind: "list-export-schedules",
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
      },
      {
        kind: "create-export-schedule",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          schedule: expect.objectContaining({
            name: "Monday managers",
            preset_id: "89000000-0000-4000-8000-000000000001",
            recipients: ["manager@example.test"],
            day_of_week: 1,
            send_hour: 8,
            timezone: "America/Los_Angeles",
          }),
        }),
      },
      {
        kind: "update-export-schedule",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          scheduleId: "8a000000-0000-4000-8000-000000000001",
          schedule: { enabled: false },
        }),
      },
      {
        kind: "delete-export-schedule",
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        scheduleId: "8a000000-0000-4000-8000-000000000001",
      },
      {
        kind: "restore",
        input: expect.objectContaining({
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          sessionId: "87000000-0000-4000-8000-000000000001",
          expectedSessionRevision: 4,
          expectedShiftRevision: 2,
          operation: "restore",
          shiftId: "81000000-0000-4000-8000-000000000001",
        }),
      },
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
    listDrafts: async () => ({
      drafts: [
        {
          id: "85000000-0000-4000-8000-000000000001",
          workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
          week_start: "2026-08-17",
          name: "Manager draft",
          revision: 1,
          created_by: resolvedContext.userId,
          updated_by: resolvedContext.userId,
          created_at: "2026-08-17T12:00:00.000Z",
          updated_at: "2026-08-17T12:00:00.000Z",
        },
      ],
    }),
    listWeeklyShifts: async () => ({
      shifts: [scheduleShiftMockModel()],
      ghost_shifts: [],
    }),
    acquireSession: async () => ({
      status: "conflict",
      holder_name: "Another manager",
      last_heartbeat: "2026-08-17T12:00:00.000Z",
      expires_at: "2026-08-17T12:04:00.000Z",
    }),
    heartbeat: async () => scheduleSessionMockModel(),
    takeover: async () => ({
      status: "resumed",
      session: scheduleSessionMockModel(),
    }),
    mutateShift: async () => scheduleSessionMockModel(),
    bulkDeleteShifts: async (_input) => ({
      deleted_count: 1,
      session: scheduleSessionMockModel(),
    }),
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
    deleteDraft: async (_actorUserId, _workspaceId, draftId) => ({
      status: "deleted",
      draft_id: draftId,
    }),
    listDraftAvailabilityConflicts: async () => ({
      status: "ok",
      conflicts: [],
      fingerprint: "none",
    }),
    listPendingOps: async () => ({
      pending_ops: [schedulePendingOpMockModel()],
    }),
    addPendingOp: async () => ({
      status: "ok",
      op_id: "81000000-0000-4000-8000-000000000001",
    }),
    updatePendingOp: async (_input) => ({
      status: "ok",
      op_id: _input.opId,
    }),
    removePendingOp: async (_input) => ({
      status: "ok",
      op_id: _input.opId,
    }),
    getPublicationStatus: async () => schedulePublicationStatusMockModel(),
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
      kept_worked_count: 0,
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
    updateExportPreset: async (input) => ({
      id: input.presetId,
      workspace_id: input.workspaceId,
      name: input.name,
      settings: input.settings,
      created_by: input.actorUserId,
      updated_at: "2026-08-17T12:00:00.000Z",
    }),
    deleteExportPreset: async () => undefined,
    listExportSchedules: async () => ({
      schedules: [scheduleExportScheduleMockModel()],
    }),
    createExportSchedule: async (input) => ({
      ...scheduleExportScheduleMockModel(),
      workspace_id: input.workspaceId,
      name: input.schedule.name,
      preset_id: input.schedule.preset_id,
      recipients: input.schedule.recipients,
      location_ids: input.schedule.location_ids,
      day_of_week: input.schedule.day_of_week,
      send_hour: input.schedule.send_hour,
      timezone: input.schedule.timezone,
    }),
    updateExportSchedule: async (input) => ({
      ...scheduleExportScheduleMockModel(),
      id: input.scheduleId,
      workspace_id: input.workspaceId,
      enabled: input.schedule.enabled ?? true,
    }),
    deleteExportSchedule: async () => undefined,
    listRecentExports: async () => ({
      events: [scheduleRecentExportEventMockModel()],
    }),
    recordExport: async (input) => ({
      ...scheduleRecentExportEventMockModel(),
      workspace_id: input.workspaceId,
      actor_user_id: input.actorUserId,
      surface: input.surface,
      format: input.format,
      params: input.params,
    }),
    listScheduledExportCronCandidates: async () => ({ schedules: [] }),
    recordScheduledExportSuccess: async (input) => ({
      ...scheduleExportScheduleMockModel(),
      workspace_id: input.workspaceId,
      id: input.scheduleId,
      last_sent_at: input.sentAt.toISOString(),
    }),
    recordScheduledExportFailure: async (input) => ({
      ...scheduleExportScheduleMockModel(),
      workspace_id: input.workspaceId,
      id: input.scheduleId,
      consecutive_failures: 1,
      last_error: input.error,
    }),
    ...overrides,
  };
}

function scheduleRecentExportEventMockModel() {
  return {
    id: "8b000000-0000-4000-8000-000000000001",
    workspace_id: resolvedContext.workspace.id,
    surface: "schedule",
    format: "csv",
    params: {
      week_start: "2026-08-17",
      layout: "weekly",
      location_ids: ["11000000-0000-4000-8000-000000000001"],
    },
    actor_user_id: resolvedContext.userId,
    created_at: "2026-08-17T12:00:00.000Z",
  };
}

function scheduleExportScheduleMockModel() {
  return {
    id: "8a000000-0000-4000-8000-000000000001",
    workspace_id: resolvedContext.workspace.id,
    preset_id: "89000000-0000-4000-8000-000000000001",
    preset_name: "Payroll export",
    name: "Monday managers",
    recipients: ["manager@example.test"],
    location_ids: ["11000000-0000-4000-8000-000000000001"],
    day_of_week: 1,
    send_hour: 8,
    timezone: "America/Los_Angeles",
    enabled: true,
    last_sent_at: null,
    consecutive_failures: 0,
    last_error: null,
    auto_disabled_at: null,
    created_at: "2026-08-17T12:00:00.000Z",
    updated_at: "2026-08-17T12:00:00.000Z",
  };
}

function schedulePendingOpMockModel() {
  return {
    id: "81000000-0000-4000-8000-000000000001",
    location_id: "11000000-0000-4000-8000-000000000001",
    week_start: "2026-08-17",
    op_type: "update" as const,
    target_shift_id: "81000000-0000-4000-8000-000000000001",
    target_draft_id: "85000000-0000-4000-8000-000000000001",
    payload: {
      scheduled_date: "2026-08-17",
      start_time: "17:00",
      end_time: "21:00",
      location_id: "11000000-0000-4000-8000-000000000001",
      job_id: "33000000-0000-4000-8000-000000000001",
      note: "Updated",
    },
    created_by: resolvedContext.userId,
    created_at: "2026-08-17T12:00:00.000Z",
    updated_at: "2026-08-17T12:00:00.000Z",
  };
}

function schedulePublicationStatusMockModel() {
  return {
    week_start: "2026-08-17",
    week_end: "2026-08-23",
    week_start_day: "monday" as const,
    schedule_deadline_day: "sunday" as const,
    is_anchor_only: false,
    locations: [
      {
        id: "11000000-0000-4000-8000-000000000001",
        name: "Main Dining",
        color: "#5B7FA3",
        timezone: "America/Los_Angeles",
        status: "published" as const,
        reason: "active_publication_and_shifts" as const,
        publication_includes_location: true,
        published_shift_count: 1,
        worked_shift_count: 0,
        draft_shift_count: 1,
        published_at: "2026-08-17T12:00:00.000Z",
        published_by_name: null,
      },
    ],
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
        affected_employee_ids: [],
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
    settings: { time_format: "12h" as const },
    locations: [],
    departments: [],
    jobs: [],
    shift_types: [],
    shift_labels: [],
    employees: [],
    shifts: [scheduleShiftMockModel()],
    closures: [],
    important_dates: [],
  };
}

function scheduleShiftMockModel() {
  return {
    id: "81000000-0000-4000-8000-000000000001",
    location_id: "11000000-0000-4000-8000-000000000001",
    employee_id: null,
    job_id: "33000000-0000-4000-8000-000000000001",
    shift_type_id: null,
    scheduled_date: "2026-08-17",
    start_time: "09:00",
    end_time: "17:00",
    crosses_midnight: false,
    unpaid_break_minutes: 30 as const,
    hide_time_on_badge: false,
    label_ids: [],
    note: "",
    warning_codes: [] as Array<"availability" | "closed_location" | "overlap">,
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
