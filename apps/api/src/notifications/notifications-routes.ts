import { notificationFeedQuerySchema, notificationReadInputSchema, notificationUnreadInputSchema } from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authorize, resolveActor, type WorkspaceContextResolver } from "../auth/workspace-context";
import { decodeNotificationCursor } from "./notifications-cursor";
import { notificationsServiceFromEnvironment, type NotificationsService } from "./notifications-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });

/**
 * BILDIRIM-10: one's own notification list in a workspace (with the account's
 * own notices), the badge count, opening the list (seen), reading rows and
 * marking read rows unread again (S-251).
 * A stranger gets 404 (authz.not_member), anyone else without the action 403.
 */
export function registerNotificationRoutes(
  app: FastifyInstance,
  options: { service?: NotificationsService | null; contextResolver: WorkspaceContextResolver | null },
) {
  const service = options.service === undefined ? notificationsServiceFromEnvironment() : options.service;
  const base = "/v1/workspaces/:workspaceId/notifications";

  async function actorFor(authorization: string | undefined, workspaceId: string) {
    const context = authorize(await resolveActor(authorization, workspaceId, options.contextResolver), "notifications.read_own");
    return { actorUserId: context.userId, workspaceId: context.workspace.id };
  }
  const unavailable = { error: "Notification service is not configured" };

  app.get(base, async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, params.data.workspaceId);
    const query = notificationFeedQuerySchema.safeParse(request.query);
    const before = query.success && query.data.before ? decodeNotificationCursor(query.data.before) : null;
    if (!query.success || (query.data.before && !before))
      return reply.status(400).send({ error: "Valid notification list request required" });
    if (!service) return reply.status(503).send(unavailable);
    return reply.send(await service.feed({ ...actor, query: { filter: query.data.filter, before, limit: query.data.limit } }));
  });

  app.get(`${base}/count`, async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, params.data.workspaceId);
    if (!service) return reply.status(503).send(unavailable);
    return reply.send(await service.counts(actor));
  });

  app.post(`${base}/seen`, async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, params.data.workspaceId);
    if (!service) return reply.status(503).send(unavailable);
    return reply.send(await service.markSeen(actor));
  });

  app.post(`${base}/read`, async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, params.data.workspaceId);
    const body = notificationReadInputSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Choose notifications to mark as read" });
    if (!service) return reply.status(503).send(unavailable);
    return reply.send(await service.markRead({ ...actor, read: body.data }));
  });

  app.post(`${base}/unread`, async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, params.data.workspaceId);
    const body = notificationUnreadInputSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Choose notifications to mark as unread" });
    if (!service) return reply.status(503).send(unavailable);
    return reply.send(await service.markUnread({ ...actor, unread: body.data }));
  });
}
