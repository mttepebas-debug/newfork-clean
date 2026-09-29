import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { replyWithError } from "../http-error";
import { managementAndOwnerRefusals, type ActiveWorkspaceContext } from "@newfork/shared";
import { registerJobsManagementRoutes } from "./jobs-management-routes";
import { createJobsManagementService } from "./jobs-management-service";

const workspaceId = "28000000-0000-4000-8000-000000000081";
const jobId = "58000000-0000-4000-8000-000000000081";
const employeeId = "78000000-0000-4000-8000-000000000081";
const userId = "18000000-0000-4000-8000-000000000081";
const context = {
  userId,
  workspace: { id: workspaceId },
  membership: { status: "active" },
  onboarding: { status: "complete" },
  documentAccess: { restricted: false },
  permissions: [
    "employees.read",
    "employees.manage",
    "workspace.manage",
    "settings.jobs.read",
    "settings.jobs.manage",
    "settings.locations.read",
    "settings.locations.manage",
    "settings.shift_catalog.read",
    "settings.shift_catalog.manage",
  ],
} as ActiveWorkspaceContext;
const changes = [
  { employee_id: employeeId, assigned: false, expected_revision: 5 },
];
const apps: ReturnType<typeof Fastify>[] = [];
function setup(permissions = context.permissions) {
  const rpc = vi.fn().mockResolvedValue({
    data: { changed_count: 1, unchanged_count: 0 },
    error: null,
  });
  const app = Fastify();
  app.setErrorHandler(replyWithError);
  apps.push(app);
  const resolver = {
    resolve: vi.fn(async () => ({ ...context, permissions })),
  };
  registerJobsManagementRoutes(app, {
    service: createJobsManagementService({ rpc }),
    contextResolver: resolver,
  });
  return { app, rpc, resolver };
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
describe("jobs management HTTP boundary", () => {
  it.each(["departments", "locations", "shift-types", "shift-labels"])(
    "deletes %s through an authenticated scoped RPC",
    async (kind) => {
      const { app, rpc } = setup();
      rpc.mockResolvedValue({ data: { removed_count: 1 }, error: null });
      const result = await app.inject({
        method: "DELETE",
        url: `/v1/workspaces/${workspaceId}/organization/${kind}/${jobId}`,
        headers: { authorization: "Bearer verified" },
        ...(kind === "departments" ? { payload: { jobs: "delete" } } : {}),
      });
      expect(result.statusCode).toBe(200);
      expect(rpc).toHaveBeenCalledWith("delete_catalog_entity_service", {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
        target_entity_id: jobId,
        entity_kind: kind,
        department_jobs: kind === "departments" ? "delete" : "keep",
      });
    },
  );
  it("rejects invalid department deletion choices before mutating", async () => {
    const { app, rpc } = setup();
    const result = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/organization/departments/${jobId}`,
      headers: { authorization: "Bearer verified" },
      payload: { jobs: "unknown" },
    });
    expect(result.statusCode).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("deletes a job through the trusted actor command", async () => {
    const { app, rpc } = setup();
    rpc.mockResolvedValue({ data: { removed_count: 3 }, error: null });
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/organization/jobs/${jobId}`,
      headers: { authorization: "Bearer verified" },
    });
    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "delete_job_with_assignments_service",
      {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
        target_job_id: jobId,
      },
    );
  });
  it("denies a delete when the actor lacks job management", async () => {
    const { app, rpc } = setup(["employees.read", "employees.manage"]);
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/organization/jobs/${jobId}`,
      headers: { authorization: "Bearer verified" },
    });
    expect(response.statusCode).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses the authenticated actor and one atomic RPC for desired changes", async () => {
    const { app, rpc } = setup();
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/organization/jobs/${jobId}/assignments`,
      headers: { authorization: "Bearer verified" },
      payload: { actor_user_id: employeeId, changes },
    });
    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "update_job_assignments_service",
      {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
        target_job_id: jobId,
        assignment_changes: changes,
      },
    );
  });
  it("denies management without calling storage", async () => {
    const { app, rpc } = setup(["employees.read"]);
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/organization/jobs/${jobId}/assignments`,
      headers: { authorization: "Bearer verified" },
      payload: { changes },
    });
    expect(response.statusCode).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires employee read permission for targets", async () => {
    const { app, rpc } = setup(["workspace.manage"]);
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/organization/jobs/${jobId}/assignments/targets`,
      headers: { authorization: "Bearer verified" },
    });
    expect(response.statusCode).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("returns concurrency conflicts as 409", async () => {
    const { app, rpc } = setup();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PT409", message: "Employee changed" },
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/organization/jobs/${jobId}/assignments`,
      headers: { authorization: "Bearer verified" },
      payload: { changes },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "Employee changed", requestId: expect.any(String) });
  });
  it("answers deleting the Owner job with 400, its key and a readable sentence (BL-218)", async () => {
    const { app, rpc } = setup();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "Management and Owner are kept; rename them instead", hint: "catalog.system_record" },
    });
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/organization/jobs/${jobId}`,
      headers: { authorization: "Bearer verified" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: managementAndOwnerRefusals["catalog.system_record"],
      reason: "catalog.system_record",
      requestId: expect.any(String),
    });
  });
  it.each([
    ["employee.owner_job", "The owner keeps the Owner job"],
    ["employee.management_primary", "A Management job is primary by its department and is not marked primary"],
  ] as const)("answers an assignment change's %s refusal with 400, its key and a readable sentence (BL-218)", async (hint, raised) => {
    const { app, rpc } = setup();
    rpc.mockResolvedValue({ data: null, error: { code: "23514", message: raised, hint } });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/organization/jobs/${jobId}/assignments`,
      headers: { authorization: "Bearer verified" },
      payload: { changes },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: managementAndOwnerRefusals[hint], reason: hint, requestId: expect.any(String) });
  });
  it("rejects duplicate employee operations before storage", async () => {
    const { app, rpc } = setup();
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/organization/jobs/${jobId}/assignments`,
      headers: { authorization: "Bearer verified" },
      payload: { changes: [...changes, ...changes] },
    });
    expect(response.statusCode).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("validates paging and preserves all-results query filters", async () => {
    const { app, rpc } = setup();
    rpc.mockResolvedValue({ data: [], error: null });
    const url = `/v1/workspaces/${workspaceId}/organization/jobs/${jobId}/assignments/targets`;
    expect(
      (
        await app.inject({
          url: `${url}?page=-1`,
          headers: { authorization: "Bearer verified" },
        })
      ).statusCode,
    ).toBe(400);
    const response = await app.inject({
      url: `${url}?search=Alex&filter=unassigned&page=2`,
      headers: { authorization: "Bearer verified" },
    });
    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "read_job_assignments_service",
      {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
        target_job_id: jobId,
        search_text: "Alex",
        assignment_filter: "unassigned",
        page_number: 2,
        location_filter: null,
        targets_only: true,
      },
    );
  });
  it("saves multiple jobs to an existing department in one command", async () => {
    const { app, rpc } = setup();
    rpc.mockResolvedValue({ data: [], error: null });
    const jobs = [
      { name: "Chef", color: "#123456" },
      { name: "Cook", color: "#654321" },
    ];
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/organization/departments/${jobId}/jobs`,
      headers: { authorization: "Bearer verified" },
      payload: { jobs, actor_user_id: employeeId },
    });
    expect(response.statusCode).toBe(201);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "create_department_jobs_service",
      {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
        target_department_id: jobId,
        jobs_input: jobs,
      },
    );
  });
});
