import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app";
import { rpcFailure } from "./http-error";
import { authzActionKeys, type ActiveWorkspaceContext } from "@newfork/shared";
import type { EmployeeOnboardingService } from "./employees/onboarding-service";
import type { ScheduleReadService } from "./schedule/schedule-service";
import type { EmployeeHubService } from "./employee-hub/employee-hub-service";
import type { CommunicationService } from "./communications/communication-service";

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
    access: { employee: false, management: "owner" },
    status: "active",
  },
  // An owner: the core lists every action for them.
  actions: [...authzActionKeys],
  permissions: [
    "workspace.read",
    "workspace.manage",
    "schedule.read",
    "schedule.manage",
    "schedule.publish",
    "schedule.templates.read",
    "schedule.templates.manage",
    "schedule.export",
    "schedule.time_off_requests.read",
    "schedule.time_off_requests.manage",
    "schedule.shift_change_requests.read",
    "schedule.shift_change_requests.manage",
    "roles.read",
    "roles.manage",
    "documents.read",
    "documents.manage",
    "employees.read",
    "employees.manage",
    "employees.archive",
    "employee_access.manage",
    "employee_onboarding.review",
    "employee_documents.review",
    "employee_documents.read",
    "settings.general.read",
    "settings.general.manage",
    "announcements.read",
    "announcements.manage",
    "notifications.read",
  ],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
};

function workspaceMismatchContext(): ActiveWorkspaceContext {
  const otherWorkspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe";
  return {
    ...resolvedContext,
    workspace: { ...resolvedContext.workspace, id: otherWorkspaceId },
    membership: {
      ...resolvedContext.membership,
      workspaceId: otherWorkspaceId,
    },
  };
}

const invitationAccess = {
  employee_role_id: "cb8b3ca2-bdaa-460b-9ae8-ef6b8c049226",
  management_role_id: "cb8b3ca2-bdaa-460b-9ae8-ef6b8c049227",
  managed_location_ids: ["cb8b3ca2-bdaa-460b-9ae8-ef6b8c049228"],
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
              week_start_day: "monday",
              last_sent_at: null,
              consecutive_failures: 0,
            },
          ],
          unreadable: [],
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

  it("refuses scheduled exports plainly when no email key is set (U63)", async () => {
    const previous = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const app = buildApp({
        scheduleService: scheduleServiceMock({}),
        scheduleExportCron: { cronSecret: "cron-secret" },
      });
      const response = await app.inject({
        method: "POST",
        url: "/internal/cron/scheduled-exports",
        headers: { authorization: "Bearer cron-secret" },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "Email delivery is not configured" });
    } finally {
      if (previous !== undefined) process.env.RESEND_API_KEY = previous;
    }
  });

  // BILDIRIM-03: the old notification system is torn down; its paths get the plain 404 every
  // unknown path gets (the outbox cron went in teardown part C1).
  it.each([
    ["GET", "/internal/cron/notification-outbox"],
    ["POST", "/internal/cron/notification-outbox"],
    ["GET", `/v1/workspaces/${resolvedContext.workspace.id}/notification-settings`],
    ["PATCH", `/v1/workspaces/${resolvedContext.workspace.id}/notification-settings`],
    ["POST", `/v1/workspaces/${resolvedContext.workspace.id}/notification-settings/reset`],
    ["POST", `/v1/workspaces/${resolvedContext.workspace.id}/notification-settings/test`],
    ["GET", `/v1/workspaces/${resolvedContext.workspace.id}/me/notification-preferences`],
    ["PATCH", `/v1/workspaces/${resolvedContext.workspace.id}/me/notification-preferences`],
  ] as const)("no longer serves the notification path %s %s", async (method, url) => {
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      maintenanceCron: { cronSecret: "cron-secret" },
    });
    const response = await app.inject({
      method,
      url,
      headers: { authorization: url.startsWith("/internal") ? "Bearer cron-secret" : "Bearer valid-token" },
      payload: method === "GET" ? undefined : {},
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Not found" });
  });

  // BILDIRIM-01 (K1, K2): the maintenance cron the database calls every minute.
  it("runs the maintenance worker only with the cron secret", async () => {
    const result = {
      shiftExchanges: { expired: 1, invalidated: 0, skipped_busy: 0 },
      documents: { checked: 3, suspended: 1 },
      failed: 0,
    };
    const runBatch = vi.fn(async () => result);
    const app = buildApp({
      maintenanceWorker: { runBatch },
      maintenanceCron: { cronSecret: "maintenance-cron-secret" },
    });

    const denied = await app.inject({
      method: "POST",
      url: "/internal/cron/maintenance",
      headers: { authorization: "Bearer wrong" },
    });
    expect(denied.statusCode).toBe(401);
    expect(runBatch).not.toHaveBeenCalled();

    const response = await app.inject({
      method: "POST",
      url: "/internal/cron/maintenance",
      headers: { authorization: "Bearer maintenance-cron-secret" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(result);
    expect(runBatch).toHaveBeenCalledTimes(1);
  });

  it("runs the workspace retention worker only with the cron secret", async () => {
    const runBatch = vi.fn(async () => ({
      checked: 2,
      completed: 1,
      idempotent: 1,
      failed: 0,
    }));
    const app = buildApp({
      workspaceRetentionWorker: { runBatch },
      workspaceRetentionCron: { cronSecret: "retention-cron-secret" },
    });

    const denied = await app.inject({
      method: "POST",
      url: "/internal/cron/workspace-retention",
      headers: { authorization: "Bearer wrong" },
    });
    expect(denied.statusCode).toBe(401);

    const response = await app.inject({
      method: "POST",
      url: "/internal/cron/workspace-retention",
      headers: { authorization: "Bearer retention-cron-secret" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      checked: 2,
      completed: 1,
      idempotent: 1,
      failed: 0,
    });
    expect(runBatch).toHaveBeenCalledTimes(1);
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

  it("resolves explicit tab workspace context from the request header", async () => {
    const requestedWorkspaceId = "7ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
    const resolve = vi.fn(async (token: string, workspaceId?: string | null) =>
      token === "valid-token"
        ? ({
            ...resolvedContext,
            workspace: {
              ...resolvedContext.workspace,
              id: workspaceId ?? resolvedContext.workspace.id,
            },
            membership: {
              ...resolvedContext.membership,
              workspaceId: workspaceId ?? resolvedContext.workspace.id,
            },
          } satisfies ActiveWorkspaceContext)
        : null,
    );
    const app = buildApp({ contextResolver: { resolve } });

    const response = await app.inject({
      method: "GET",
      url: "/v1/context",
      headers: {
        authorization: "Bearer valid-token",
        "x-newfork-workspace-id": requestedWorkspaceId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      workspace: { id: requestedWorkspaceId },
      membership: { workspaceId: requestedWorkspaceId },
    });
    expect(resolve).toHaveBeenCalledWith("valid-token", requestedWorkspaceId);
  });

  it("rejects explicit tab workspace context when the resolver returns another tenant", async () => {
    const requestedWorkspaceId = "7ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
    const resolve = vi.fn(async () => resolvedContext);
    const app = buildApp({ contextResolver: { resolve } });

    const response = await app.inject({
      method: "GET",
      url: "/v1/context",
      headers: {
        authorization: "Bearer valid-token",
        "x-newfork-workspace-id": requestedWorkspaceId,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Invalid session or membership" });
    expect(resolve).toHaveBeenCalledWith("valid-token", requestedWorkspaceId);
  });

  it("rejects malformed explicit tab workspace context before resolving tenancy", async () => {
    const resolve = vi.fn(async () => resolvedContext);
    const app = buildApp({ contextResolver: { resolve } });

    const response = await app.inject({
      method: "GET",
      url: "/v1/context",
      headers: {
        authorization: "Bearer valid-token",
        "x-newfork-workspace-id": "not-a-workspace-id",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Valid workspace context required",
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects malformed resolved workspace context before exposing it", async () => {
    const resolve = vi.fn(
      async () =>
        ({
          ...resolvedContext,
          membership: {
            ...resolvedContext.membership,
            status: "pending_activation",
          },
        }) as unknown as ActiveWorkspaceContext,
    );
    const app = buildApp({ contextResolver: { resolve } });

    const response = await app.inject({
      method: "GET",
      url: "/v1/context",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Invalid session or membership" });
    expect(resolve).toHaveBeenCalledWith("valid-token", null);
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
          team: [],
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

  it("returns a generic not found for Employee Hub workspace mismatches", async () => {
    const get = vi.fn();
    const app = buildApp({
      contextResolver: { resolve: async () => workspaceMismatchContext() },
      employeeHubService: { get } as unknown as EmployeeHubService,
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/employee-hub?from=2026-08-17&to=2026-09-28`,
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Workspace not found" });
    expect(get).not.toHaveBeenCalled();
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
            },
            today_ends_at: null,
            announcements: [],
            todos: [],
            layout: {
              widget_order: [
                "operations",
                "pending_requests",
                "open_shifts",
                "announcements",
                "todos",
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

  it("forwards manual Workspace todo actions to the workspace service", async () => {
    const todoId = "a9700000-0000-4000-8000-000000000011";
    const todo = {
      id: todoId,
      workspace_id: resolvedContext.workspace.id,
      title: "Follow up",
      body: "",
      severity: "info" as const,
      status: "open" as const,
      system_generated: false,
      source_type: "manual",
      source_id: "a9700000-0000-4000-8000-000000000012",
      source_key: "manual:a9700000-0000-4000-8000-000000000012",
      employee_id: null,
      due_at: null,
      action_url: null,
      created_at: "2026-09-05T12:00:00.000Z",
    };
    const createWorkspaceTodo = vi.fn(async () => todo);
    const resolveWorkspaceTodo = vi.fn(async () => ({
      ...todo,
      status: "resolved" as const,
    }));
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      communicationService: {
        createWorkspaceTodo,
        resolveWorkspaceTodo,
      } as unknown as CommunicationService,
    });

    const created = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/workspace/todos`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        title: "Follow up",
        body: "",
        employee_id: null,
        due_at: null,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(createWorkspaceTodo).toHaveBeenCalledWith({
      actorUserId: resolvedContext.userId,
      workspaceId: resolvedContext.workspace.id,
      todo: {
        title: "Follow up",
        body: "",
        employee_id: null,
        due_at: null,
      },
    });

    const resolved = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/workspace/todos/${todoId}/resolve`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolveWorkspaceTodo).toHaveBeenCalledWith({
      actorUserId: resolvedContext.userId,
      workspaceId: resolvedContext.workspace.id,
      todoId,
    });
  });

  it("keeps Workspace todo actions inside the resolved tenant context", async () => {
    const createWorkspaceTodo = vi.fn();
    const resolveWorkspaceTodo = vi.fn();
    const app = buildApp({
      contextResolver: { resolve: async () => workspaceMismatchContext() },
      communicationService: {
        createWorkspaceTodo,
        resolveWorkspaceTodo,
      } as unknown as CommunicationService,
    });

    const created = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/workspace/todos`,
      headers: { authorization: "Bearer valid-token" },
      payload: { title: "Follow up" },
    });
    expect(created.statusCode).toBe(404);
    expect(created.json()).toMatchObject({ error: "Workspace not found", reason: "authz.not_member" });

    const resolved = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${resolvedContext.workspace.id}/workspace/todos/a9700000-0000-4000-8000-000000000011/resolve`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(resolved.statusCode).toBe(404);
    expect(resolved.json()).toMatchObject({ error: "Workspace not found", reason: "authz.not_member" });
    expect(createWorkspaceTodo).not.toHaveBeenCalled();
    expect(resolveWorkspaceTodo).not.toHaveBeenCalled();
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

  // Time off rebuild D7: the old time off's routes are gone; the new ones live under /time-off-requests.
  it("has none of the old time off routes", async () => {
    const app = buildApp({ contextResolver: { resolve: async () => resolvedContext } });
    const w = `/v1/workspaces/${resolvedContext.workspace.id}`;
    const requestId = "97200000-0000-4000-8000-000000000001";
    const gone = [
      ["GET", `${w}/schedule/requests`],
      ["POST", `${w}/employee-hub/request-action`],
      ["POST", `${w}/time-off`],
      ["POST", `${w}/time-off/${requestId}/cancellation`],
      ["POST", `${w}/time-off/${requestId}/verdict`],
      ["POST", `${w}/time-off/${requestId}/revoke`],
      ["POST", `${w}/time-off/${requestId}/shorten`],
      ["POST", `${w}/schedule/requests/time-off/${requestId}/decision`],
    ] as const;
    for (const [method, url] of gone) {
      const response = await app.inject({ method, url, headers: { authorization: "Bearer valid-token" }, payload: method === "POST" ? {} : undefined });
      expect(response.statusCode, url).toBe(404);
    }
    await app.close();
  });

  it("prepares and retries employee invitations only inside the authorized workspace", async () => {
    const prepared: unknown[] = [];
    const revoked: unknown[] = [];
    const prepare = vi.fn(async (input) => {
      prepared.push(input);
      return {
        id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
        expiresAt: "2026-08-24T12:00:00.000Z",
        developmentUrl: "http://127.0.0.1:5555/accept-invite?token=test",
      };
    });
    const retry = vi.fn(async () => ({
      id: "8ce12c4a-216e-4e52-bca4-66c32c996541",
      expiresAt: "2026-08-24T12:00:00.000Z",
    }));
    const revoke = vi.fn(async (_input: unknown) => undefined);
    const updateAccess = vi.fn(async (_input: unknown) => undefined);
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      invitationService: {
        link: async () => {
          throw new Error("not used");
        },
        preview: async () => ({
          state: "valid" as const,
          workspaceName: "Meyhouse",
          emailHint: "em***@example.test",
          expiresAt: "2026-08-24T12:00:00.000Z",
        }),
        prepare,
        updateAccess,
        retry,
        revoke: async (input) => {
          revoked.push(input);
          return revoke(input);
        },
        accept: async () => ({
          workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        }),
        listPending: async () => [],
        acceptPending: async () => ({
          workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        }),
        declinePending: async () => undefined,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/employees/fe201916-aa0e-480b-9144-1e1c8da20a31/invitations",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        email: "employee@example.test",
        access: invitationAccess,
        actorUserId: "11111111-1111-4111-8111-111111111111",
        actor_user_id: "11111111-1111-4111-8111-111111111111",
        workspaceId: "1131ca31-392f-4ea0-bdc2-e1235e1496b1",
        workspace_id: "1131ca31-392f-4ea0-bdc2-e1235e1496b1",
        employeeId: "15000000-0000-4000-8000-000000000002",
        employee_id: "15000000-0000-4000-8000-000000000002",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(prepared).toHaveLength(1);
    expect(prepared[0]).toEqual({
      actorUserId: resolvedContext.userId,
      workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      employeeId: "fe201916-aa0e-480b-9144-1e1c8da20a31",
      email: "employee@example.test",
      access: invitationAccess,
    });

    const accessResponse = await app.inject({
      method: "PATCH",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/employees/fe201916-aa0e-480b-9144-1e1c8da20a31/invitations",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        access: invitationAccess,
        actorUserId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "1131ca31-392f-4ea0-bdc2-e1235e1496b1",
      },
    });
    expect(accessResponse.statusCode).toBe(204);
    expect(updateAccess).toHaveBeenCalledWith({
      actorUserId: resolvedContext.userId,
      workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      employeeId: "fe201916-aa0e-480b-9144-1e1c8da20a31",
      access: invitationAccess,
    });

    const retryResponse = await app.inject({
      method: "POST",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/employees/fe201916-aa0e-480b-9144-1e1c8da20a31/invitations/retry",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        actorUserId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "1131ca31-392f-4ea0-bdc2-e1235e1496b1",
      },
    });
    expect(retryResponse.statusCode).toBe(200);
    expect(retry).toHaveBeenCalledWith({
      actorUserId: resolvedContext.userId,
      workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      employeeId: "fe201916-aa0e-480b-9144-1e1c8da20a31",
    });

    const revokeResponse = await app.inject({
      method: "DELETE",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/employees/fe201916-aa0e-480b-9144-1e1c8da20a31/invitations",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        actorUserId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "1131ca31-392f-4ea0-bdc2-e1235e1496b1",
        employeeId: "15000000-0000-4000-8000-000000000002",
      },
    });
    expect(revokeResponse.statusCode).toBe(204);
    expect(revoked).toEqual([
      {
        actorUserId: resolvedContext.userId,
        workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        employeeId: "fe201916-aa0e-480b-9144-1e1c8da20a31",
      },
    ]);

    const crossWorkspace = await app.inject({
      method: "POST",
      url: "/v1/workspaces/1131ca31-392f-4ea0-bdc2-e1235e1496b1/employees/fe201916-aa0e-480b-9144-1e1c8da20a31/invitations",
      headers: { authorization: "Bearer valid-token" },
      payload: { email: "employee@example.test", access: invitationAccess },
    });
    expect(crossWorkspace.statusCode).toBe(404);
    expect(crossWorkspace.json()).toMatchObject({ error: "Workspace not found", reason: "authz.not_member" });
    expect(prepare).toHaveBeenCalledTimes(1);

    const crossWorkspaceRevoke = await app.inject({
      method: "DELETE",
      url: "/v1/workspaces/1131ca31-392f-4ea0-bdc2-e1235e1496b1/employees/fe201916-aa0e-480b-9144-1e1c8da20a31/invitations",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(crossWorkspaceRevoke.statusCode).toBe(404);
    expect(crossWorkspaceRevoke.json()).toMatchObject({
      error: "Workspace not found",
      reason: "authz.not_member",
    });
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("dispatches the invitations queued during owner onboarding when setup completes", async () => {
    const saveOwnerOnboarding = vi.fn(async () => undefined);
    const listOwnerOnboardingInvitationIntents = vi.fn(async () => [
      {
        employeeId: "fe201916-aa0e-480b-9144-1e1c8da20a31",
        email: "owner-flow@example.test",
      },
    ]);
    const markOwnerOnboardingInvitationIntentDispatched = vi.fn(
      async () => undefined,
    );
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      workspaceAccountService: {
        saveOwnerOnboarding,
        listOwnerOnboardingInvitationIntents,
        markOwnerOnboardingInvitationIntentDispatched,
      } as never,
      invitationService: {
        link: async () => {
          throw new Error("not used");
        },
        prepare: async () => ({
          id: "8ce12c4a-216e-4e52-bca4-66c32c996542",
          expiresAt: "2026-08-24T12:00:00.000Z",
          developmentUrl:
            "http://127.0.0.1:5555/invite/accept?token=owner-flow-token",
        }),
      } as never,
    });

    const completed = await app.inject({
      method: "PATCH",
      url: "/v1/workspaces/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/owner-onboarding",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        workspaceName: "Meyhouse",
        nextStep: 4,
        complete: true,
      },
    });
    expect(completed.statusCode, completed.body).toBe(204);

    expect(markOwnerOnboardingInvitationIntentDispatched).toHaveBeenCalledWith(
      "valid-token",
      {
        workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        employeeId: "fe201916-aa0e-480b-9144-1e1c8da20a31",
      },
    );
  });

  it("accepts invitation tokens through the authenticated identity boundary", async () => {
    const app = buildApp({
      contextResolver: null,
      invitationService: {
        link: async () => {
          throw new Error("not used");
        },
        preview: async () => ({
          state: "valid" as const,
          workspaceName: "Meyhouse",
          emailHint: "em***@example.test",
          expiresAt: "2026-08-24T12:00:00.000Z",
        }),
        updateAccess: async () => {
          throw new Error("not used");
        },
        prepare: async () => {
          throw new Error("not used");
        },
        retry: async () => {
          throw new Error("not used");
        },
        revoke: async () => undefined,
        accept: async (accessToken, token) => {
          expect(accessToken).toBe("employee-token");
          expect(token).toBe("a".repeat(64));
          return { workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd" };
        },
        listPending: async () => [],
        acceptPending: async () => ({
          workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        }),
        declinePending: async () => undefined,
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/invitations/accept",
      headers: { authorization: "Bearer employee-token" },
      payload: {
        token: "a".repeat(64),
        accessToken: "spoofed-token",
        actorUserId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "1131ca31-392f-4ea0-bdc2-e1235e1496b1",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    });
  });

  it("reviews pending invitations without exposing an employee name", async () => {
    const app = buildApp({
      contextResolver: null,
      invitationService: {
        link: async () => {
          throw new Error("not used");
        },
        preview: async () => {
          throw new Error("not used");
        },
        updateAccess: async () => {
          throw new Error("not used");
        },
        prepare: async () => {
          throw new Error("not used");
        },
        retry: async () => {
          throw new Error("not used");
        },
        revoke: async () => undefined,
        accept: async () => {
          throw new Error("not used");
        },
        listPending: async (accessToken) => {
          expect(accessToken).toBe("employee-token");
          return [
            {
              id: "46000000-0000-4000-8000-000000000001",
              workspaceId: "26000000-0000-4000-8000-000000000001",
              workspaceName: "Northstar",
              emailHint: "ne**********@example.test",
              expiresAt: "2026-09-12T12:00:00.000Z",
            },
          ];
        },
        acceptPending: async () => ({
          workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        }),
        declinePending: async () => undefined,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/invitations/pending",
      headers: { authorization: "Bearer employee-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("employeeName");
    expect(response.json()).toEqual([
      {
        id: "46000000-0000-4000-8000-000000000001",
        workspaceId: "26000000-0000-4000-8000-000000000001",
        workspaceName: "Northstar",
        emailHint: "ne**********@example.test",
        expiresAt: "2026-09-12T12:00:00.000Z",
      },
    ]);
  });

  it("accepts or declines pending invitations by id through the authenticated account", async () => {
    const calls: string[] = [];
    const app = buildApp({
      contextResolver: null,
      invitationService: {
        link: async () => {
          throw new Error("not used");
        },
        preview: async () => {
          throw new Error("not used");
        },
        updateAccess: async () => {
          throw new Error("not used");
        },
        prepare: async () => {
          throw new Error("not used");
        },
        retry: async () => {
          throw new Error("not used");
        },
        revoke: async () => undefined,
        accept: async () => {
          throw new Error("not used");
        },
        listPending: async () => [],
        acceptPending: async (accessToken, invitationId) => {
          calls.push(`accept:${accessToken}:${invitationId}`);
          return { workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd" };
        },
        declinePending: async (accessToken, invitationId) => {
          calls.push(`decline:${accessToken}:${invitationId}`);
        },
      },
    });
    const invitationId = "46000000-0000-4000-8000-000000000001";

    const accepted = await app.inject({
      method: "POST",
      url: `/v1/invitations/${invitationId}/accept`,
      headers: { authorization: "Bearer employee-token" },
      payload: {
        invitationId: "46000000-0000-4000-8000-000000000002",
        invitation_id: "46000000-0000-4000-8000-000000000002",
        accessToken: "spoofed-token",
        actorUserId: "11111111-1111-4111-8111-111111111111",
      },
    });
    const declined = await app.inject({
      method: "POST",
      url: `/v1/invitations/${invitationId}/decline`,
      headers: { authorization: "Bearer employee-token" },
      payload: {
        invitationId: "46000000-0000-4000-8000-000000000002",
        invitation_id: "46000000-0000-4000-8000-000000000002",
        accessToken: "spoofed-token",
        actorUserId: "11111111-1111-4111-8111-111111111111",
      },
    });

    expect(accepted.statusCode).toBe(200);
    expect(declined.statusCode).toBe(204);
    expect(calls).toEqual([
      `accept:employee-token:${invitationId}`,
      `decline:employee-token:${invitationId}`,
    ]);
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

  it("forwards an optional workspace query to self-scoped onboarding", async () => {
    const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
    const calls: unknown[][] = [];
    const base = onboardingServiceMock();
    const service = onboardingServiceMock({
      get: async (...input) => {
        calls.push(["get", ...input]);
        return base.get(input[0]);
      },
      submit: async (...input) => {
        calls.push(["submit", ...input]);
        return 2;
      },
      leave: async (...input) => {
        calls.push(["leave", ...input]);
        return base.leave(input[0], input[1]);
      },
    });
    const app = buildApp({ contextResolver: null, onboardingService: service });
    const headers = { authorization: "Bearer pending-member-token" };

    const read = await app.inject({
      method: "GET",
      url: `/v1/me/onboarding?workspaceId=${workspaceId}`,
      headers,
    });
    const submit = await app.inject({
      method: "POST",
      url: `/v1/me/onboarding/submit?workspaceId=${workspaceId}`,
      headers,
      payload: { revision: 1 },
    });
    const leave = await app.inject({
      method: "POST",
      url: `/v1/me/onboarding/leave?workspaceId=${workspaceId}`,
      headers,
      payload: { revision: 1 },
    });
    const invalid = await app.inject({
      method: "GET",
      url: "/v1/me/onboarding?workspaceId=not-a-uuid",
      headers,
    });

    expect([read.statusCode, submit.statusCode, leave.statusCode]).toEqual([
      200, 200, 200,
    ]);
    expect(invalid.statusCode).toBe(400);
    expect(calls).toEqual([
      ["get", "pending-member-token", workspaceId],
      ["submit", "pending-member-token", 1, workspaceId],
      ["leave", "pending-member-token", 1, workspaceId],
    ]);
  });

  // BL-1046: the welcome steps reload only when the database says the
  // onboarding moved on; the key travels with the 409.
  it("passes the onboarding.changed key on with the 409 of every own step", async () => {
    const changed = () => {
      throw rpcFailure({ message: "onboarding changed; refresh required", code: "PT409", hint: "onboarding.changed" });
    };
    const service = onboardingServiceMock({ saveProfile: changed, submit: changed, leave: changed });
    const app = buildApp({ contextResolver: null, onboardingService: service });
    const headers = { authorization: "Bearer pending-member-token" };
    const responses = await Promise.all([
      app.inject({
        method: "PATCH",
        url: "/v1/me/onboarding/profile",
        headers,
        payload: {
          revision: 1,
          profile: {
            legal_first_name: "Taylor",
            legal_last_name: "Reed",
            phone: "+13105550100",
            street_address: "1 Main St",
            city: "Los Angeles",
            region: "CA",
            postal_code: "90012",
            country_code: "US",
            date_of_birth: "1990-01-01",
            emergency_contact_name: "Morgan Reed",
            emergency_contact_relationship: "Sibling",
            emergency_contact_email: "",
            emergency_contact_phone: "+13105550101",
            share_phone_with_teammates: false,
            share_email_with_teammates: false,
          },
        },
      }),
      app.inject({ method: "POST", url: "/v1/me/onboarding/submit", headers, payload: { revision: 1 } }),
      app.inject({ method: "POST", url: "/v1/me/onboarding/leave", headers, payload: { revision: 1 } }),
    ]);
    for (const response of responses) {
      expect(response.statusCode, response.body).toBe(409);
      expect(response.json()).toMatchObject({ reason: "onboarding.changed" });
    }
  });

  // TEL-2: the onboarding screen asks while the number is typed.
  it("answers whether a typed onboarding phone is somebody else's", async () => {
    const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
    const calls: unknown[][] = [];
    const service = onboardingServiceMock({
      phoneInUse: async (...input) => {
        calls.push(input);
        return true;
      },
    });
    const app = buildApp({ contextResolver: null, onboardingService: service });
    const headers = { authorization: "Bearer pending-member-token" };
    const asked = await app.inject({
      method: "GET",
      url: `/v1/me/onboarding/phone-in-use?phone=${encodeURIComponent("(415) 555-0100")}&workspaceId=${workspaceId}`,
      headers,
    });
    const noPhone = await app.inject({ method: "GET", url: "/v1/me/onboarding/phone-in-use", headers });
    const badWorkspace = await app.inject({
      method: "GET",
      url: "/v1/me/onboarding/phone-in-use?phone=4155550100&workspaceId=not-a-uuid",
      headers,
    });
    const signedOut = await app.inject({ method: "GET", url: "/v1/me/onboarding/phone-in-use?phone=4155550100" });

    expect(asked.statusCode).toBe(200);
    expect(asked.json()).toEqual({ inUse: true });
    expect([noPhone.statusCode, badWorkspace.statusCode, signedOut.statusCode]).toEqual([400, 400, 401]);
    expect(calls).toEqual([["pending-member-token", "(415) 555-0100", workspaceId]]);
  });

  it("forwards self-scoped onboarding writes only from token, path and validated fields", async () => {
    const calls: Array<{ kind: string; input: unknown[] }> = [];
    const service = onboardingServiceMock({
      saveProfile: async (...input) => {
        calls.push({ kind: "profile", input });
        return 2;
      },
      submit: async (...input) => {
        calls.push({ kind: "submit", input });
        return 6;
      },
      leave: async (...input) => {
        calls.push({ kind: "leave", input });
        return {
          status: "left",
          workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
          employeeId: "fe201916-aa0e-480b-9144-1e1c8da20a31",
          membershipId: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
          revision: 8,
        };
      },
    });
    const app = buildApp({ contextResolver: null, onboardingService: service });
    const spoofedIdentity = {
      accessToken: "spoofed-token",
      actorUserId: "11111111-1111-4111-8111-111111111111",
      actor_user_id: "11111111-1111-4111-8111-111111111111",
      userId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "16fe2550-8960-480c-9874-cbc76a8e56a9",
      workspace_id: "16fe2550-8960-480c-9874-cbc76a8e56a9",
      employeeId: "15000000-0000-4000-8000-000000000002",
      employee_id: "15000000-0000-4000-8000-000000000002",
      requirementId: "97000000-0000-4000-8000-000000000002",
      requirement_id: "97000000-0000-4000-8000-000000000002",
    };
    const profile = {
      legal_first_name: "Ada",
      legal_last_name: "Lovelace",
      phone: "+14155550100",
      street_address: "1 Market St",
      city: "San Francisco",
      region: "CA",
      postal_code: "94105",
      country_code: "US",
      date_of_birth: "1990-01-01",
      emergency_contact_name: "Grace Hopper",
      emergency_contact_relationship: "Friend",
      emergency_contact_email: "grace@example.test",
      emergency_contact_phone: "+14155550101",
      share_phone_with_teammates: true,
      share_email_with_teammates: false,
    };

    const requests = [
      {
        method: "PATCH",
        url: "/v1/me/onboarding/profile",
        payload: { ...spoofedIdentity, profile, revision: 1 },
        expectedStatus: 200,
      },
      {
        method: "POST",
        url: "/v1/me/onboarding/submit",
        payload: { ...spoofedIdentity, revision: 5 },
        expectedStatus: 200,
      },
      {
        method: "POST",
        url: "/v1/me/onboarding/leave",
        payload: { ...spoofedIdentity, revision: 7 },
        expectedStatus: 200,
      },
    ] as const;

    for (const request of requests) {
      const response = await app.inject({
        method: request.method,
        url: request.url,
        headers: { authorization: "Bearer pending-member-token" },
        payload: request.payload,
      });
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(
        request.expectedStatus,
      );
    }

    expect(calls).toEqual([
      // Body workspace fields are ignored; only the query selects a workspace.
      { kind: "profile", input: ["pending-member-token", profile, 1, undefined] },
      { kind: "submit", input: ["pending-member-token", 5, undefined] },
      { kind: "leave", input: ["pending-member-token", 7, undefined] },
    ]);
  });

  it("lets a pending member leave onboarding through the authenticated service boundary", async () => {
    const calls: string[] = [];
    const service = onboardingServiceMock({
      leave: async (accessToken, revision) => {
        calls.push(`${accessToken}:${revision}`);
        return {
          status: "left",
          workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
          employeeId: "fe201916-aa0e-480b-9144-1e1c8da20a31",
          membershipId: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
          revision: 3,
        };
      },
    });
    const app = buildApp({ contextResolver: null, onboardingService: service });
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/onboarding/leave",
      headers: { authorization: "Bearer pending-member-token" },
      payload: { revision: 2 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "left",
      workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      employeeId: "fe201916-aa0e-480b-9144-1e1c8da20a31",
      membershipId: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
      revision: 3,
    });
    expect(calls).toEqual(["pending-member-token:2"]);
  });

  it("keeps the SSN onboarding endpoint disabled for V1", async () => {
    const service = onboardingServiceMock();
    const app = buildApp({ onboardingService: service });

    const response = await app.inject({
      method: "PUT",
      url: "/v1/me/onboarding/ssn",
      headers: { authorization: "Bearer pending-member-token" },
      payload: { ssn: "123456789", revision: 1 },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toEqual({ error: "SSN is deferred from V1" });
  });

  it("returns generic not found for manager onboarding routes when the active workspace mismatches the path", async () => {
    const getReview = vi.fn(async () => {
      throw new Error("not used");
    });
    const review = vi.fn(async () => 2);
    const service = onboardingServiceMock({ getReview, review });
    const app = buildApp({
      contextResolver: { resolve: async () => workspaceMismatchContext() },
      onboardingService: service,
    });
    const pathWorkspaceId = resolvedContext.workspace.id;
    const employeeId = "fe201916-aa0e-480b-9144-1e1c8da20a31";
    const requirementId = "97000000-0000-4000-8000-000000000001";

    const requests = [
      {
        method: "GET",
        url: `/v1/workspaces/${pathWorkspaceId}/employees/${employeeId}/onboarding`,
      },
      {
        method: "POST",
        url: `/v1/workspaces/${pathWorkspaceId}/employees/${employeeId}/onboarding/review`,
        payload: {
          action: "reject_requirement",
          requirementId,
          reason: "Wrong file",
          revision: 1,
        },
      },
    ] as const;

    for (const request of requests) {
      const response = await app.inject({
        method: request.method,
        url: request.url,
        headers: { authorization: "Bearer valid-token" },
        payload: "payload" in request ? request.payload : undefined,
      });
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(404);
      expect(response.json()).toEqual({ error: "Workspace not found" });
    }
    expect(getReview).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
  });

  it("lets the core, not the role's keys, answer manager onboarding reads and reviews (FB-6.6)", async () => {
    // A role listing none of the old keys still reaches the service: the
    // database asks the authorization core (employee.read, onboarding.review).
    const keyless = { ...resolvedContext, permissions: [] };
    const getReview = vi.fn(async () => null);
    const review = vi.fn(async () => 3);
    const app = buildApp({
      contextResolver: { resolve: async () => keyless },
      onboardingService: onboardingServiceMock({ getReview, review }),
    });
    const base = `/v1/workspaces/${resolvedContext.workspace.id}/employees/fe201916-aa0e-480b-9144-1e1c8da20a31/onboarding`;
    const read = await app.inject({ method: "GET", url: base, headers: { authorization: "Bearer valid-token" } });
    const decided = await app.inject({
      method: "POST",
      url: `${base}/review`,
      headers: { authorization: "Bearer valid-token" },
      payload: { action: "activate", requirementId: null, revision: 2 },
    });
    expect(read.statusCode, read.body).toBe(200);
    expect(decided.statusCode, decided.body).toBe(200);
    expect(decided.json()).toEqual({ revision: 3 });
    expect(getReview).toHaveBeenCalledOnce();
    expect(review).toHaveBeenCalledOnce();
  });

  it("answers the core's no on manager onboarding: rank 403, not a member 404 (FB-6.6)", async () => {
    const refusal = (hint: string, details: string) =>
      rpcFailure({ code: "42501", message: "not allowed", hint, details });
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      onboardingService: onboardingServiceMock({
        getReview: vi.fn(async () => {
          throw refusal("authz.not_member", "employee.read");
        }),
        review: vi.fn(async () => {
          throw refusal("authz.rank", "onboarding.review");
        }),
      }),
    });
    const base = `/v1/workspaces/${resolvedContext.workspace.id}/employees/fe201916-aa0e-480b-9144-1e1c8da20a31/onboarding`;
    const read = await app.inject({ method: "GET", url: base, headers: { authorization: "Bearer valid-token" } });
    const decided = await app.inject({
      method: "POST",
      url: `${base}/review`,
      headers: { authorization: "Bearer valid-token" },
      payload: { action: "activate", requirementId: null, revision: 2 },
    });
    expect(read.statusCode).toBe(404);
    expect(read.json()).toMatchObject({ reason: "authz.not_member" });
    expect(decided.statusCode).toBe(403);
    expect(decided.json()).toMatchObject({ reason: "authz.rank", detail: "onboarding.review" });
  });

  it("forwards manager onboarding review from context and path identity", async () => {
    const review = vi.fn(async () => 2);
    const service = onboardingServiceMock({ review });
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      onboardingService: service,
    });
    const pathWorkspaceId = resolvedContext.workspace.id;
    const employeeId = "fe201916-aa0e-480b-9144-1e1c8da20a31";
    const requirementId = "97000000-0000-4000-8000-000000000001";
    const reviewInput = {
      action: "reject_requirement",
      requirementId,
      reason: "Wrong file",
      revision: 1,
    } as const;

    const reviewResponse = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${pathWorkspaceId}/employees/${employeeId}/onboarding/review`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        ...reviewInput,
        actorUserId: "11111111-1111-4111-8111-111111111111",
        actor_user_id: "11111111-1111-4111-8111-111111111111",
        workspaceId: "16fe2550-8960-480c-9874-cbc76a8e56a9",
        workspace_id: "16fe2550-8960-480c-9874-cbc76a8e56a9",
        employeeId: "15000000-0000-4000-8000-000000000002",
        employee_id: "15000000-0000-4000-8000-000000000002",
      },
    });

    expect(reviewResponse.statusCode, reviewResponse.body).toBe(200);
    expect(reviewResponse.json()).toEqual({ revision: 2 });
    expect(review).toHaveBeenCalledWith(
      resolvedContext.userId,
      pathWorkspaceId,
      employeeId,
      reviewInput,
    );
  });

  // BL-1046: "changed meanwhile" and "review it in Documents" are told apart by key.
  it.each(["onboarding.changed", "onboarding.review_in_documents"])(
    "passes the %s key of a manager onboarding review on with the 409",
    async (hint) => {
      const service = onboardingServiceMock({
        review: async () => {
          throw rpcFailure({ message: "refused", code: "PT409", hint });
        },
      });
      const app = buildApp({
        contextResolver: { resolve: async () => resolvedContext },
        onboardingService: service,
      });
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${resolvedContext.workspace.id}/employees/fe201916-aa0e-480b-9144-1e1c8da20a31/onboarding/review`,
        headers: { authorization: "Bearer valid-token" },
        payload: { action: "activate", requirementId: null, reason: "", revision: 1 },
      });
      expect(response.statusCode, response.body).toBe(409);
      expect(response.json()).toMatchObject({ reason: hint });
    },
  );

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

  it("serves reference-style Schedule reads from explicit tab workspace context", async () => {
    const requestedWorkspaceId = "7ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
    const resolve = vi.fn(
      async (_token: string, workspaceId?: string | null) =>
        workspaceId === requestedWorkspaceId
          ? ({
              ...resolvedContext,
              workspace: { ...resolvedContext.workspace, id: workspaceId },
              membership: { ...resolvedContext.membership, workspaceId },
            } satisfies ActiveWorkspaceContext)
          : null,
    );
    const getReadModel = vi.fn(async () => scheduleServiceMockModel());
    const app = buildApp({
      contextResolver: { resolve },
      scheduleService: scheduleServiceMock({ getReadModel }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/schedule/reference?week_start=2026-08-17",
      headers: {
        authorization: "Bearer owner-token",
        "x-newfork-workspace-id": requestedWorkspaceId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(resolve).toHaveBeenCalledWith("owner-token", requestedWorkspaceId);
    expect(getReadModel).toHaveBeenCalledWith(
      resolvedContext.userId,
      requestedWorkspaceId,
      "2026-08-17",
    );
  });

  it("fails closed when reference-style Schedule explicit context resolves another tenant", async () => {
    const requestedWorkspaceId = "7ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
    const resolve = vi.fn(async () => resolvedContext);
    const getReadModel = vi.fn(async () => scheduleServiceMockModel());
    const app = buildApp({
      contextResolver: { resolve },
      scheduleService: scheduleServiceMock({ getReadModel }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/schedule/reference?week_start=2026-08-17",
      headers: {
        authorization: "Bearer owner-token",
        "x-newfork-workspace-id": requestedWorkspaceId,
      },
    });

    // Another tenant's workspace answers like an unknown one: not a member.
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: "Workspace not found",
      reason: "authz.not_member",
    });
    expect(resolve).toHaveBeenCalledWith("owner-token", requestedWorkspaceId);
    expect(getReadModel).not.toHaveBeenCalled();
  });

  it("acquires a revisioned Schedule editing session", async () => {
    const calls: string[] = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        acquireSession: async (input) => {
          calls.push(`${input.sourceKind}:${input.weekStart}:${input.resume}`);
          return { status: "acquired", session: scheduleSessionMockModel() };
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/schedule/edit-lock/acquire",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        week_start: "2026-08-17",
        source_kind: "published",
        source_draft_id: null,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("acquired");
    // Picking an edit back up is the default; a menu asks for a new one.
    const fresh = await app.inject({
      method: "POST",
      url: "/schedule/edit-lock/acquire",
      headers: { authorization: "Bearer owner-token" },
      payload: { week_start: "2026-08-17", source_kind: "blank", resume: false },
    });
    expect(fresh.statusCode).toBe(200);
    const malformed = await app.inject({
      method: "POST",
      url: "/schedule/edit-lock/acquire",
      headers: { authorization: "Bearer owner-token" },
      payload: { week_start: "2026-08-17", source_kind: "blank", resume: "no" },
    });
    expect(malformed.statusCode).toBe(400);
    expect(calls).toEqual(["published:2026-08-17:true", "blank:2026-08-17:false"]);
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
      "/shifts";
    const payload = {
      session_id: "87000000-0000-4000-8000-000000000001", expected_session_revision: 3,
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

  // BL-1044: the availability review is told apart by its key, not its sentence.
  it.each([
    ["Review the current availability assessment before saving", "PT409", "schedule.availability_review_required", 409, "availability_review_required"],
    ["The assessment moved on", "PT409", "schedule.availability_review_required", 409, "availability_review_required"],
    ["Review the current availability assessment before saving", "PT409", undefined, 409, undefined],
    ["Edit session revision is stale", "PT409", undefined, 409, undefined],
    ["Employee already has an overlapping shift", "23514", undefined, 400, undefined],
    ["Schedule location access denied", "42501", undefined, 403, undefined],
  ])("classifies fast-save rejection: %s (%s %s)", async (message, code, hint, statusCode, status) => {
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({ mutateShift: async () => { throw rpcFailure({ message, code, hint }); } }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/shifts",
      headers: { authorization: "Bearer owner-token", "idempotency-key": "89000000-0000-4000-8000-000000000001" },
      payload: { session_id: "87000000-0000-4000-8000-000000000001", expected_session_revision: 3, shift: {
        location_id: "11000000-0000-4000-8000-000000000001", employee_id: null,
        job_id: "33000000-0000-4000-8000-000000000001", shift_type_id: null,
        scheduled_date: "2026-08-17", start_time: "09:00", end_time: "17:00", note: "",
      } },
    });
    expect(response.statusCode).toBe(statusCode);
    expect(response.json().status).toBe(status);
    await app.close();
  });

  // BL-1044: auto-fill's and the templates' 409s carry the database's key, so
  // the screens read the key instead of the sentence or the bare status.
  it.each([
    ["auto-fill apply", "applyAutoFill", "POST", "/schedule/edit-sessions/87000000-0000-4000-8000-000000000001/auto-fill-apply",
      { expected_session_revision: 2, fingerprint: "c".repeat(64), assignments: [] }, "stale auto-fill preview", "schedule.auto_fill_stale"],
    ["template rename", "renameTemplate", "PATCH", "/schedule/templates/88000000-0000-4000-8000-000000000002",
      { name: "Week", expected_revision: 1 }, "schedule template revision stale", "schedule.template_changed"],
    ["template delete", "deleteTemplate", "DELETE", "/schedule/templates/88000000-0000-4000-8000-000000000002",
      { expected_revision: 1 }, "schedule template revision stale", "schedule.template_changed"],
  ] as const)("passes the %s refusal's key on with the 409", async (_label, method, verb, url, payload, message, hint) => {
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({ [method]: async () => { throw rpcFailure({ message, code: "PT409", hint }); } }),
    });
    const response = await app.inject({ method: verb, url, headers: { authorization: "Bearer owner-token" }, payload });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: message, reason: hint });
    await app.close();
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
      url: "/shifts",
      headers: {
        authorization: "Bearer owner-token",
        "idempotency-key": "89000000-0000-4000-8000-000000000001",
      },
      payload: {
        session_id: "87000000-0000-4000-8000-000000000001", expected_session_revision: 3,
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
      method: "PATCH",
      url: "/shifts/66000000-0000-4000-8000-000000000001/restore",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        session_id: "87000000-0000-4000-8000-000000000001", expected_session_revision: 4,
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
          throw rpcFailure({ message: "session revision stale", code: "PT409", hint: "schedule.edit_session_stale" });
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/schedule/drafts/save",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        session_id: "87000000-0000-4000-8000-000000000001", expected_session_revision: 2,
        name: "Opening plan",
        draft_id: null,
        expected_draft_revision: null,
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("session revision stale");
    // D-O7: the web knows a stale edit by its code, not by the sentence.
    expect(response.json().code).toBe("edit_session_stale");
  });

  it.each([
    ["edit lease expired", "schedule.edit_lease_expired", "edit_lease_expired"],
    // EKRAN-01 B3: an edit closed by another opening is not a lapsed lock.
    ["edit session closed", "schedule.edit_session_closed", "edit_session_closed"],
    ["shift revision stale", "schedule.edit_session_stale", "edit_session_stale"],
    ["draft revision stale", "schedule.edit_session_stale", "edit_session_stale"],
    // BL-958: the key is in the hint; the sentence alone names nothing.
    ["session revision stale", null, undefined],
    ["stale publication preview", null, undefined],
  ])("names a Schedule edit conflict by code: %s", async (message, hint, code) => {
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        saveSession: async () => { throw rpcFailure({ message, code: "PT409", hint }); },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/schedule/drafts/save",
      headers: { authorization: "Bearer owner-token" },
      payload: { session_id: "87000000-0000-4000-8000-000000000001", expected_session_revision: 2, name: "Plan", draft_id: null, expected_draft_revision: null },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe(code);
  });

  it("forwards Schedule retroactive save acknowledgements and preserves past-edit findings", async () => {
    const calls: Array<boolean | undefined> = [];
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        saveSession: async (input) => {
          calls.push(input.acknowledgePastEdits);
          throw rpcFailure({
            code: "P0001",
            message: JSON.stringify({
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
          });
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/schedule/drafts/save",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        session_id: "87000000-0000-4000-8000-000000000001", expected_session_revision: 2,
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
          throw rpcFailure({
            code: "P0001",
            message: JSON.stringify({
              status: "past_edit_blocked",
              past_edits: [
                {
                  op_type: "delete",
                  shift_id: "66000000-0000-4000-8000-000000000001",
                  scheduled_date: "2026-08-17",
                  location_name: "Main Dining",
                  employee_name: "Alex Rivera",
                  reason: "past_week",
                  severity: "blocked",
                },
              ],
              past_edit_messages: ["Past schedule weeks are read-only."],
            }),
          });
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
          reason: "past_week",
          severity: "blocked",
        },
      ],
      past_edit_messages: ["Past schedule weeks are read-only."],
    });
    // The web opens the Retroactive edit window on this body
    // (apps/web/src/schedule/lib/retroactiveEditRecovery.ts), not the no-access
    // state, which an authz.* reason would trigger.
    expect(response.json()).not.toHaveProperty("reason");
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
        week_start: "2026-08-17",
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

  it("requires the core's independent schedule.publish action", async () => {
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...resolvedContext,
          actions: resolvedContext.actions.filter(
            (action) => action !== "schedule.publish",
          ),
        }),
      },
      scheduleService: scheduleServiceMock(),
    });
    const response = await app.inject({
      method: "POST",
      url: "/schedule/publish-preview",
      headers: { authorization: "Bearer manager-token" },
      payload: {
        draft_id: "85000000-0000-4000-8000-000000000001",
        week_start: "2026-08-17",
        location_ids: ["11000000-0000-4000-8000-000000000001"],
      },
    });
    expect(response.statusCode).toBe(403);
  });

  // BILDIRIM-03: notification recipients are retired; an older screen that still sends them is
  // answered as before and the list goes nowhere.
  it("publishes the Schedule and drops retired notification recipients", async () => {
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
          };
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/schedule/publish",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        draft_id: "85000000-0000-4000-8000-000000000001",
        week_start: "2026-08-17",
        location_ids: ["11000000-0000-4000-8000-000000000001"],
        expected_draft_revision: 1,
        fingerprint: "a".repeat(64),
        notify_employee_ids: ["15000000-0000-4000-8000-000000000001"],
        overrides: [{ finding_id: "availability-1234567890abcdef" }],
        preflight_ack: {
          fingerprint: "a".repeat(64),
          decisions: [{ finding_id: "availability-1234567890abcdef" }],
        },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("published");
    expect(calls).toEqual([
      expect.objectContaining({
        actorUserId: resolvedContext.userId,
        workspaceId: resolvedContext.workspace.id,
        draftId: "85000000-0000-4000-8000-000000000001",
        weekStart: "2026-08-17",
        locationIds: ["11000000-0000-4000-8000-000000000001"],
        preflightAck: {
          fingerprint: "a".repeat(64),
          decisions: [{ finding_id: "availability-1234567890abcdef" }],
        },
      }),
    ]);
    expect(calls[0]).not.toHaveProperty("notifyEmployeeIds");
  });

  // Open shifts in the pool (Mert, 2026-10-20): the publisher's one choice for the open shifts goes along.
  it("passes the open shifts' choice to the publish and refuses an unknown one", async () => {
    const calls: Array<{ openShifts?: string }> = [];
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
          };
        },
      }),
    });
    const publish = (open_shifts?: string) =>
      app.inject({
        method: "POST",
        url: "/schedule/publish",
        headers: { authorization: "Bearer owner-token" },
        payload: {
          draft_id: "85000000-0000-4000-8000-000000000001",
          location_ids: ["11000000-0000-4000-8000-000000000001"],
          expected_draft_revision: 1,
          fingerprint: "a".repeat(64),
          ...(open_shifts ? { open_shifts } : {}),
        },
      });
    expect((await publish("offer")).statusCode).toBe(200);
    expect((await publish()).statusCode).toBe(200);
    expect((await publish("assign")).statusCode).toBe(400);
    expect(calls.map((call) => call.openShifts)).toEqual(["offer", undefined]);
  });

  // Availability asks nothing at publish (M9); a conflict still waiting for a decision does.
  it("says an unreviewed schedule conflict stops the publish", async () => {
    const app = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        publish: async () => { throw rpcFailure({ message: "Review the current schedule conflicts before publishing", code: "22023" }); },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/schedule/publish",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        draft_id: "85000000-0000-4000-8000-000000000001",
        location_ids: ["11000000-0000-4000-8000-000000000001"],
        expected_draft_revision: 1,
        fingerprint: "a".repeat(64),
        overrides: [],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("Review the current schedule conflicts before publishing");
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
          throw rpcFailure({ message: "schedule has hard publication blockers", code: "23514" });
        },
      }),
    });
    const hard = await hardApp.inject({
      method: "POST",
      url: "/schedule/publish",
      headers: { authorization: "Bearer owner-token" },
      payload: basePayload,
    });
    // A check_violation is a 400 everywhere (rpcFailure); the message tells them apart.
    expect(hard.statusCode).toBe(400);
    expect(hard.json().error).toBe("schedule has hard publication blockers");

    const hardDocumentApp = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        publish: async () => {
          throw rpcFailure({ message: "schedule has hard document blockers", code: "23514" });
        },
      }),
    });
    const hardDocument = await hardDocumentApp.inject({
      method: "POST",
      url: "/schedule/publish",
      headers: { authorization: "Bearer owner-token" },
      payload: basePayload,
    });
    expect(hardDocument.statusCode).toBe(400);

    const staleApp = buildApp({
      contextResolver: { resolve: async () => resolvedContext },
      scheduleService: scheduleServiceMock({
        publish: async () => {
          throw rpcFailure({ message: "stale publication preview", code: "40001" });
        },
      }),
    });
    const stale = await staleApp.inject({
      method: "POST",
      url: "/schedule/publish",
      headers: { authorization: "Bearer owner-token" },
      payload: basePayload,
    });
    expect(stale.statusCode).toBe(409);
  });

  it("returns structured Schedule publish recovery results as conflicts", async () => {
    const documentConflict = {
      kind: "document_expiry" as const,
      employee_id: "51000000-0000-4000-8000-000000000002",
      employee_name: "Kim Nguyen",
      shift_id: "71000000-0000-4000-8000-000000000003",
      location_id: "11000000-0000-4000-8000-000000000001",
      location_name: "Main Dining",
      date: "2026-08-18",
      start_time: "10:00",
      end_time: "14:00",
      document_type_id: "72000000-0000-4000-8000-000000000001",
      requirement_id: "72000000-0000-4000-8000-000000000002",
      document_id: "72000000-0000-4000-8000-000000000003",
      document_title: "Food handler card",
      expiry_date: "2026-08-17",
      expiry_policy_version: 2,
      pending_document_id: "72000000-0000-4000-8000-000000000004",
      review_action: "review_document" as const,
      severity: "hard" as const,
      overrideable: false,
      warning_text: "Food handler card is expired and blocks scheduling.",
      conflict_fingerprint: "b".repeat(64),
    };
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
            documentConflict,
          ],
        }),
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/schedule/publish",
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
        expect.objectContaining({
          kind: "document_expiry",
          employee_name: "Kim Nguyen",
          pending_document_id: "72000000-0000-4000-8000-000000000004",
          review_action: "review_document",
          severity: "hard",
          overrideable: false,
        }),
      ],
    });
  });

  it("asks schedule.templates.read before listing Schedule templates", async () => {
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...resolvedContext,
          actions: resolvedContext.actions.filter(
            (action) => action !== "schedule.templates.read",
          ),
        }),
      },
      scheduleService: scheduleServiceMock(),
    });
    const response = await app.inject({
      method: "GET",
      url: "/schedule/templates",
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
            skipped: [],
            session: scheduleSessionMockModel(),
          };
        },
        previewTemplateApply: async (input) => {
          calls.push({ kind: "template-apply-preview", input });
          return { removed_shift_count: 10 };
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
      method: "DELETE",
      url: "/schedule/edit-lock/release",
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
    const templateApplyPreview = await app.inject({
      method: "POST",
      url: "/schedule/edit-sessions/87000000-0000-4000-8000-000000000001/template-apply-preview",
      headers: { authorization: "Bearer owner-token" },
      payload: {
        template_id: "88000000-0000-4000-8000-000000000002",
        department_keys: null,
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
    const bulkDelete = await app.inject({
      method: "POST",
      url: "/shifts/bulk-delete",
      headers: { authorization: "Bearer owner-token" },
      payload: { ids: ["81000000-0000-4000-8000-000000000001"] },
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
    expect(discard.statusCode).toBe(204);
    expect(deleteDraft.statusCode).toBe(200);
    expect(weeklyShifts.statusCode).toBe(200);
    // BL-206: the draft availability conflict list is gone.
    expect(availabilityConflicts.statusCode).toBe(404);
    expect(publicationStatus.statusCode).toBe(200);
    expect(pendingOps.statusCode).toBe(200);
    expect(addPendingOp.statusCode).toBe(201);
    expect(updatePendingOp.statusCode).toBe(200);
    expect(removePendingOp.statusCode).toBe(200);
    expect(template.statusCode).toBe(200);
    expect(unpublishPreview.statusCode).toBe(200);
    expect(applyTemplate.statusCode).toBe(200);
    expect(templateApplyPreview.statusCode).toBe(200);
    expect(templateApplyPreview.json()).toEqual({ removed_shift_count: 10 });
    expect(autoFillPreview.statusCode).toBe(200);
    expect(autoFillApply.statusCode).toBe(200);
    expect(bulkDelete.statusCode).toBe(200);
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
        kind: "template-apply-preview",
        input: {
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          sessionId: "87000000-0000-4000-8000-000000000001",
          templateId: "88000000-0000-4000-8000-000000000002",
          departmentKeys: null,
        },
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
        kind: "bulk-delete",
        input: {
          actorUserId: resolvedContext.userId,
          workspaceId: resolvedContext.workspace.id,
          shiftIds: ["81000000-0000-4000-8000-000000000001"],
        },
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
          updated_by_name: "Morgan Manager",
          shift_count: 0,
          paid_minutes: 0,
          open_shift_count: 0,
        },
      ],
      published: { shift_count: 0, paid_minutes: 0, open_shift_count: 0 },
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
    autosaveSession: async () => ({ status: "nothing_to_save", draft_id: null, draft_name: null }),
    undoSessionStep: async () => scheduleSessionMockModel(),
    deleteDraft: async (_actorUserId, _workspaceId, draftId) => ({
      status: "deleted",
      draft_id: draftId,
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
      unpublished_at: "2026-08-17T12:00:00.000Z",
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
      skipped: [],
      session: scheduleSessionMockModel(),
    }),
    previewTemplateApply: async () => ({ removed_shift_count: 0 }),
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
    listScheduledExportCronCandidates: async () => ({ schedules: [], unreadable: [] }),
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
        draft_shift_count: 1,
        published_at: "2026-08-17T12:00:00.000Z",
        published_by_name: null,
        source_draft_id: null,
        source_draft_name: null,
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
        changed_since_start: null,
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
    location_ids: ["11000000-0000-4000-8000-000000000001"],
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
    referenced_jobs: [],
    referenced_shift_types: [],
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
      assignments: { locations: [], jobs: [] },
      requirements: [],
    }),
    saveProfile: async () => 2,
    phoneInUse: async () => false,
    submit: async () => 2,
    leave: async () => ({
      status: "left",
      workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      employeeId: "fe201916-aa0e-480b-9144-1e1c8da20a31",
      membershipId: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
      revision: 2,
    }),
    getReview: async () => {
      throw new Error("not used");
    },
    review: async () => 2,
    ...overrides,
  };
}
