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
// "r" world of supabase/tests/employee_references_ask_the_core.test.sql
// (rolled back): an archived location and job, a custom role without system_key.
const answer = {
  jobs: [
    { id: "88186637-6539-4ddf-8a2b-a10b641afcff", name: "Cook", archived_at: null },
    { id: "4d10b47f-58a8-401d-a4bb-92fec24a1819", name: "Old", archived_at: "2026-09-28T05:03:02.777745+00:00" },
    { id: "c1f5b9ca-76a2-4230-b4bd-b53998ffd380", name: "Server", archived_at: null },
  ],
  locations: [
    { id: "102dbed5-c14c-4b58-9ed0-c943cad3c9f5", name: "Arnavutkoy", timezone: "Europe/Istanbul", archived_at: "2026-09-28T05:03:02.777745+00:00" },
    { id: "7bf57f91-6d31-4085-ab65-1a0341fe0933", name: "Besiktas", timezone: "Europe/Istanbul", archived_at: null },
    { id: "01793040-e611-47d7-8b30-e04663faac46", name: "Kadikoy", timezone: "Europe/Istanbul", archived_at: null },
  ],
  invite_roles: [
    { id: "0e49ab84-f0ae-4f4a-8213-dfeb62381dd3", name: "Admin", system_key: "admin", access_class: "admin" },
    { id: "39627693-613f-4a88-aeb5-175e3582cfe9", name: "Manager", system_key: "manager", access_class: "manager" },
    { id: "8c3c39d9-6695-448a-bff6-b91ef8f7cccf", name: "Employee", system_key: "employee", access_class: "employee" },
    { id: "1cf1ccb7-a238-4190-bb3a-41401f0f2f1d", name: "lead", system_key: null, access_class: "manager" },
  ],
};
// A manager without employee_access.manage: their own location, no roles.
const managerAnswer = {
  jobs: answer.jobs,
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
