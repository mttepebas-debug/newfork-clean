import { managementAndOwnerRefusals, type ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import { HttpError } from "../http-error";
import {
  createEmployeeDirectoryServiceWithClient,
  type EmployeeDirectoryService,
} from "./employee-directory-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "16fe2550-8960-480c-9874-cbc76a8e56a9";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const employeeId = "15000000-0000-4000-8000-000000000001";
const otherEmployeeId = "15000000-0000-4000-8000-000000000002";

const context: ActiveWorkspaceContext = {
  userId,
  workspace: {
    id: workspaceId,
    name: "Meyhouse",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
  membership: {
    id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
    userId,
    workspaceId,
    role: "owner",
    status: "active",
    allLocations: true,
  },
  permissions: ["employees.read", "employees.manage", "employees.archive"],
  actions: [],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
};

const employeeInput = {
  first_name: "Ada",
  last_name: "Lovelace",
  preferred_name: "Ada",
  invitation_email: "ada@example.test",
  start_date: "2026-08-20",
  internal_note: "Opening team",
  location_ids: ["11000000-0000-4000-8000-000000000001"],
  primary_location_id: "11000000-0000-4000-8000-000000000001",
  job_ids: ["33000000-0000-4000-8000-000000000001"],
  primary_job_id: "33000000-0000-4000-8000-000000000001",
  expected_revision: null,
};
const spoofedIdentity = {
  actorUserId: "11111111-1111-4111-8111-111111111111",
  actor_user_id: "11111111-1111-4111-8111-111111111111",
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: otherWorkspaceId,
  workspace_id: otherWorkspaceId,
  employeeId: otherEmployeeId,
  employee_id: otherEmployeeId,
};

describe("employee directory routes", () => {
  it("creates through a stable command without accepting spoofed identity", async () => {
    const create = vi.fn(async () => ({ id: employeeId, invitation: null }));
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      employeeCreateService: { create },
    });
    const command = {
      request_id: "91000000-0000-4000-8000-000000000001",
      employee: employeeInput,
      invite_role_id: null,
    };
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/employees/create`,
      headers: { authorization: "Bearer valid-token" },
      payload: { ...command, ...spoofedIdentity },
    });
    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(userId, workspaceId, command);
    await app.close();
  });
  it("requires access management only when the create command includes an invitation", async () => {
    const create = vi.fn();
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      employeeCreateService: { create },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/employees/create`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        request_id: "91000000-0000-4000-8000-000000000001",
        employee: employeeInput,
        invite_role_id: "92000000-0000-4000-8000-000000000001",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(create).not.toHaveBeenCalled();
    await app.close();
  });
  it("forwards employee directory reads through the authenticated API boundary", async () => {
    const list = vi.fn(async () => []);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      employeeDirectoryService: {
        list,
      } as unknown as EmployeeDirectoryService,
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/employees?archived=false&search=ada&status=active`,
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      archived: false,
      search: "ada",
      status: "active",
    });
  });

  it("forwards employee saves without accepting actor or workspace from the body", async () => {
    const save = vi.fn(async () => employeeId);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      employeeDirectoryService: {
        save,
      } as unknown as EmployeeDirectoryService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/employees`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        ...employeeInput,
        ...spoofedIdentity,
      },
    });

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toEqual({ id: employeeId });
    expect(save).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      employee: employeeInput,
    });
  });

  it("allows initial employee creation while owner onboarding is incomplete", async () => {
    const save = vi.fn(async () => employeeId);
    const incompleteContext = {
      ...context,
      onboarding: { status: "incomplete", currentStep: 4 },
    } satisfies ActiveWorkspaceContext;
    const app = buildApp({
      contextResolver: { resolve: async () => incompleteContext },
      employeeDirectoryService: {
        save,
        list: vi.fn(async () => []),
      } as unknown as EmployeeDirectoryService,
    });

    const created = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/employees`,
      headers: { authorization: "Bearer valid-token" },
      payload: employeeInput,
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(save).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      employee: employeeInput,
    });
  });

  it("requires archive permission before terminating an employee", async () => {
    const terminate = vi.fn();
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...context,
          permissions: ["employees.read", "employees.manage"],
        }),
      },
      employeeDirectoryService: {
        terminate,
      } as unknown as EmployeeDirectoryService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/employees/${employeeId}/termination`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        effectiveLocal: "2026-09-02T09:00",
        worksiteTimezone: "America/Los_Angeles",
        reason: "Seasonal role ended",
        idempotencyKey: "a6200000-0000-4000-8000-000000000001",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(terminate).not.toHaveBeenCalled();
  });

  it("forwards linked employee role updates through the access permission boundary", async () => {
    const updateRole = vi.fn(async () => undefined);
    const roleId = "26000000-0000-4000-8000-000000000002";
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...context,
          permissions: [...context.permissions, "employee_access.manage"],
        }),
      },
      employeeDirectoryService: {
        updateRole,
      } as unknown as EmployeeDirectoryService,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/employees/${employeeId}/role`,
      headers: { authorization: "Bearer valid-token" },
      payload: { ...spoofedIdentity, role_id: roleId },
    });

    expect(response.statusCode, response.body).toBe(204);
    expect(updateRole).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      employeeId,
      role: { role_id: roleId },
    });
  });

  it("forwards employee updates and lifecycle actions from path and context identity", async () => {
    const save = vi.fn(async () => employeeId);
    const setArchived = vi.fn(async () => undefined);
    const terminate = vi.fn(async () => ({
      terminationId: "56000000-0000-4000-8000-000000000001",
      effectiveAt: "2026-09-02T16:00:00.000Z",
      releasedShiftCount: 0,
      idempotentReplay: false,
    }));
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      employeeDirectoryService: {
        save,
        setArchived,
        terminate,
      } as unknown as EmployeeDirectoryService,
    });
    const termination = {
      ...spoofedIdentity,
      effectiveLocal: "2026-09-02T09:00",
      worksiteTimezone: "America/Los_Angeles",
      reason: "Seasonal role ended",
      idempotencyKey: "a6200000-0000-4000-8000-000000000001",
    } as const;

    const updateResponse = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/employees/${employeeId}`,
      headers: { authorization: "Bearer valid-token" },
      payload: { ...employeeInput, ...spoofedIdentity },
    });
    const archiveResponse = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/employees/${employeeId}/archive`,
      headers: { authorization: "Bearer valid-token" },
      payload: { ...spoofedIdentity, archived: true, restoreAccess: false },
    });
    const terminateResponse = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/employees/${employeeId}/termination`,
      headers: { authorization: "Bearer valid-token" },
      payload: termination,
    });

    expect(updateResponse.statusCode, updateResponse.body).toBe(200);
    expect(archiveResponse.statusCode, archiveResponse.body).toBe(204);
    expect(terminateResponse.statusCode, terminateResponse.body).toBe(200);
    expect(save).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      employeeId,
      employee: employeeInput,
    });
    expect(setArchived).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      employeeId,
      archived: true,
      restoreAccess: false,
    });
    expect(terminate).toHaveBeenCalledWith({
      actorUserId: userId,
      workspaceId,
      employeeId,
      termination: {
        effectiveLocal: termination.effectiveLocal,
        worksiteTimezone: termination.worksiteTimezone,
        reason: termination.reason,
        idempotencyKey: termination.idempotencyKey,
      },
    });
  });

  it("does not call the service when the active workspace context mismatches the path", async () => {
    const list = vi.fn(async () => []);
    const get = vi.fn(async () => ({ id: employeeId }));
    const save = vi.fn(async () => employeeId);
    const updateRole = vi.fn(async () => undefined);
    const setArchived = vi.fn(async () => undefined);
    const terminate = vi.fn(async () => ({
      terminationId: "56000000-0000-4000-8000-000000000001",
      effectiveAt: "2026-09-02T16:00:00.000Z",
      releasedShiftCount: 0,
      idempotentReplay: false,
    }));
    const service = {
      list,
      get,
      save,
      updateRole,
      setArchived,
      terminate,
    } as unknown as EmployeeDirectoryService;
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...context,
          workspace: {
            ...context.workspace,
            id: otherWorkspaceId,
          },
          membership: {
            ...context.membership,
            workspaceId: otherWorkspaceId,
          },
          permissions: [...context.permissions, "employee_access.manage"],
        }),
      },
      employeeDirectoryService: service,
    });

    const requests = [
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/employees`,
      },
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/employees/${employeeId}`,
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/employees`,
        payload: employeeInput,
      },
      {
        method: "PUT",
        url: `/v1/workspaces/${workspaceId}/employees/${employeeId}`,
        payload: employeeInput,
      },
      {
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/employees/${employeeId}/role`,
        payload: {
          role_id: "26000000-0000-4000-8000-000000000002",
        },
      },
      {
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/employees/${employeeId}/archive`,
        payload: { archived: true, restoreAccess: false },
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/employees/${employeeId}/termination`,
        payload: {
          effectiveLocal: "2026-09-02T09:00",
          worksiteTimezone: "America/Los_Angeles",
          reason: "Seasonal role ended",
          idempotencyKey: "a6200000-0000-4000-8000-000000000001",
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
      expect(response.json()).toMatchObject({ error: "Workspace not found" });
    }

    expect(list).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(updateRole).not.toHaveBeenCalled();
    expect(setArchived).not.toHaveBeenCalled();
    expect(terminate).not.toHaveBeenCalled();
  });

  it.each([
    ["employee.owner_job", "The owner keeps the Owner job"],
    ["employee.management_primary", "A Management job is primary by its department and is not marked primary"],
    ["employee.owner_locations", "The owner works at every location"],
    ["employee.location_required", "employee requires a location and job unless remote or excluded from schedule"],
    ["employee.job_required", "employee requires a location and job unless remote or excluded from schedule"],
    ["employee.primary_job_required", "employee requires a primary job outside Management"],
  ] as const)("answers the save's %s refusal with 400, its key and a readable sentence (BL-218)", async (hint, raised) => {
    const code = hint.endsWith("_required") ? "22023" : "23514";
    const rpc = vi.fn(async () => ({ data: null, error: { code, message: raised, hint } }));
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
    });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/employees/${employeeId}`,
      headers: { authorization: "Bearer valid-token" },
      payload: employeeInput,
    });
    expect(rpc).toHaveBeenCalledWith("save_employee_service", expect.anything());
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: managementAndOwnerRefusals[hint], reason: hint, requestId: expect.any(String) });
    await app.close();
  });

  it("hands a save with no primary job to the database, which decides (BL-218 .3b)", async () => {
    const save = vi.fn(async () => employeeId);
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      employeeDirectoryService: { save } as unknown as EmployeeDirectoryService,
    });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/employees/${employeeId}`,
      headers: { authorization: "Bearer valid-token" },
      payload: { ...employeeInput, primary_job_id: null },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ employee: { ...employeeInput, primary_job_id: null } }));
    await app.close();
  });

  it("keeps a create's refusal key and sentence on the way out (BL-218)", async () => {
    const sentence = managementAndOwnerRefusals["employee.management_primary"];
    const create = vi.fn(async () => {
      throw new HttpError(sentence, 400, { reason: "employee.management_primary" });
    });
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      employeeCreateService: { create },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/employees/create`,
      headers: { authorization: "Bearer valid-token" },
      payload: { request_id: "91000000-0000-4000-8000-000000000001", employee: employeeInput, invite_role_id: null },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: sentence, reason: "employee.management_primary", requestId: expect.any(String) });
    await app.close();
  });

  // FB-6.2 .7a: reading and listing ask the authorization core in the database
  // (T5a); the route keeps no permission gate of its own. The core's "no"
  // reaches the screen with its reason: authz.not_member 404, other authz.* 403.
  describe("reads ask the core", () => {
    const reads = [
      ["list", "list_employees_service", `/v1/workspaces/${workspaceId}/employees`],
      ["detail", "get_employee_detail_service", `/v1/workspaces/${workspaceId}/employees/${employeeId}`],
      ["photo", "get_employee_avatar_path_service", `/v1/workspaces/${workspaceId}/employees/${employeeId}/avatar`],
    ] as const;
    const noPermissions = { ...context, permissions: ["workspace.read"] as ActiveWorkspaceContext["permissions"] };

    it.each(reads)("hands the %s read to the database even without the permission key", async (_name, rpcName, url) => {
      const rpc = vi.fn(async () => ({
        data: null,
        error: { code: "42501", message: "Not allowed", hint: "authz.missing_permission", details: "employee.read" },
      }));
      const app = buildApp({
        contextResolver: { resolve: async () => noPermissions },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const response = await app.inject({ method: "GET", url, headers: { authorization: "Bearer valid-token" } });
      expect(rpc).toHaveBeenCalledWith(rpcName, expect.objectContaining({ actor_user_id: userId, target_workspace_id: workspaceId }));
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ reason: "authz.missing_permission" });
      await app.close();
    });

    it.each(reads)("answers a person out of reach on the %s read with 403 authz.out_of_scope", async (_name, _rpcName, url) => {
      const rpc = vi.fn(async () => ({
        data: null,
        error: { code: "42501", message: "Not allowed", hint: "authz.out_of_scope", details: "employee.read" },
      }));
      const app = buildApp({
        contextResolver: { resolve: async () => context },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const response = await app.inject({ method: "GET", url, headers: { authorization: "Bearer valid-token" } });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ reason: "authz.out_of_scope", detail: "employee.read" });
      await app.close();
    });

    it.each(reads)("answers somebody who is not a member on the %s read with 404 authz.not_member", async (_name, _rpcName, url) => {
      const rpc = vi.fn();
      const app = buildApp({
        contextResolver: { resolve: async () => null },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const response = await app.inject({ method: "GET", url, headers: { authorization: "Bearer valid-token" } });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ reason: "authz.not_member" });
      expect(rpc).not.toHaveBeenCalled();
      await app.close();
    });

    it("answers a bad employee id with 400 before asking anybody", async () => {
      const rpc = vi.fn();
      const app = buildApp({
        contextResolver: { resolve: async () => context },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const response = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/employees/not-a-uuid`,
        headers: { authorization: "Bearer valid-token" },
      });
      expect(response.statusCode).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
