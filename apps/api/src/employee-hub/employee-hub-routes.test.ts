import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import type { EmployeeHubService } from "./employee-hub-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const locationId = "11000000-0000-4000-8000-000000000001";
const requestId = "98200000-0000-4000-8000-000000000001";

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
    role: "employee",
    status: "active",
    allLocations: true,
  },
  permissions: ["workspace.read"],
  actions: [],
  onboarding: { status: "complete", currentStep: 2, revision: 1 },
  documentAccess: { restricted: false },
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

function employeeHubServiceMock(): EmployeeHubService {
  return {
    getPersonalTasks: vi.fn(),
    changePersonalTask: vi.fn(),
    get: vi.fn(),
    getScheduleBoard: vi.fn(),
    submitTimeOff: vi.fn(),
    actOnRequest: vi.fn(),
  };
}

describe("employee hub routes", () => {
  it("binds cancellation to the authenticated actor and requires a safe retry key", async () => {
    const service = employeeHubServiceMock(); vi.mocked(service.actOnRequest).mockResolvedValue({ status: "pending", request_id: requestId, revision: 1 });
    const app = buildApp({ contextResolver: { resolve: async () => activeContext }, employeeHubService: service });
    const command = { request_id: requestId, kind: "time_off", action: "request_cancellation", expected_revision: 2, operation_id: requestId, reason: "Plans changed",
      periods: [{ segment_id: requestId, starts_at: "2035-01-15T09:00:00Z", ends_at: "2035-01-15T12:00:00Z" }] };
    const response = await app.inject({ method: "POST", url: `/v1/workspaces/${workspaceId}/employee-hub/request-action`, headers: { authorization: "Bearer token" }, payload: { ...command, actor: otherWorkspaceId, workspace_id: otherWorkspaceId } });
    expect(response.statusCode).toBe(200);
    expect(service.actOnRequest).toHaveBeenCalledWith({ actorUserId: userId, workspaceId, action: command });
    const invalid = await app.inject({ method: "POST", url: `/v1/workspaces/${workspaceId}/employee-hub/request-action`, headers: { authorization: "Bearer token" }, payload: { ...command, operation_id: undefined } });
    expect(invalid.statusCode).toBe(400); expect(service.actOnRequest).toHaveBeenCalledTimes(1); await app.close();
  });
  it("binds the schedule board to the authenticated actor and requires a calendar date", async () => {
    const service = employeeHubServiceMock();
    vi.mocked(service.getScheduleBoard).mockResolvedValue({
      workspace_id: workspaceId,
      week_start: "2035-01-15",
      week_start_day: "monday",
      settings: { time_format: "12h" },
      locations: [],
      departments: [],
      jobs: [],
      shift_types: [],
      employees: [],
      shifts: [],
      closures: [],
      important_dates: [],
    });
    const app = buildApp({
      contextResolver: { resolve: async () => activeContext },
      employeeHubService: service,
    });
    const url = `/v1/workspaces/${workspaceId}/employee-hub/schedule`;
    const headers = { authorization: "Bearer test" };
    try {
      expect(
        (await app.inject({ method: "GET", url: `${url}?date=2035-01-15`, headers }))
          .statusCode,
      ).toBe(200);
      expect(service.getScheduleBoard).toHaveBeenCalledWith({
        actorUserId: userId,
        workspaceId,
        targetDate: "2035-01-15",
      });
      expect(
        (await app.inject({ method: "GET", url, headers })).statusCode,
      ).toBe(400);
      expect(service.getScheduleBoard).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
  it("binds personal tasks to the authenticated actor and rejects spoofed ownership", async () => {
    const service = employeeHubServiceMock();
    vi.mocked(service.getPersonalTasks).mockResolvedValue([]);
    vi.mocked(service.changePersonalTask).mockResolvedValue([]);
    const app = buildApp({
      contextResolver: { resolve: async () => activeContext },
      employeeHubService: service,
    });
    const url = `/v1/workspaces/${workspaceId}/employee-hub/personal-tasks`;
    const headers = { authorization: "Bearer test" };
    try {
      expect(
        (await app.inject({ method: "GET", url, headers })).statusCode,
      ).toBe(200);
      expect(service.getPersonalTasks).toHaveBeenCalledWith({
        actorUserId: userId,
        workspaceId,
      });
      const task = { action: "create", id: requestId, title: "My reminder" };
      expect(
        (await app.inject({ method: "POST", url, headers, payload: task }))
          .statusCode,
      ).toBe(200);
      expect(service.changePersonalTask).toHaveBeenCalledWith({
        actorUserId: userId,
        workspaceId,
        task,
      });
      expect(
        (
          await app.inject({
            method: "POST",
            url,
            headers,
            payload: { ...task, user_id: "another-user" },
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await app.close();
    }
  });
  it("returns generic not found for every route when the active workspace context mismatches the path", async () => {
    const service = employeeHubServiceMock();
    const app = buildApp({
      contextResolver: { resolve: async () => mismatchedContext },
      employeeHubService: service,
    });
    const routes = [
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/employee-hub/personal-tasks`,
        serviceMethod: "getPersonalTasks",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/employee-hub/personal-tasks`,
        payload: { action: "create", id: requestId, title: "Reminder" },
        serviceMethod: "changePersonalTask",
      },
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/employee-hub?from=2026-08-17&to=2026-09-28`,
        serviceMethod: "get",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/employee-hub/time-off`,
        payload: {
          location_id: locationId,
          reason: "Family event",
          dates: ["2026-08-20"],
        },
        serviceMethod: "submitTimeOff",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/employee-hub/request-action`,
        payload: {
          request_id: requestId,
          kind: "time_off",
          action: "cancel",
          expected_revision: 1,
        },
        serviceMethod: "actOnRequest",
      },
    ] as const;

    for (const route of routes) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: { authorization: "Bearer valid-token" },
        payload: "payload" in route ? route.payload : undefined,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Workspace not found" });
      for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
    }
  });

  it("ignores spoofed actor and workspace fields in write bodies", async () => {
    const service = employeeHubServiceMock();
    const mutationResult = { status: "saved", revision: 1 };
    vi.mocked(service.submitTimeOff).mockResolvedValue({
      ...mutationResult,
      request_id: requestId,
    });
    vi.mocked(service.actOnRequest).mockResolvedValue(mutationResult);
    const app = buildApp({
      contextResolver: { resolve: async () => activeContext },
      employeeHubService: service,
    });
    const spoofedIdentity = {
      actorUserId: "11111111-1111-4111-8111-111111111111",
      actor_user_id: "11111111-1111-4111-8111-111111111111",
      userId: "11111111-1111-4111-8111-111111111111",
      workspaceId: otherWorkspaceId,
      workspace_id: otherWorkspaceId,
    };
    const timeOff = {
      ...spoofedIdentity,
      location_id: locationId,
      reason: "Family event",
      dates: ["2026-08-20"],
    };
    const requestAction = {
      ...spoofedIdentity,
      request_id: requestId,
      kind: "time_off",
      action: "cancel",
      expected_revision: 1,
    };

    const requests = [
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/employee-hub/time-off`,
        payload: timeOff,
        expectedStatus: 200,
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/employee-hub/request-action`,
        payload: requestAction,
        expectedStatus: 200,
      },
    ] as const;

    for (const request of requests) {
      const response = await app.inject({
        method: request.method,
        url: request.url,
        headers: { authorization: "Bearer valid-token" },
        payload: request.payload,
      });
      expect(response.statusCode).toBe(request.expectedStatus);
    }

    expect(service).not.toHaveProperty("saveAvailability");
    expect(service.submitTimeOff).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      request: {
        location_id: timeOff.location_id,
        reason: timeOff.reason,
        dates: timeOff.dates,
      },
    });
    expect(service.actOnRequest).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      action: {
        request_id: requestAction.request_id,
        kind: requestAction.kind,
        action: requestAction.action,
        expected_revision: requestAction.expected_revision,
      },
    });
  });
});
