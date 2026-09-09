import {
  notificationOrgPolicyInputSchema,
  notificationPolicyResetInputSchema,
  notificationPolicyTestInputSchema,
  notificationUserPreferencePatchSchema,
  type ActiveWorkspaceContext,
  type Permission,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  resolveWorkspaceAnyPermissionAuthorization,
  resolveWorkspaceMembership,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { NotificationSettingsService } from "./notification-settings-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });

export function registerNotificationSettingsRoutes(
  app: FastifyInstance,
  options: {
    service: NotificationSettingsService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  app.get(
    "/v1/workspaces/:workspaceId/notification-settings",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      if (!params.success) return invalid(reply);
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        ["notifications.settings.read", "notifications.settings.write"],
        options.contextResolver,
        reply,
        "Notification settings access required",
      );
      if (!context) return;
      if (!options.service) return unavailable(reply);
      try {
        return reply.send(await options.service.get(actor(context)));
      } catch (error) {
        return settingsError(reply, error);
      }
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/notification-settings",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = notificationOrgPolicyInputSchema.safeParse(request.body);
      if (!params.success || !body.success) return invalid(reply);
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        ["notifications.settings.write"],
        options.contextResolver,
        reply,
        "Notification settings write access required",
      );
      if (!context) return;
      if (!options.service) return unavailable(reply);
      try {
        return reply.send(
          await options.service.save({ ...actor(context), policy: body.data }),
        );
      } catch (error) {
        return settingsError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/notification-settings/reset",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = notificationPolicyResetInputSchema.safeParse(request.body);
      if (!params.success || !body.success) return invalid(reply);
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        ["notifications.settings.write"],
        options.contextResolver,
        reply,
        "Notification settings write access required",
      );
      if (!context) return;
      if (!options.service) return unavailable(reply);
      try {
        return reply.send(
          await options.service.reset({ ...actor(context), reset: body.data }),
        );
      } catch (error) {
        return settingsError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/notification-settings/test",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = notificationPolicyTestInputSchema.safeParse(request.body);
      if (!params.success || !body.success) return invalid(reply);
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        ["notifications.test_send"],
        options.contextResolver,
        reply,
        "Notification test-send access required",
      );
      if (!context) return;
      if (!options.service) return unavailable(reply);
      try {
        return reply.send(
          await options.service.preview({ ...actor(context), test: body.data }),
        );
      } catch (error) {
        return settingsError(reply, error);
      }
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/me/notification-preferences",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      if (!params.success) return invalid(reply);
      const context = await authorizeActiveMember(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service) return unavailable(reply);
      try {
        return reply.send(await options.service.getUserPreferences(actor(context)));
      } catch (error) {
        return settingsError(reply, error);
      }
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/me/notification-preferences",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = notificationUserPreferencePatchSchema.safeParse(request.body);
      if (!params.success || !body.success) return invalid(reply);
      const context = await authorizeActiveMember(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service) return unavailable(reply);
      try {
        return reply.send(
          await options.service.saveUserPreferences({
            ...actor(context),
            patch: body.data,
          }),
        );
      } catch (error) {
        return settingsError(reply, error);
      }
    },
  );
}

async function authorize(
  authorization: string | undefined,
  workspaceId: string,
  anyOf: readonly Permission[],
  resolver: WorkspaceContextResolver | null,
  reply: FastifyReply,
  permissionMessage: string,
): Promise<ActiveWorkspaceContext | null> {
  const result = await resolveWorkspaceAnyPermissionAuthorization({
    authorization,
    workspaceId,
    anyOf,
    resolver,
  });
  if (result.context) return result.context;
  reply.status(result.denied === "workspace_not_found" ? 404 : 403).send({
    error:
      result.denied === "workspace_not_found"
        ? "Workspace not found"
        : permissionMessage,
  });
  return null;
}

async function authorizeActiveMember(
  authorization: string | undefined,
  workspaceId: string,
  resolver: WorkspaceContextResolver | null,
  reply: FastifyReply,
): Promise<ActiveWorkspaceContext | null> {
  const result = await resolveWorkspaceMembership({
    authorization,
    workspaceId,
    resolver,
  });
  if (result.context) return result.context;
  reply.status(404).send({ error: "Workspace not found" });
  return null;
}

function actor(context: ActiveWorkspaceContext) {
  return { actorUserId: context.userId, workspaceId: context.workspace.id };
}
function invalid(reply: FastifyReply) {
  return reply.status(400).send({ error: "Valid notification settings input required" });
}
function unavailable(reply: FastifyReply) {
  return reply.status(503).send({ error: "Notification settings service is not configured" });
}
function settingsError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : "Notification settings operation failed";
  if (message.includes("required") || message.includes("access denied"))
    return reply.status(403).send({ error: message });
  if (message.includes("not found")) return reply.status(404).send({ error: message });
  if (message.includes("stale") || message.includes("conflict"))
    return reply.status(409).send({ error: message });
  if (message.includes("rate limit")) return reply.status(429).send({ error: message });
  return reply.status(400).send({ error: message });
}
