import {
  announcementInputSchema,
  notificationActionSchema,
  ownerSetupChecklistItemIdSchema,
  workspaceLayoutInputSchema,
  workspaceManualTodoInputSchema,
  type ActiveWorkspaceContext,
  type Permission,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  resolveWorkspaceAuthorization,
  resolveWorkspaceMembership,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { CommunicationService } from "./communication-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const announcementParams = workspaceParams.extend({
  announcementId: z.string().uuid(),
});
const todoParams = workspaceParams.extend({
  todoId: z.string().uuid(),
});
const announcementSaveBody = z.object({
  announcement_id: z.string().uuid().nullable().default(null),
  expected_revision: z.number().int().positive().nullable().default(null),
  announcement: announcementInputSchema,
});
const revisionBody = z.object({
  expected_revision: z.number().int().positive(),
});
const setupChecklistPatchBody = z.object({
  itemId: ownerSetupChecklistItemIdSchema.optional(),
  closed: z.boolean().optional(),
});
export const inboxQuery = z.object({
  category: z
    .enum([
      "announcement",
      "request",
      "schedule",
      "security",
      "requests",
      "payroll",
      "people",
      "communications",
      "system",
    ])
    .nullable()
    .default(null),
  severity: z
    .enum(["info", "success", "warning", "action_required"])
    .nullable()
    .default(null),
  read_state: z
    .enum(["all", "seen", "unseen", "read", "unread"])
    .nullable()
    .default(null),
  unread_only: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  cursor: z.string().min(1).nullable().default(null),
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
        reply,
        "Announcement access required",
      );
      if (!context) return;
      if (!options.service) return unavailable(reply);
      return reply.send(
        await options.service.getAnnouncements(actor(context)),
      );
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
        reply,
        "Announcement management required",
      );
      if (!context) return;
      if (!options.service) return unavailable(reply);
      return reply.status(body.data.announcement_id ? 200 : 201).send(
        await options.service.saveAnnouncement({
          ...actor(context),
          announcementId: body.data.announcement_id,
          expectedRevision: body.data.expected_revision,
          announcement: body.data.announcement,
        }),
      );
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
          reply,
          "Announcement management required",
        );
        if (!context) return;
        if (!options.service) return unavailable(reply);
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
      },
    );
  }

  app.post(
    "/v1/workspaces/:workspaceId/communications/announcements/:announcementId/acknowledge",
    async (request, reply) => {
      const params = announcementParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid announcement required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "announcements.read",
        options.contextResolver,
        reply,
        "Announcement access required",
      );
      if (!context) return;
      if (!options.service) return unavailable(reply);
      return reply.send(
        await options.service.acknowledgeAnnouncement({
          ...actor(context),
          announcementId: params.data.announcementId,
        }),
      );
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/communications/notifications",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const query = inboxQuery.safeParse(request.query);
      if (!params.success || !query.success)
        return reply
          .status(400)
          .send({ error: "Valid notification filters required" });
      const ownContext = await authorizeActiveMember(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
        reply,
      );
      if (!ownContext) return;
      if (!options.service) return unavailable(reply);
      return reply.send(
        await options.service.getNotifications({
          ...actor(ownContext),
          category: query.data.category,
          severity: query.data.severity,
          readState:
            query.data.read_state ??
            (query.data.unread_only ? "unread" : null),
          cursor: query.data.cursor,
          limit: query.data.limit,
        }),
      );
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
      const ownContext = await authorizeActiveMember(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
        reply,
      );
      if (!ownContext) return;
      if (!options.service) return unavailable(reply);
      return reply.send(
        await options.service.actOnNotification({
          ...actor(ownContext),
          action: body.data,
        }),
      );
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
      reply,
      "Manager workspace access required",
    );
    if (!context) return;
    if (context.membership.role === "employee")
      return reply
        .status(403)
        .send({ error: "Manager workspace access required" });
    if (!options.service) return unavailable(reply);
    return reply.send(await options.service.getWorkspace(actor(context)));
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
        reply,
        "Manager workspace access required",
      );
      if (!context) return;
      if (context.membership.role === "employee")
        return reply
          .status(403)
          .send({ error: "Manager workspace access required" });
      if (!options.service) return unavailable(reply);
      return reply.send(
        await options.service.saveWorkspaceLayout({
          ...actor(context),
          layout: body.data,
        }),
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/workspace/todos",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = workspaceManualTodoInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid workspace todo required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "workspace.read",
        options.contextResolver,
        reply,
        "Manager workspace access required",
      );
      if (!context) return;
      if (context.membership.role === "employee")
        return reply
          .status(403)
          .send({ error: "Manager workspace access required" });
      if (!options.service) return unavailable(reply);
      return reply.status(201).send(
        await options.service.createWorkspaceTodo({
          ...actor(context),
          todo: body.data,
        }),
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/workspace/todos/:todoId/resolve",
    async (request, reply) => {
      const params = todoParams.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ error: "Valid workspace todo required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "workspace.read",
        options.contextResolver,
        reply,
        "Manager workspace access required",
      );
      if (!context) return;
      if (context.membership.role === "employee")
        return reply
          .status(403)
          .send({ error: "Manager workspace access required" });
      if (!options.service) return unavailable(reply);
      return reply.send(
        await options.service.resolveWorkspaceTodo({
          ...actor(context),
          todoId: params.data.todoId,
        }),
      );
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/workspace/setup-checklist",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid workspace required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "settings.general.read",
        options.contextResolver,
        reply,
        "Workspace management required",
      );
      if (!context) return;
      if (!options.service) return unavailable(reply);
      return reply.send(
        await options.service.getOwnerSetupChecklistProgress(actor(context)),
      );
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/workspace/setup-checklist",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = setupChecklistPatchBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid setup checklist update required" });
      if (body.data.itemId === undefined && body.data.closed === undefined)
        return reply
          .status(400)
          .send({ error: "Valid setup checklist update required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "settings.general.manage",
        options.contextResolver,
        reply,
        "Workspace management required",
      );
      if (!context) return;
      if (!options.service) return unavailable(reply);
      if (body.data.itemId !== undefined) {
        return reply.send(
          await options.service.markOwnerSetupChecklistItem({
            ...actor(context),
            itemId: body.data.itemId,
          }),
        );
      }
      return reply.send(
        await options.service.setOwnerSetupChecklistClosed({
          ...actor(context),
          closed: body.data.closed ?? false,
        }),
      );
    },
  );
}

async function authorize(
  authorization: string | undefined,
  workspaceId: string,
  permission: Permission,
  resolver: WorkspaceContextResolver | null,
  reply: FastifyReply,
  permissionMessage: string,
): Promise<ActiveWorkspaceContext | null> {
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
function unavailable(reply: FastifyReply) {
  return reply
    .status(503)
    .send({ error: "Communication service is not configured" });
}
