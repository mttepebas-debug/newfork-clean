import {
  schedulingSettingsInputSchema,
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
const entityReorderBody = z.object({
  entityType: z.enum(["departments", "jobs"]),
  orderedIds: z.array(z.string().uuid()),
});
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
      try {
        return reply.send(
          await options.service.readSchedulingSettings({
            workspaceId: params.data.workspaceId,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/scheduling-settings",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = schedulingSettingsInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "Valid settings required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "settings.schedule_rules.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Organization settings service is not configured" });
      try {
        return reply.send(
          await options.service.updateSchedulingSettings({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            settings: body.data,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/organization/entities/reorder",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = entityReorderBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "Valid order required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "settings.jobs.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Organization settings service is not configured" });
      try {
        await options.service.reorderEntities({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          entityType: body.data.entityType,
          orderedIds: body.data.orderedIds,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/shift-types/reorder",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = shiftTypeReorderBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "Valid order required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "settings.shift_catalog.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Organization settings service is not configured" });
      try {
        await options.service.reorderShiftTypes({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          orderedIds: body.data.orderedIds,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/shift-labels/reorder",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = shiftLabelReorderBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "Valid order required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "settings.shift_catalog.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Organization settings service is not configured" });
      try {
        await options.service.reorderShiftLabels({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          orderedIds: body.data.orderedIds,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
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

function requestError(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Organization settings operation failed";
  if (error instanceof Error && "code" in error && error.code === "PT409")
    return reply.status(409).send({ error: message });
  if (
    message.includes("access required") ||
    message.includes("access denied") ||
    message.includes("denied")
  )
    return reply.status(403).send({ error: message });
  if (message.includes("not found"))
    return reply.status(404).send({ error: message });
  if (
    message.includes("duplicates") ||
    message.includes("must include") ||
    message.includes("unsupported")
  )
    return reply.status(409).send({ error: message });
  return reply.status(400).send({ error: message });
}
