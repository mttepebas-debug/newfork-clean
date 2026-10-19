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
  // BL-1045: the database names the kind of 409, so the job drawer offers
  // Reload latest only when there is something newer to load.
  it.each([
    ["job.changed", "Job details changed. Reload the latest job and review your draft."],
    ["employee.revision_conflict", "Employee E-0001 changed. Reload employees and review your pending changes."],
    ["employee.archived", "An employee was archived. Reload the employee list."],
  ])("passes the database's %s key on with the job save's 409", async (hint, message) => {
    const { app, rpc } = setup();
    rpc.mockResolvedValue({ data: null, error: { code: "PT409", message, hint } });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/organization/jobs/${jobId}`,
      headers: { authorization: "Bearer verified" },
      payload: {
        job: { name: "Cook", color: "#123456", department_id: null },
        expected_job: { name: "Old", color: "#123456", department_id: null },
        changes,
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: message, reason: hint, requestId: expect.any(String) });
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
    ["employee.management_primary", "The Owner job is never marked primary"],
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
  // AVATAR-IKON: a job's Lineup drawings ride its details on create and save.
  const savedJob = {
    id: jobId,
    workspace_id: workspaceId,
    department_id: null,
    name: "Line Cook",
    color: "#123456",
    archived_at: null,
    system_key: null,
    lineup_icons: ["003-bartender", "001-server"],
  };
  it("hands a new job's chosen Lineup drawings to the database in order (AVATAR-IKON)", async () => {
    const { app, rpc } = setup();
    rpc.mockResolvedValue({ data: { changed_count: 0, unchanged_count: 0, job: savedJob }, error: null });
    const job = { name: "Line Cook", color: "#123456", department_id: null, lineup_icons: ["003-bartender", "001-server"] };
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/organization/jobs`,
      headers: { authorization: "Bearer verified" },
      payload: { job, changes: [] },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().job.lineup_icons).toEqual(["003-bartender", "001-server"]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("create_job_with_assignments_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      job_input: job,
      assignment_changes: [],
    });
  });
  it("leaves the drawings out of a new job sent without them, so the database suggests them (AVATAR-IKON)", async () => {
    const { app, rpc } = setup();
    rpc.mockResolvedValue({ data: { changed_count: 0, unchanged_count: 0, job: savedJob }, error: null });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/organization/jobs`,
      headers: { authorization: "Bearer verified" },
      payload: { job: { name: "Line Cook", color: "#123456", department_id: null } },
    });
    expect(response.statusCode).toBe(201);
    const jobInput = (rpc.mock.calls[0]?.[1] as { job_input: Record<string, unknown> }).job_input;
    expect(jobInput).toEqual({ name: "Line Cook", color: "#123456", department_id: null });
    expect(Object.hasOwn(jobInput, "lineup_icons")).toBe(false);
  });
  it.each([
    ["an unknown drawing", ["999-unicorn"]],
    ["more than 24 drawings", Array.from({ length: 25 }, () => "001-server")],
    ["something that is not a list", "001-server"],
  ])("refuses %s on a new job or a save before the database (AVATAR-IKON)", async (_label, lineup_icons) => {
    const { app, rpc } = setup();
    const job = { name: "Line Cook", color: "#123456", department_id: null, lineup_icons };
    const created = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/organization/jobs`,
      headers: { authorization: "Bearer verified" },
      payload: { job },
    });
    const saved = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/organization/jobs/${jobId}`,
      headers: { authorization: "Bearer verified" },
      payload: { job, expected_job: { name: "Line Cook", color: "#123456", department_id: null, lineup_icons: [] } },
    });
    expect([created.statusCode, saved.statusCode]).toEqual([400, 400]);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("saves a job's drawings with the drawings it was read with as the original (AVATAR-IKON)", async () => {
    const { app, rpc } = setup();
    rpc.mockResolvedValue({ data: { changed_count: 0, unchanged_count: 0, job: savedJob }, error: null });
    const job = { name: "Line Cook", color: "#123456", department_id: null, lineup_icons: ["003-bartender", "001-server"] };
    const expected_job = { name: "Line Cook", color: "#123456", department_id: null, lineup_icons: ["001-server"] };
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/organization/jobs/${jobId}`,
      headers: { authorization: "Bearer verified" },
      payload: { job, expected_job },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().job.lineup_icons).toEqual(["003-bartender", "001-server"]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("update_job_details_and_assignments_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      target_job_id: jobId,
      job_input: job,
      expected_job,
      assignment_changes: [],
    });
  });
  it("answers the database's job.lineup_icons_invalid with 400 and its key (AVATAR-IKON)", async () => {
    const { app, rpc } = setup();
    rpc.mockResolvedValue({
      data: null,
      error: { code: "22023", message: "Choose up to 24 different drawings from the archive", hint: "job.lineup_icons_invalid" },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/organization/jobs`,
      headers: { authorization: "Bearer verified" },
      payload: { job: { name: "Line Cook", color: "#123456", department_id: null, lineup_icons: ["001-server", "001-server"] } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ reason: "job.lineup_icons_invalid" });
  });
  it("does not take drawings for a department's new jobs: they are born with the database's suggestion (AVATAR-IKON)", async () => {
    const { app, rpc } = setup();
    rpc.mockResolvedValue({ data: [savedJob], error: null });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/organization/departments/${jobId}/jobs`,
      headers: { authorization: "Bearer verified" },
      payload: { jobs: [{ name: "Chef", color: "#123456", lineup_icons: ["001-server"] }] },
    });
    expect(response.statusCode).toBe(201);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("create_department_jobs_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      target_department_id: jobId,
      jobs_input: [{ name: "Chef", color: "#123456" }],
    });
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
