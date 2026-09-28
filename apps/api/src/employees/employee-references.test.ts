import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import { rpcFailure } from "../http-error";
import {
  createEmployeeDirectoryServiceWithClient,
  type EmployeeDirectoryService,
} from "./employee-directory-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const context = {
  userId,
  workspace: { id: workspaceId, name: "Meyhouse" },
  membership: { role: "manager", status: "active" },
  permissions: [],
  actions: [],
} as unknown as ActiveWorkspaceContext;
const answer = {
  locations: [
    { id: "10000000-0000-4000-8000-000000000001", name: "Kadikoy", archived_at: null, timezone: "America/New_York" },
  ],
  jobs: [{ id: "33000000-0000-4000-8000-000000000001", name: "Server", archived_at: "2026-09-01T10:00:00+00:00" }],
  invite_roles: [
    { id: "44000000-0000-4000-8000-000000000001", name: "Employee", system_key: "employee", access_class: "employee" },
  ],
};

function app(service: EmployeeDirectoryService, resolved: ActiveWorkspaceContext | null = context) {
  return buildApp({ employeeDirectoryService: service, contextResolver: { resolve: async () => resolved } });
}
function get(built: ReturnType<typeof app>, id = workspaceId) {
  return built.inject({
    method: "GET",
    url: `/v1/workspaces/${id}/employees/reference-data`,
    headers: { authorization: "Bearer valid-token" },
  });
}
const refusal = (hint: string) =>
  rpcFailure({ code: "42501", message: "Not allowed", hint, details: "employee.references.read" });

describe("Employees reference data (BL-231)", () => {
  it("reads through the service as the signed-in person", async () => {
    const references = vi.fn(async () => answer);
    const built = app({ references } as unknown as EmployeeDirectoryService);
    const response = await get(built);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(answer);
    expect(references).toHaveBeenCalledExactlyOnceWith({ actorUserId: userId, workspaceId });
    await built.close();
  });

  it("answers the core's no with 403 and its reason", async () => {
    const references = vi.fn(async () => {
      throw refusal("authz.out_of_scope");
    });
    const built = app({ references } as unknown as EmployeeDirectoryService);
    const response = await get(built);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.out_of_scope", detail: "employee.references.read" });
    await built.close();
  });

  it("answers somebody who is not a member with 404, from the resolver or the core", async () => {
    const references = vi.fn(async () => {
      throw refusal("authz.not_member");
    });
    for (const built of [
      app({ references } as unknown as EmployeeDirectoryService),
      app({ references } as unknown as EmployeeDirectoryService, null),
    ]) {
      const response = await get(built);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ reason: "authz.not_member" });
      await built.close();
    }
  });

  it("refuses a malformed workspace id before asking anybody", async () => {
    const references = vi.fn();
    const built = app({ references } as unknown as EmployeeDirectoryService);
    expect((await get(built, "not-a-uuid")).statusCode).toBe(400);
    expect(references).not.toHaveBeenCalled();
    await built.close();
  });
});

describe("Employees reference data service (BL-231)", () => {
  it("calls its service function and parses the contract", async () => {
    const rpc = vi.fn(async () => ({ data: answer, error: null }));
    const service = createEmployeeDirectoryServiceWithClient({ rpc });
    expect(await service.references({ actorUserId: userId, workspaceId })).toEqual(answer);
    expect(rpc).toHaveBeenCalledWith("read_employee_references_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
    });
  });

  it("turns the core's refusal into an HttpError carrying the reason", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "42501", message: "Not allowed", hint: "authz.missing_permission", details: "employee.references.read" },
    }));
    const service = createEmployeeDirectoryServiceWithClient({ rpc });
    await expect(service.references({ actorUserId: userId, workspaceId })).rejects.toMatchObject({
      statusCode: 403,
      reason: "authz.missing_permission",
    });
  });

  it("rejects an answer that breaks the contract", async () => {
    const rpc = vi.fn(async () => ({ data: { locations: [], jobs: [] }, error: null }));
    const service = createEmployeeDirectoryServiceWithClient({ rpc });
    await expect(service.references({ actorUserId: userId, workspaceId })).rejects.toThrow();
  });
});
