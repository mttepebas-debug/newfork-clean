import {
  schedulingSettingsInputSchema,
  scheduleConflictSettingsSchema,
  type Permission,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  resolveWorkspaceAuthorization,
  resolveWorkspaceMembership,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { OrganizationSettingsService } from "./organization-settings-service";
import { registerJobsManagementRoutes } from "./jobs-management-routes";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const shiftTypeReorderBody = z.object({
  orderedIds: z.array(z.string().uuid()),
});
const shiftLabelReorderBody = z.object({
  orderedIds: z.array(z.string().uuid()),
});

export function registerOrganizationSettingsRoutes(
  app: FastifyInstance,
  options: {
    service: OrganizationSettingsService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  registerJobsManagementRoutes(app, {
    service: options.service?.jobs ?? null,
    contextResolver: options.contextResolver,
  });
  app.get("/v1/workspaces/:workspaceId/scheduling-settings/conflicts", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    // Whoever reads the schedule rules reads the conflict rules, a manager too; only
    // schedule.conflict_rules.manage changes them (K14 S1, Mert 2026-10-20).
    const context = await authorize(request.headers.authorization, params.data.workspaceId, "settings.schedule_rules.read", options.contextResolver, reply);
    if (!context) return;
    if (!options.service) return reply.status(503).send({ error: "Organization settings unavailable" });
    return reply.send(scheduleConflictSettingsSchema.parse(await options.service.readSchedulingSettings({ workspaceId: params.data.workspaceId })));
  });
  app.put("/v1/workspaces/:workspaceId/scheduling-settings/conflicts", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    const body = scheduleConflictSettingsSchema.strict().safeParse(request.body);
    if (!params.success) return reply.status(400).send({ error: "Valid conflict settings required" });
    const context = await authorize(request.headers.authorization, params.data.workspaceId, "schedule.conflict_rules.manage", options.contextResolver, reply);
    if (!context) return;
    if (!body.success) return reply.status(400).send({ error: "Valid conflict settings required" });
    if (!options.service) return reply.status(503).send({ error: "Organization settings unavailable" });
    return reply.send(scheduleConflictSettingsSchema.parse(await options.service.updateSchedulingSettings({ actorUserId: context.userId, workspaceId: params.data.workspaceId, settings: body.data })));
  });
  app.get(
    "/v1/workspaces/:workspaceId/scheduling-settings",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid workspace required" });
      const context = await authorizeMember(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Organization settings service is not configured" });
      const settings = await options.service.readSchedulingSettings({
          workspaceId: params.data.workspaceId,
        });
      const { conflict_rules, conflict_rules_revision, minimum_rest_minutes, minimum_travel_minutes, ...general } = settings;
      return reply.send(general);
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/scheduling-settings",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = schedulingSettingsInputSchema.safeParse(request.body);
      if (!params.success)
        return reply.status(400).send({ error: "Valid settings required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "settings.schedule_rules.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!body.success)
        return reply.status(400).send({ error: "Valid settings required" });
      if (["conflict_rules", "conflict_rules_revision", "minimum_travel_minutes", "minimum_rest_minutes"].some(key => key in body.data))
        return reply.status(400).send({ error: "Use Conflict handling to change conflict rules." });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Organization settings service is not configured" });
      const settings = await options.service.updateSchedulingSettings({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          settings: body.data,
        });
      const { conflict_rules, conflict_rules_revision, minimum_rest_minutes, minimum_travel_minutes, ...general } = settings;
      return reply.send(general);
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/shift-types/reorder",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = shiftTypeReorderBody.safeParse(request.body);
      if (!params.success)
        return reply.status(400).send({ error: "Valid order required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "settings.shift_catalog.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!body.success)
        return reply.status(400).send({ error: "Valid order required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Organization settings service is not configured" });
      await options.service.reorderShiftTypes({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        orderedIds: body.data.orderedIds,
      });
      return reply.status(204).send();
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/shift-labels/reorder",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = shiftLabelReorderBody.safeParse(request.body);
      if (!params.success)
        return reply.status(400).send({ error: "Valid order required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "settings.shift_catalog.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!body.success)
        return reply.status(400).send({ error: "Valid order required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Organization settings service is not configured" });
      await options.service.reorderShiftLabels({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        orderedIds: body.data.orderedIds,
      });
      return reply.status(204).send();
    },
  );
}

async function authorizeMember(
  authorization: string | undefined,
  workspaceId: string,
  resolver: WorkspaceContextResolver | null,
  reply: FastifyReply,
) {
  const result = await resolveWorkspaceMembership({
    authorization,
    workspaceId,
    resolver,
  });
  if (result.context) return result.context;
  reply.status(404).send({ error: "Workspace not found" });
  return null;
}

async function authorize(
  authorization: string | undefined,
  workspaceId: string,
  permission: Permission,
  resolver: WorkspaceContextResolver | null,
  reply: FastifyReply,
) {
  const result = await resolveWorkspaceAuthorization({
    authorization,
    workspaceId,
    permission,
    resolver,
  });
  if (result.context) return result.context;
  reply.status(result.denied === "workspace_not_found" ? 404 : 403).send({
    error:
      result.denied === "workspace_not_found"
        ? "Workspace not found"
        : "Workspace management required",
  });
  return null;
}
