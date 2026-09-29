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
// The owner's answer, taken from read_employee_references_service on the
// "r" world of supabase/tests/employee_references_ask_the_core.test.sql with
// the BL-218 .3a migration applied (rolled back): an archived location and
// job, Management with the Owner job under it, a custom role without system_key.
const answer = {
  jobs: [
    { id: "ae9f68ac-f2d1-46ad-b688-2cc2b25958cd", name: "Old", system_key: null, archived_at: "2026-09-29T01:34:58.259859+00:00", department_id: "b2ab1ea5-1a32-4f1c-8da8-6d6422205939" },
    { id: "285cb253-3c31-41c3-950a-74c93ded13fb", name: "Owner", system_key: "owner", archived_at: null, department_id: "893f064e-2952-49ae-80f7-cc5ab30e192a" },
    { id: "49f49836-56a9-49c9-ac67-7f469cc09e82", name: "Cook", system_key: null, archived_at: null, department_id: "b2ab1ea5-1a32-4f1c-8da8-6d6422205939" },
    { id: "2db26a83-cf59-40ae-90e3-ace6ed6583f9", name: "Server", system_key: null, archived_at: null, department_id: "b2ab1ea5-1a32-4f1c-8da8-6d6422205939" },
  ],
  locations: [
    { id: "525d0625-5580-410a-915d-5a6c9a2a8014", name: "Arnavutkoy", timezone: "Europe/Istanbul", archived_at: "2026-09-29T01:34:58.259859+00:00" },
    { id: "eddd6f15-289e-416a-8727-e4ce6bca5600", name: "Besiktas", timezone: "Europe/Istanbul", archived_at: null },
    { id: "e92f96de-3eb0-4203-a15c-aff6edfd4c39", name: "Kadikoy", timezone: "Europe/Istanbul", archived_at: null },
  ],
  departments: [
    { id: "893f064e-2952-49ae-80f7-cc5ab30e192a", name: "Management", system_key: "management", archived_at: null },
    { id: "b2ab1ea5-1a32-4f1c-8da8-6d6422205939", name: "Kitchen", system_key: null, archived_at: null },
  ],
  invite_roles: [
    { id: "ffb2b827-7762-40eb-a01e-3ce8d2cfe18c", name: "Admin", system_key: "admin", access_class: "admin" },
    { id: "b237e45a-49ca-4b0b-9a9e-8bcaeb096044", name: "Manager", system_key: "manager", access_class: "manager" },
    { id: "100f43c0-61dd-466a-b97c-fade55582aa7", name: "Employee", system_key: "employee", access_class: "employee" },
    { id: "f8bd7763-1616-4cc2-bb47-d64f9053f106", name: "lead", system_key: null, access_class: "manager" },
  ],
};
// A manager without employee_access.manage: their own location, no roles;
// departments have no location scope.
const managerAnswer = {
  jobs: answer.jobs,
  departments: answer.departments,
  locations: [answer.locations[2]!],
  invite_roles: [],
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

  it("hands the drawer each job's department and the Management and Owner keys (BL-218)", async () => {
    const rpc = vi.fn(async () => ({ data: answer, error: null }));
    const built = app(createEmployeeDirectoryServiceWithClient({ rpc }));
    const response = await get(built);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(answer);
    await built.close();
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
    rpc.mockResolvedValueOnce({ data: managerAnswer, error: null });
    expect(await service.references({ actorUserId: userId, workspaceId })).toEqual(managerAnswer);
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
