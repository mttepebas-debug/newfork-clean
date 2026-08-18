import {
  announcementInputSchema,
  notificationActionSchema,
  workspaceLayoutInputSchema,
  type ActiveWorkspaceContext,
  type Permission,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { WorkspaceContextResolver } from "../auth/workspace-context";
import type { CommunicationService } from "./communication-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const announcementParams = workspaceParams.extend({
  announcementId: z.string().uuid(),
});
const announcementSaveBody = z.object({
  announcement_id: z.string().uuid().nullable().default(null),
  expected_revision: z.number().int().positive().nullable().default(null),
  announcement: announcementInputSchema,
});
const revisionBody = z.object({
  expected_revision: z.number().int().positive(),
});
const inboxQuery = z.object({
  category: z
    .enum(["announcement", "request", "schedule"])
    .nullable()
    .default(null),
  unread_only: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  cursor: z.string().datetime({ offset: true }).nullable().default(null),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export function registerCommunicationRoutes(
  app: FastifyInstance,
  options: {
    service: CommunicationService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  app.get(
    "/v1/workspaces/:workspaceId/communications/announcements",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid workspace required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "announcements.read",
        options.contextResolver,
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Announcement access required" });
      if (!options.service) return unavailable(reply);
      try {
        return reply.send(
          await options.service.getAnnouncements(actor(context)),
        );
      } catch (error) {
        return communicationError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/communications/announcements",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = announcementSaveBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "Valid announcement required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "announcements.manage",
        options.contextResolver,
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Announcement management required" });
      if (!options.service) return unavailable(reply);
      try {
        return reply.status(body.data.announcement_id ? 200 : 201).send(
          await options.service.saveAnnouncement({
            ...actor(context),
            announcementId: body.data.announcement_id,
            expectedRevision: body.data.expected_revision,
            announcement: body.data.announcement,
          }),
        );
      } catch (error) {
        return communicationError(reply, error);
      }
    },
  );

  for (const action of ["publish", "cancel"] as const) {
    app.post(
      `/v1/workspaces/:workspaceId/communications/announcements/:announcementId/${action}`,
      async (request, reply) => {
        const params = announcementParams.safeParse(request.params);
        const body = revisionBody.safeParse(request.body);
        if (!params.success || !body.success)
          return reply
            .status(400)
            .send({ error: "Valid announcement revision required" });
        const context = await authorize(
          request.headers.authorization,
          params.data.workspaceId,
          "announcements.manage",
          options.contextResolver,
        );
        if (!context)
          return reply
            .status(403)
            .send({ error: "Announcement management required" });
        if (!options.service) return unavailable(reply);
        try {
          const input = {
            ...actor(context),
            announcementId: params.data.announcementId,
            expectedRevision: body.data.expected_revision,
          };
          return reply.send(
            action === "publish"
              ? await options.service.publishAnnouncement(input)
              : await options.service.cancelAnnouncement(input),
          );
        } catch (error) {
          return communicationError(reply, error);
        }
      },
    );
  }

  app.get(
    "/v1/workspaces/:workspaceId/communications/notifications",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const query = inboxQuery.safeParse(request.query);
      if (!params.success || !query.success)
        return reply
          .status(400)
          .send({ error: "Valid notification filters required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "notifications.read",
        options.contextResolver,
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Notification access required" });
      if (!options.service) return unavailable(reply);
      try {
        return reply.send(
          await options.service.getNotifications({
            ...actor(context),
            category: query.data.category,
            unreadOnly: query.data.unread_only,
            cursor: query.data.cursor,
            limit: query.data.limit,
          }),
        );
      } catch (error) {
        return communicationError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/communications/notifications/action",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = notificationActionSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid notification action required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "notifications.read",
        options.contextResolver,
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Notification access required" });
      if (!options.service) return unavailable(reply);
      try {
        return reply.send(
          await options.service.actOnNotification({
            ...actor(context),
            action: body.data,
          }),
        );
      } catch (error) {
        return communicationError(reply, error);
      }
    },
  );

  app.get("/v1/workspaces/:workspaceId/workspace", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid workspace required" });
    const context = await authorize(
      request.headers.authorization,
      params.data.workspaceId,
      "workspace.read",
      options.contextResolver,
    );
    if (!context || context.membership.role === "employee")
      return reply
        .status(403)
        .send({ error: "Manager workspace access required" });
    if (!options.service) return unavailable(reply);
    try {
      return reply.send(await options.service.getWorkspace(actor(context)));
    } catch (error) {
      return communicationError(reply, error);
    }
  });

  app.put(
    "/v1/workspaces/:workspaceId/workspace/layout",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = workspaceLayoutInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid workspace layout required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "workspace.read",
        options.contextResolver,
      );
      if (!context || context.membership.role === "employee")
        return reply
          .status(403)
          .send({ error: "Manager workspace access required" });
      if (!options.service) return unavailable(reply);
      try {
        return reply.send(
          await options.service.saveWorkspaceLayout({
            ...actor(context),
            layout: body.data,
          }),
        );
      } catch (error) {
        return communicationError(reply, error);
      }
    },
  );
}

async function authorize(
  authorization: string | undefined,
  workspaceId: string,
  permission: Permission,
  resolver: WorkspaceContextResolver | null,
): Promise<ActiveWorkspaceContext | null> {
  if (!resolver || !authorization?.startsWith("Bearer ")) return null;
  const context = await resolver.resolve(authorization.slice(7).trim());
  return context?.workspace.id === workspaceId &&
    context.membership.status === "active" &&
    context.permissions.includes(permission)
    ? context
    : null;
}
function actor(context: ActiveWorkspaceContext) {
  return { actorUserId: context.userId, workspaceId: context.workspace.id };
}
function unavailable(reply: FastifyReply) {
  return reply
    .status(503)
    .send({ error: "Communication service is not configured" });
}
function communicationError(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Communication operation failed";
  if (message.includes("required") || message.includes("access denied"))
    return reply.status(403).send({ error: message });
  if (message.includes("not found"))
    return reply.status(404).send({ error: message });
  if (message.includes("stale") || message.includes("no longer"))
    return reply.status(409).send({ error: message });
  return reply.status(400).send({ error: message });
}
