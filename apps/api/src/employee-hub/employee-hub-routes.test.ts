import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import type { EmployeeHubService } from "./employee-hub-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
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
    access: { employee: true, management: null },
    status: "active",
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
  };
}

describe("employee hub routes", () => {
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
      referenced_jobs: [],
      referenced_shift_types: [],
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
});
