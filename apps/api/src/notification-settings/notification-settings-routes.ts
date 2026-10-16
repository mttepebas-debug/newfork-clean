import {
  notificationPreferencesInputSchema,
  notificationWorkspaceSettingsInputSchema,
  type AuthzAction,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  authorize,
  resolveActor,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { NotificationSettingsService } from "./notification-settings-service";

// Account > Notifications and Settings > Notifications (BILDIRIM-11). The
// gate is the core's list of actions; the database asks the core again and
// decides what a person may choose (S-123).
export function registerNotificationSettingsRoutes(
  app: FastifyInstance,
  options: {
    service: NotificationSettingsService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  async function gate(request: FastifyRequest, action: AuthzAction) {
    const { workspaceId } = request.params as { workspaceId?: string };
    const context = authorize(
      await resolveActor(request.headers.authorization, workspaceId ?? "", options.contextResolver),
      action,
    );
    return { actorUserId: context.userId, workspaceId: context.workspace.id };
  }

  function unavailable(reply: FastifyReply) {
    return reply.status(503).send({ error: "Notification settings are not configured" });
  }

  app.get("/v1/workspaces/:workspaceId/notification-preferences", async (request, reply) => {
    const actor = await gate(request, "notifications.read_own");
    if (!options.service) return unavailable(reply);
    return reply.send(await options.service.readPreferences(actor));
  });

  app.put("/v1/workspaces/:workspaceId/notification-preferences", async (request, reply) => {
    const actor = await gate(request, "notifications.write_own");
    const body = notificationPreferencesInputSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Valid notification choices required" });
    if (!options.service) return unavailable(reply);
    return reply.send(await options.service.savePreferences({ ...actor, choices: body.data.choices }));
  });

  app.get("/v1/workspaces/:workspaceId/settings/notifications", async (request, reply) => {
    const actor = await gate(request, "settings.organization.write");
    if (!options.service) return unavailable(reply);
    return reply.send(await options.service.readWorkspaceSettings(actor));
  });

  app.put("/v1/workspaces/:workspaceId/settings/notifications", async (request, reply) => {
    const actor = await gate(request, "settings.organization.write");
    const body = notificationWorkspaceSettingsInputSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Valid notification settings required" });
    if (!options.service) return unavailable(reply);
    return reply.send(await options.service.saveWorkspaceSettings({ ...actor, settings: body.data }));
  });
}
