import {
  announcementDraftSchema,
  announcementIntentSchema,
  announcementStateActionSchema,
  ownerSetupChecklistItemIdSchema,
  homeLayoutInputSchema,
  workspaceManualTodoInputSchema,
  type ActiveWorkspaceContext,
  type Permission,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  resolveActor,
  resolveWorkspaceAuthorization,
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
const announcementPreviewBody = z.object({
  announcement_id: z.string().uuid().nullable().default(null),
  intent: announcementIntentSchema,
  announcement: announcementDraftSchema,
});
const announcementSaveBody = z
  .object({
    announcement_id: z.string().uuid().nullable().default(null),
    expected_revision: z.number().int().positive().nullable().default(null),
    intent: announcementIntentSchema,
    announcement: announcementDraftSchema,
  })
  // A change names the revision it was made on (P11): the second of two saves
  // is refused, not lost.
  .refine((body) => body.announcement_id === null || body.expected_revision !== null, {
    path: ["expected_revision"],
  });
const stateBody = z.object({
  expected_revision: z.number().int().positive(),
  bring_back: z.array(z.string().uuid()).max(500).default([]),
});
const setupChecklistPatchBody = z.object({
  itemId: ownerSetupChecklistItemIdSchema.optional(),
  closed: z.boolean().optional(),
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
      // No gate here: the service asks the core (announcement.read, K6).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service) return unavailable(reply);
      return reply.send(
        await options.service.getAnnouncements(actor(context)),
      );
    },
  );

  // Important Dates sits under Announcements: every published post on it
  // (settings.important_dates.read, asked in the database).
  app.get(
    "/v1/workspaces/:workspaceId/communications/important-dates",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid workspace required" });
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service) return unavailable(reply);
      return reply.send(await options.service.getImportantDates(actor(context)));
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/communications/announcements/:announcementId",
    async (request, reply) => {
      const params = announcementParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid announcement required" });
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service) return unavailable(reply);
      return reply.send(
        await options.service.getAnnouncement({
          ...actor(context),
          announcementId: params.data.announcementId,
        }),
      );
    },
  );

  // The drawer as it is filled in: its problems, the shifts it would change
  // and how many people get it. Nothing is written.
  app.post(
    "/v1/workspaces/:workspaceId/communications/announcements/preview",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = announcementPreviewBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "Valid announcement required" });
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service) return unavailable(reply);
      return reply.send(
        await options.service.previewAnnouncement({
          ...actor(context),
          announcementId: body.data.announcement_id,
          intent: body.data.intent,
          announcement: body.data.announcement,
        }),
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
      // No gate here: the service asks the core (announcement.write, K1-K3).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service) return unavailable(reply);
      return reply.status(body.data.announcement_id ? 200 : 201).send(
        await options.service.saveAnnouncement({
          ...actor(context),
          announcementId: body.data.announcement_id,
          expectedRevision: body.data.expected_revision,
          intent: body.data.intent,
          announcement: body.data.announcement,
        }),
      );
    },
  );

  // Unschedule, Unpublish, Archive, Bring back, Remind; Publish and Save
  // changes are the save above (EKRAN-08). Remind's twice-a-day limit is the
  // database's (KARARLAR S-126).
  for (const action of announcementStateActionSchema.options) {
    app.post(
      `/v1/workspaces/:workspaceId/communications/announcements/:announcementId/${action.replace("_", "-")}`,
      async (request, reply) => {
        const params = announcementParams.safeParse(request.params);
        const body = stateBody.safeParse(request.body);
        if (!params.success || !body.success)
          return reply
            .status(400)
            .send({ error: "Valid announcement revision required" });
        const context = await resolveActor(
          request.headers.authorization,
          params.data.workspaceId,
          options.contextResolver,
        );
        if (!options.service) return unavailable(reply);
        return reply.send(
          await options.service.setAnnouncementState({
            ...actor(context),
            announcementId: params.data.announcementId,
            expectedRevision: body.data.expected_revision,
            action,
            bringBack: body.data.bring_back,
          }),
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
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service) return unavailable(reply);
      return reply.send(
        await options.service.acknowledgeAnnouncement({
          ...actor(context),
          announcementId: params.data.announcementId,
        }),
      );
    },
  );

  app.get("/v1/workspaces/:workspaceId/workspace", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid workspace required" });
    // No gate here: the dashboard asks the core (workspace.todos, KK-34), and
    // its "no" reaches the screen as 404 or 403 with its reason (BL-413).
    const context = await resolveActor(
      request.headers.authorization,
      params.data.workspaceId,
      options.contextResolver,
    );
    if (!options.service) return unavailable(reply);
    return reply.send(await options.service.getWorkspace(actor(context)));
  });

  // The managers' Home, "Locations first" (YONETICI-HOME, KARARLAR S-210): each
  // location's day. No gate here either: the service asks the core
  // (workspace.todos; its locations are the schedule.read scope).
  app.get("/v1/workspaces/:workspaceId/workspace/home", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid workspace required" });
    const context = await resolveActor(
      request.headers.authorization,
      params.data.workspaceId,
      options.contextResolver,
    );
    if (!options.service) return unavailable(reply);
    return reply.send(await options.service.getManagerHome(actor(context)));
  });

  app.put(
    "/v1/workspaces/:workspaceId/workspace/layout",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = homeLayoutInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid workspace layout required" });
      // No gate here: the layout save asks the core (workspace.todos, the
      // home's own gate; KK-36, BL-413).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
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
      // No gate here: the service asks the core (workspace.todos, KK-34;
      // BL-413).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
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
      // No gate here: the service asks the core (workspace.todos, KK-34;
      // BL-413).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
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

function actor(context: ActiveWorkspaceContext) {
  return { actorUserId: context.userId, workspaceId: context.workspace.id };
}
function unavailable(reply: FastifyReply) {
  return reply
    .status(503)
    .send({ error: "Communication service is not configured" });
}
