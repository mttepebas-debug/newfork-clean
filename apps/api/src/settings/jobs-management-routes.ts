import {
  departmentWithJobsInputSchema,
  departmentJobsInputSchema,
  jobCreateWithAssignmentsSchema,
  jobAssignmentChangesSchema,
  jobAssignmentQuerySchema,
  jobDetailsChangesSchema,
  type Permission,
} from "@newfork/shared";
import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  resolveWorkspaceAuthorization,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { JobsManagementService } from "./jobs-management-service";

const paramsSchema = z.object({
  workspaceId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
});
export function registerJobsManagementRoutes(
  app: FastifyInstance,
  options: {
    service: JobsManagementService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  const base = "/v1/workspaces/:workspaceId/organization";
  async function authorize(
    authorization: string | undefined,
    workspaceId: string,
    permission: Permission,
    reply: FastifyReply,
  ) {
    const result = await resolveWorkspaceAuthorization({
      authorization,
      workspaceId,
      permission,
      resolver: options.contextResolver,
    });
    if (!result.context) {
      reply.status(result.denied === "workspace_not_found" ? 404 : 403).send({
        error:
          result.denied === "workspace_not_found"
            ? "Workspace not found"
            : "You do not have permission for this operation",
      });
      return null;
    }
    if (!options.service) {
      reply.status(503).send({ error: "Jobs service is not configured" });
      return null;
    }
    return { actorUserId: result.context.userId, workspaceId };
  }
  app.post(`${base}/departments`, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = departmentWithJobsInputSchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply
        .status(400)
        .send({ error: "Valid department names and colors required" });
    const actor = await authorize(
      request.headers.authorization,
      params.data.workspaceId,
      "settings.jobs.manage",
      reply,
    );
    if (!actor) return;
    return reply
      .status(201)
      .send(await options.service!.createDepartment(actor, body.data));
  });
  app.get(`${base}/job-counts`, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await authorize(
      request.headers.authorization,
      params.data.workspaceId,
      "employees.read",
      reply,
    );
    if (!actor) return;
    return await options.service!.counts(actor);
  });
  app.delete(`${base}/jobs/:jobId`, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success || !params.data.jobId)
      return reply.status(400).send({ error: "Valid job required" });
    const actor = await authorize(
      request.headers.authorization,
      params.data.workspaceId,
      "settings.jobs.manage",
      reply,
    );
    if (!actor) return;
    return await options.service!.deleteJob(actor, params.data.jobId);
  });
  for (const targets of [false, true])
    app.get(
      `${base}/jobs/new/assignments${targets ? "/targets" : ""}`,
      async (request, reply) => {
        const params = paramsSchema.safeParse(request.params);
        const query = jobAssignmentQuerySchema.safeParse(request.query);
        if (!params.success || !query.success)
          return reply.status(400).send({ error: "Valid filters required" });
        const actor = await authorize(
          request.headers.authorization,
          params.data.workspaceId,
          "employees.read",
          reply,
        );
        if (!actor) return;
        return targets
          ? await options.service!.newJobTargets(actor, query.data)
          : await options.service!.newJobEmployees(actor, query.data);
      },
    );
  app.post(`${base}/jobs`, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = jobCreateWithAssignmentsSchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply
        .status(400)
        .send({ error: "Valid job details and assignment changes required" });
    const actor = await authorize(
      request.headers.authorization,
      params.data.workspaceId,
      "settings.jobs.manage",
      reply,
    );
    if (!actor) return;
    return reply
      .status(201)
      .send(
        await options.service!.createJobWithAssignments(actor, body.data),
      );
  });
  for (const kind of [
    "departments",
    "locations",
    "shift-types",
    "shift-labels",
  ] as const) {
    app.delete(`${base}/${kind}/:entityId`, async (request, reply) => {
      const params = z
        .object({ workspaceId: z.string().uuid(), entityId: z.string().uuid() })
        .safeParse(request.params);
      const body = z
        .object({ jobs: z.enum(["keep", "delete"]).default("keep") })
        .safeParse(request.body ?? {});
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid catalog item and deletion choice required" });
      const actor = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        kind === "locations"
          ? "settings.locations.manage"
          : kind === "departments"
            ? "settings.jobs.manage"
            : "settings.shift_catalog.manage",
        reply,
      );
      if (!actor) return;
      return await options.service!.deleteCatalogEntity(
        actor,
        kind,
        params.data.entityId,
        body.data.jobs,
      );
    });
  }
  app.patch(`${base}/departments/:departmentId`, async (request, reply) => {
    const params = z
      .object({
        workspaceId: z.string().uuid(),
        departmentId: z.string().uuid(),
      })
      .safeParse(request.params);
    const body = departmentWithJobsInputSchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply
        .status(400)
        .send({ error: "Valid department and jobs required" });
    const actor = await authorize(
      request.headers.authorization,
      params.data.workspaceId,
      "settings.jobs.manage",
      reply,
    );
    if (!actor) return;
    return await options.service!.updateDepartment(
      actor,
      params.data.departmentId,
      body.data,
    );
  });
  app.post(`${base}/departments/:departmentId/jobs`, async (request, reply) => {
    const params = z
      .object({
        workspaceId: z.string().uuid(),
        departmentId: z.string().uuid(),
      })
      .safeParse(request.params);
    const body = departmentJobsInputSchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply
        .status(400)
        .send({ error: "Valid department and jobs required" });
    const actor = await authorize(
      request.headers.authorization,
      params.data.workspaceId,
      "settings.jobs.manage",
      reply,
    );
    if (!actor) return;
    return reply
      .status(201)
      .send(
        await options.service!.createDepartmentJobs(
          actor,
          params.data.departmentId,
          body.data.jobs,
        ),
      );
  });
  for (const targets of [false, true]) {
    app.get(
      `${base}/jobs/:jobId/assignments${targets ? "/targets" : ""}`,
      async (request, reply) => {
        const params = paramsSchema.safeParse(request.params);
        const query = jobAssignmentQuerySchema.safeParse(request.query);
        if (!params.success || !params.data.jobId || !query.success)
          return reply
            .status(400)
            .send({ error: "Valid job and filters required" });
        const actor = await authorize(
          request.headers.authorization,
          params.data.workspaceId,
          "employees.read",
          reply,
        );
        if (!actor) return;
        return targets
          ? await options.service!.targets(
              actor,
              params.data.jobId,
              query.data,
            )
          : await options.service!.employees(
              actor,
              params.data.jobId,
              query.data,
            );
      },
    );
  }
  app.patch(`${base}/jobs/:jobId`, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = jobDetailsChangesSchema.safeParse(request.body);
    if (!params.success || !params.data.jobId || !body.success)
      return reply
        .status(400)
        .send({ error: "Valid job details and assignment changes required" });
    const actor = await authorize(
      request.headers.authorization,
      params.data.workspaceId,
      body.data.job ? "settings.jobs.manage" : "employees.manage",
      reply,
    );
    if (!actor) return;
    return await options.service!.saveJobDetails(
      actor,
      params.data.jobId,
      body.data,
    );
  });
  app.patch(`${base}/jobs/:jobId/assignments`, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = jobAssignmentChangesSchema.safeParse(request.body);
    if (!params.success || !params.data.jobId || !body.success)
      return reply
        .status(400)
        .send({ error: "Valid employee assignment changes required" });
    const actor = await authorize(
      request.headers.authorization,
      params.data.workspaceId,
      "employees.manage",
      reply,
    );
    if (!actor) return;
    return await options.service!.saveAssignments(
      actor,
      params.data.jobId,
      body.data.changes,
    );
  });
}
