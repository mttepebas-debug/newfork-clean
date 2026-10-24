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
const locationId = "11000000-0000-4000-8000-000000000001";

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
    access: { employee: false, management: "owner" },
    status: "active",
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
      invite_access: null,
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
  // FB-6.2 .7b (BL-414): creating somebody, with or without an invitation,
  // asks the core in the database (employee.create at the record's locations,
  // can_invite_with_role for the role); the route keeps no permission gate.
  describe("creating asks the core", () => {
    const manager = {
      ...context,
      membership: { ...context.membership, access: { employee: false, management: "manager" },},
      permissions: ["workspace.read", "employees.read"] as ActiveWorkspaceContext["permissions"],
      locationScope: { allLocations: false, locationIds: [] },
    } satisfies ActiveWorkspaceContext;
    const command = {
      request_id: "91000000-0000-4000-8000-000000000001",
      employee: employeeInput,
      invite_access: {
        employee_role_id: "92000000-0000-4000-8000-000000000001",
        management_role_id: null,
        managed_location_ids: [],
      },
    };

    it("hands a create with an invitation to the database without the access permission", async () => {
      const create = vi.fn(async () => ({ id: employeeId, invitation: null }));
      const app = buildApp({
        contextResolver: { resolve: async () => manager },
        employeeCreateService: { create },
      });
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/employees/create`,
        headers: { authorization: "Bearer valid-token" },
        payload: command,
      });
      expect(response.statusCode, response.body).toBe(201);
      expect(create).toHaveBeenCalledWith(userId, workspaceId, command);
      await app.close();
    });

    it.each([
      ["create command", `/v1/workspaces/${workspaceId}/employees/create`, command],
      ["new record", `/v1/workspaces/${workspaceId}/employees`, employeeInput],
    ] as const)("answers the core's rank refusal on the %s with 403 and its reason", async (_name, url, payload) => {
      const refusal = new HttpError("Not allowed", 403, { reason: "authz.rank", detail: "employee.invite" });
      const app = buildApp({
        contextResolver: { resolve: async () => manager },
        employeeCreateService: { create: vi.fn(async () => { throw refusal; }) },
        employeeDirectoryService: { save: vi.fn(async () => { throw refusal; }) } as unknown as EmployeeDirectoryService,
      });
      const response = await app.inject({ method: "POST", url, headers: { authorization: "Bearer valid-token" }, payload });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ reason: "authz.rank" });
      await app.close();
    });

    it.each([
      ["create command", `/v1/workspaces/${workspaceId}/employees/create`, command],
      ["new record", `/v1/workspaces/${workspaceId}/employees`, employeeInput],
    ] as const)("answers somebody who is not a member on the %s with 404 authz.not_member", async (_name, url, payload) => {
      const create = vi.fn();
      const app = buildApp({
        contextResolver: { resolve: async () => null },
        employeeCreateService: { create },
      });
      const response = await app.inject({ method: "POST", url, headers: { authorization: "Bearer valid-token" }, payload });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ reason: "authz.not_member" });
      expect(create).not.toHaveBeenCalled();
      await app.close();
    });
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

  // DAVET-ERISIM: the membership-role route is gone; access changes through
  // PATCH .../access, an invitation's through PATCH .../invitations.
  it("no longer has a linked-employee role route", async () => {
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...context,
          permissions: [...context.permissions, "employee_access.manage"],
        }),
      },
      employeeDirectoryService: {} as unknown as EmployeeDirectoryService,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/employees/${employeeId}/role`,
      headers: { authorization: "Bearer valid-token" },
      payload: { role_id: "26000000-0000-4000-8000-000000000002" },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
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
    expect(setArchived).not.toHaveBeenCalled();
    expect(terminate).not.toHaveBeenCalled();
  });

  it.each([
    ["employee.owner_job", "The owner keeps the Owner job"],
    ["employee.management_primary", "The Owner job is never marked primary"],
    ["employee.owner_locations", "The owner works at every location"],
    ["employee.location_required", "employee requires a location and job unless remote or excluded from schedule"],
    ["employee.job_required", "employee requires a location and job unless remote or excluded from schedule"],
    ["employee.primary_job_required", "employee requires a primary job unless remote or excluded from schedule"],
    ["employee.manager_location_required", "a manager needs a location to manage"],
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

  // EMP-LIMIT (P09): a workspace past one page of people lists every one of
  // them; the database hands out at most 200 a call.
  // A page shorter than asked is not the end: the database's cap could shrink.
  it.each([[450, 200], [400, 200], [450, 100]])("lists all %i employees when the database hands out %i a call", async (count, cap) => {
    const people = Array.from({ length: count }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      workspace_id: workspaceId, employee_code: `E-${String(1000 + index)}`,
      first_name: "Person", last_name: `No ${index}`, preferred_name: "", display_name: `Person No ${index}`,
      invitation_email: null, start_date: null, locations: [], primary_job_id: null, primary_job_name: null, job_count: 0, management_access: false, employee_access: false,
      display_status: "active", archived_at: null, revision: 1,
    }));
    const rpc = vi.fn(async (_name: string, args: { page_limit: number; page_offset: number; search_text: string }) => ({
      data: people.slice(args.page_offset, args.page_offset + Math.min(args.page_limit, cap)), error: null,
    }));
    const app = buildApp({
      contextResolver: { resolve: async () => context },
      employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/employees`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().map((person: { id: string }) => person.id)).toEqual(people.map((person) => person.id));
    expect(rpc.mock.calls.every(([, args]) => args.search_text === "")).toBe(true);
    await app.close();
  });

  // KARARLAR S-256: the list's tabs are All · Needs you · Joining · Active.
  // Needs you is who sent their onboarding in (needs_attention); Joining is
  // everybody on the way in: not invited (an invitation that ran out too),
  // invited, onboarding, and asked for changes. A database from before the
  // changes_requested status says needs_attention for them; nothing breaks.
  describe("the list's tabs (S-256)", () => {
    const person = (index: number, display_status: string) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      workspace_id: workspaceId, employee_code: `E-${String(1000 + index)}`,
      first_name: "Person", last_name: `No ${index}`, preferred_name: "", display_name: `Person No ${index}`,
      invitation_email: null, start_date: null, locations: [], primary_job_id: null, primary_job_name: null, job_count: 0,
      management_access: false, employee_access: false, display_status, archived_at: null, revision: 1,
    });
    const everybody = ["active", "needs_attention", "changes_requested", "onboarding", "invited", "not_invited"].map(
      (status, index) => person(index, status),
    );
    const listed = async (tab: string) => {
      const rpc = vi.fn(async (_name: string, args: { status_filter: string; page_offset: number }) => ({
        data: args.page_offset > 0 ? []
          : everybody.filter((row) => args.status_filter === "all" || row.display_status === args.status_filter),
        error: null,
      }));
      const app = buildApp({
        contextResolver: { resolve: async () => context },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const response = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/employees?status=${tab}`,
        headers: { authorization: "Bearer valid-token" },
      });
      await app.close();
      expect(response.statusCode, response.body).toBe(200);
      return {
        statuses: response.json().map((row: { display_status: string }) => row.display_status),
        filters: [...new Set(rpc.mock.calls.map(([, args]) => args.status_filter))],
      };
    };

    it("Needs you asks the database for who sent their onboarding in", async () => {
      expect(await listed("needs_you")).toEqual({ statuses: ["needs_attention"], filters: ["needs_attention"] });
    });

    it("Joining lists everybody on the way in, in one read of the list", async () => {
      expect(await listed("joining")).toEqual({
        statuses: ["changes_requested", "onboarding", "invited", "not_invited"],
        filters: ["all"],
      });
    });

    it("keeps one status as it was asked for (Active, an old link's Invited)", async () => {
      expect(await listed("active")).toEqual({ statuses: ["active"], filters: ["active"] });
      expect(await listed("invited")).toEqual({ statuses: ["invited"], filters: ["invited"] });
    });
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
      payload: { request_id: "91000000-0000-4000-8000-000000000001", employee: employeeInput, invite_access: null },
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
      ["photo", "get_member_avatar_service", `/v1/workspaces/${workspaceId}/employees/${employeeId}/avatar`],
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

  // FB-6.2 .7a (KK-31 S3): the record's writes ask the core in the database;
  // the route keeps no permission gate. A rank or scope refusal reaches the
  // drawer as 403 with its reason, never "Employee management required".
  describe("writes ask the core", () => {
    const termination = {
      effectiveLocal: "2026-09-02T09:00",
      worksiteTimezone: "America/Los_Angeles",
      reason: "Seasonal role ended",
      idempotencyKey: "a6200000-0000-4000-8000-000000000001",
    };
    const accessChange = {
      employee_role_id: null,
      management_role_id: "26000000-0000-4000-8000-000000000002",
      managed_location_ids: [locationId],
      management_job_ids: ["26000000-0000-4000-8000-000000000021"],
      expected_impact: { shifts_opened: 3, requests_closed: 1, applications_closed: 1, time_off_withdrawn: 1, availability_deleted: true },
    };
    const writes = [
      ["save", "save_employee_service", "PUT", `/v1/workspaces/${workspaceId}/employees/${employeeId}`, employeeInput],
      ["access change preview", "preview_employee_access_change_service", "POST", `/v1/workspaces/${workspaceId}/employees/${employeeId}/access/preview`, { employee_role_id: null, management_role_id: "26000000-0000-4000-8000-000000000002" }],
      ["access change", "change_employee_access_service", "PATCH", `/v1/workspaces/${workspaceId}/employees/${employeeId}/access`, accessChange],
      ["archive", "set_employee_archived_service", "PATCH", `/v1/workspaces/${workspaceId}/employees/${employeeId}/archive`, { archived: true, restoreAccess: false }],
      ["termination", "terminate_employee_service", "POST", `/v1/workspaces/${workspaceId}/employees/${employeeId}/termination`, termination],
      ["access removal", "remove_employee_access_service", "DELETE", `/v1/workspaces/${workspaceId}/employees/${employeeId}/access`, undefined],
      ["photo removal", "remove_member_photo_service", "DELETE", `/v1/workspaces/${workspaceId}/employees/${employeeId}/avatar`, undefined],
      ["removal from a location", "remove_employee_from_location_service", "DELETE", `/v1/workspaces/${workspaceId}/employees/${employeeId}/locations/${locationId}`, undefined],
    ] as const;
    const noPermissions = { ...context, permissions: ["workspace.read"] as ActiveWorkspaceContext["permissions"] };

    it.each(writes)("hands the %s to the database, whose rank refusal answers 403 with its reason", async (_name, rpcName, method, url, payload) => {
      const rpc = vi.fn(async () => ({
        data: null,
        error: { code: "42501", message: "Not allowed", hint: "authz.rank", details: "employee.save" },
      }));
      const app = buildApp({
        contextResolver: { resolve: async () => noPermissions },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const response = await app.inject({ method, url, headers: { authorization: "Bearer valid-token" }, payload });
      expect(rpc).toHaveBeenCalledWith(rpcName, expect.objectContaining({ actor_user_id: userId, target_workspace_id: workspaceId, target_employee_id: employeeId }));
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ reason: "authz.rank" });
      await app.close();
    });

    // ROL-CIFT 4.1: the access change sends both slots, the places and jobs
    // of the management access, and the impact the reader was shown; the
    // preview asks what giving the employee access up would do.
    it("changes somebody's access and previews what it does", async () => {
      const impact = accessChange.expected_impact;
      const rpc = vi.fn(async (name: string) => ({
        data: name === "preview_employee_access_change_service" ? impact
          : { membership_id: "26000000-0000-4000-8000-000000000031", employee_role_id: null,
              management_role_id: accessChange.management_role_id, impact },
        error: null,
      }));
      const app = buildApp({
        contextResolver: { resolve: async () => noPermissions },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const preview = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/employees/${employeeId}/access/preview`,
        headers: { authorization: "Bearer valid-token" },
        payload: { employee_role_id: null, management_role_id: accessChange.management_role_id },
      });
      expect(preview.statusCode, preview.body).toBe(200);
      expect(preview.json()).toEqual(impact);
      expect(rpc).toHaveBeenCalledWith("preview_employee_access_change_service", {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
        target_employee_id: employeeId,
        next_employee_role_id: null,
        next_management_role_id: accessChange.management_role_id,
      });
      const change = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/employees/${employeeId}/access`,
        headers: { authorization: "Bearer valid-token" },
        payload: { ...spoofedIdentity, ...accessChange },
      });
      expect(change.statusCode, change.body).toBe(200);
      expect(change.json()).toMatchObject({ management_role_id: accessChange.management_role_id, impact });
      expect(rpc).toHaveBeenCalledWith("change_employee_access_service", {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
        target_employee_id: employeeId,
        next_employee_role_id: null,
        next_management_role_id: accessChange.management_role_id,
        managed_location_ids: accessChange.managed_location_ids,
        management_job_ids: accessChange.management_job_ids,
        expected_impact: impact,
      });
      await app.close();
    });

    // DAVET-ERISIM: management_job_ids is optional; left out, the database is told null.
    it("sends null management jobs to the database when the change leaves them out", async () => {
      const rpc = vi.fn(async () => ({
        data: { membership_id: "26000000-0000-4000-8000-000000000031", employee_role_id: null,
          management_role_id: accessChange.management_role_id, impact: accessChange.expected_impact },
        error: null,
      }));
      const app = buildApp({
        contextResolver: { resolve: async () => noPermissions },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const { management_job_ids: _jobs, ...withoutJobs } = accessChange;
      const response = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/employees/${employeeId}/access`,
        headers: { authorization: "Bearer valid-token" },
        payload: withoutJobs,
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(rpc).toHaveBeenCalledWith("change_employee_access_service", expect.objectContaining({ management_job_ids: null }));
      await app.close();
    });

    it("answers 409 when what the change does moved since the preview, and 400 without the impact", async () => {
      const rpc = vi.fn(async () => ({
        data: null,
        error: { code: "PT409", message: "What this change does has changed. Review it again.", hint: "access.impact_changed", details: "{}" },
      }));
      const app = buildApp({
        contextResolver: { resolve: async () => noPermissions },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const url = `/v1/workspaces/${workspaceId}/employees/${employeeId}/access`;
      const stale = await app.inject({ method: "PATCH", url, headers: { authorization: "Bearer valid-token" }, payload: accessChange });
      expect(stale.statusCode, stale.body).toBe(409);
      const { expected_impact: _shown, ...unshown } = accessChange;
      const bare = await app.inject({ method: "PATCH", url, headers: { authorization: "Bearer valid-token" }, payload: unshown });
      expect(bare.statusCode).toBe(400);
      expect(rpc).toHaveBeenCalledTimes(1);
      await app.close();
    });

    // S1: a manager takes somebody off one location; the record stays, even
    // with no location left, and the screen hears what happened.
    it("removes somebody from one location and answers what is left", async () => {
      const rpc = vi.fn(async () => ({
        data: { employee_id: employeeId, location_id: locationId, released_shift_count: 2, locations_left: 0 },
        error: null,
      }));
      const app = buildApp({
        contextResolver: { resolve: async () => noPermissions },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const response = await app.inject({
        method: "DELETE",
        url: `/v1/workspaces/${workspaceId}/employees/${employeeId}/locations/${locationId}`,
        headers: { authorization: "Bearer valid-token" },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toEqual({ releasedShiftCount: 2, locationsLeft: 0 });
      expect(rpc).toHaveBeenCalledWith("remove_employee_from_location_service", {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
        target_employee_id: employeeId,
        target_location_id: locationId,
      });
      await app.close();
    });

    it.each([
      ["a bad location id", "DELETE", `/v1/workspaces/${workspaceId}/employees/${employeeId}/locations/not-a-uuid`, undefined],
    ] as const)("answers %s with 400 before asking anybody", async (_name, method, url, payload) => {
      const rpc = vi.fn();
      const app = buildApp({
        contextResolver: { resolve: async () => context },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const response = await app.inject({ method, url, headers: { authorization: "Bearer valid-token" }, payload });
      expect(response.statusCode).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
      await app.close();
    });

    // EMP-001: a manager manages only where they are assigned, so nothing is
    // left to give. The route is gone, not refused.
    it("has no route for managed locations", async () => {
      const rpc = vi.fn();
      const app = buildApp({
        contextResolver: { resolve: async () => context },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const response = await app.inject({
        method: "PUT",
        url: `/v1/workspaces/${workspaceId}/employees/${employeeId}/managed-locations`,
        headers: { authorization: "Bearer valid-token" },
        payload: { locationIds: [locationId] },
      });
      expect(response.statusCode).toBe(404);
      expect(rpc).not.toHaveBeenCalled();
      await app.close();
    });

    it.each(writes)("answers somebody who is not a member on the %s with 404 authz.not_member", async (_name, _rpcName, method, url, payload) => {
      const rpc = vi.fn();
      const app = buildApp({
        contextResolver: { resolve: async () => null },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const response = await app.inject({ method, url, headers: { authorization: "Bearer valid-token" }, payload });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ reason: "authz.not_member" });
      expect(rpc).not.toHaveBeenCalled();
      await app.close();
    });
  });

  // BL-443 (EMP-001): these routes asked a permission of their own. They ask
  // nobody now: the database function asks the core, and its "no" reaches the
  // screen as 403 with its reason, or 404 to somebody who is not a member.
  describe("preferred names and the emergency contact ask the core", () => {
    const requestId = "57000000-0000-4000-8000-000000000001";
    const routes = [
      ["a preferred name", "request_employee_preferred_name_service", "PUT", `/v1/workspaces/${workspaceId}/employees/${employeeId}/preferred-name`, { preferredName: "Ada" }, "published", 200],
      ["the pending preferred names", "list_pending_preferred_names_service", "GET", `/v1/workspaces/${workspaceId}/preferred-names/pending`, undefined, [], 200],
      ["a preferred name's answer", "decide_employee_preferred_name_service", "POST", `/v1/workspaces/${workspaceId}/preferred-names/${requestId}/decision`, { approve: true }, null, 204],
      ["their own emergency contact", "save_own_employment_contact_service", "PUT", `/v1/workspaces/${workspaceId}/employees/${employeeId}/emergency-contact`, { name: "Ayla Kim", phone: "+15550102030" }, null, 204],
    ] as const;
    // BL-503: the US form rules are the server's too, before the database is asked.
    it.each([
      ["a raw phone", `/v1/workspaces/${workspaceId}/employees/${employeeId}/emergency-contact`, { name: "Ayla Kim", phone: "555 010 2030" }],
      ["a foreign phone", `/v1/workspaces/${workspaceId}/employees/${employeeId}/emergency-contact`, { name: "Ayla Kim", phone: "+442079460958" }],
      ["a Turkish-only letter in the contact", `/v1/workspaces/${workspaceId}/employees/${employeeId}/emergency-contact`, { name: "Ayşe Kim", phone: "+15550102030" }],
      ["a Turkish-only letter in the relationship", `/v1/workspaces/${workspaceId}/employees/${employeeId}/emergency-contact`, { name: "Ayla Kim", relationship: "Eşi", phone: "+15550102030" }],
      ["a Turkish-only letter in a preferred name", `/v1/workspaces/${workspaceId}/employees/${employeeId}/preferred-name`, { preferredName: "Ayşe" }],
    ] as const)("refuses %s with 400", async (_name, url, payload) => {
      const rpc = vi.fn(async () => ({ data: null, error: null }));
      const app = buildApp({
        contextResolver: { resolve: async () => context },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const response = await app.inject({ method: "PUT", url, headers: { authorization: "Bearer valid-token" }, payload });
      expect(response.statusCode, response.body).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
      await app.close();
    });

    // KARARLAR S-131: every preferred name waits for who may decide it, so the setting that let one through
    // is gone, its read and write with it.
    it.each([["GET", undefined], ["PUT", { approval: "auto" }]] as const)(
      "no longer serves the preferred-name setting: %s",
      async (method, payload) => {
        const rpc = vi.fn(async () => ({ data: "auto", error: null }));
        const app = buildApp({
          contextResolver: { resolve: async () => context },
          employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
        });
        const response = await app.inject({
          method,
          url: `/v1/workspaces/${workspaceId}/preferred-name-approval`,
          headers: { authorization: "Bearer valid-token" },
          payload,
        });
        expect(response.statusCode).toBe(404);
        expect(rpc).not.toHaveBeenCalled();
        await app.close();
      },
    );

    // No permission at all: the old gates stopped this person before the database was asked.
    const noPermissions = { ...context, permissions: [] as ActiveWorkspaceContext["permissions"] };

    it.each(routes)("hands %s to the database whatever permissions the caller holds", async (_name, rpcName, method, url, payload, answer, status) => {
      const rpc = vi.fn(async () => ({ data: answer, error: null }));
      const app = buildApp({
        contextResolver: { resolve: async () => noPermissions },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const response = await app.inject({ method, url, headers: { authorization: "Bearer valid-token" }, payload });
      expect(response.statusCode, response.body).toBe(status);
      expect(rpc).toHaveBeenCalledWith(rpcName, expect.objectContaining({ actor_user_id: userId, target_workspace_id: workspaceId }));
      await app.close();
    });

    it.each(routes)("answers the core's no on %s with 403 and its reason", async (_name, rpcName, method, url, payload) => {
      const rpc = vi.fn(async () => ({
        data: null,
        error: { code: "42501", message: "Not allowed", hint: "authz.missing_permission", details: "employee.decide_preferred_name" },
      }));
      const app = buildApp({
        contextResolver: { resolve: async () => noPermissions },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const response = await app.inject({ method, url, headers: { authorization: "Bearer valid-token" }, payload });
      expect(rpc).toHaveBeenCalledWith(rpcName, expect.anything());
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: "Not allowed", reason: "authz.missing_permission" });
      await app.close();
    });

    it.each(routes)("answers somebody who is not a member on %s with 404 authz.not_member", async (_name, _rpcName, method, url, payload) => {
      const rpc = vi.fn();
      const app = buildApp({
        contextResolver: { resolve: async () => null },
        employeeDirectoryService: createEmployeeDirectoryServiceWithClient({ rpc }),
      });
      const response = await app.inject({ method, url, headers: { authorization: "Bearer valid-token" }, payload });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ reason: "authz.not_member" });
      expect(rpc).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
