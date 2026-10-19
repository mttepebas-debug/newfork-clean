import { avatarChoiceSchema, avatarUploadRequestSchema } from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authorize, resolveActor, type WorkspaceContextResolver } from "../auth/workspace-context";
import { avatarServiceFromEnvironment, type AvatarService } from "./avatar-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });

/**
 * AVATAR-IKON (design §4.3-4.4): a person's own avatar in one workspace, also while onboarding there.
 * No gate here but the upload's: the services ask the core (avatar.self), whose "no" reaches the screen as
 * 404 for a stranger and 403 otherwise. The upload asks the same core's list first, because it reaches
 * storage before the database is asked anything; the place it names comes from the resolved membership.
 */
export function registerAvatarRoutes(
  app: FastifyInstance,
  options: { service?: AvatarService | null; contextResolver: WorkspaceContextResolver | null },
) {
  const service = options.service === undefined ? avatarServiceFromEnvironment() : options.service;
  const unavailable = { error: "Avatar service is not configured" };

  async function actorFor(authorization: string | undefined, workspaceId: string) {
    const context = await resolveActor(authorization, workspaceId, options.contextResolver);
    return {
      actorUserId: context.userId,
      workspaceId: context.workspace.id,
      membershipId: context.membership.id,
      context,
    };
  }

  app.get("/v1/workspaces/:workspaceId/me/avatar", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const { actorUserId, workspaceId } = await actorFor(request.headers.authorization, params.data.workspaceId);
    if (!service) return reply.status(503).send(unavailable);
    return reply.send(await service.own({ actorUserId, workspaceId }));
  });

  app.post("/v1/workspaces/:workspaceId/me/avatar/upload", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, params.data.workspaceId);
    authorize(actor.context, "avatar.self");
    const body = avatarUploadRequestSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "A photo must be a JPG, PNG or WebP image" });
    if (!service) return reply.status(503).send(unavailable);
    return reply.send(
      await service.prepareUpload({
        actorUserId: actor.actorUserId,
        workspaceId: actor.workspaceId,
        membershipId: actor.membershipId,
        contentType: body.data.content_type,
      }),
    );
  });

  app.put("/v1/workspaces/:workspaceId/me/avatar", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, params.data.workspaceId);
    const body = avatarChoiceSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Choose a drawing, an uploaded photo or your last avatar" });
    if (!service) return reply.status(503).send(unavailable);
    await service.save({
      actorUserId: actor.actorUserId,
      workspaceId: actor.workspaceId,
      membershipId: actor.membershipId,
      choice: body.data,
    });
    return reply.status(204).send();
  });

  app.delete("/v1/workspaces/:workspaceId/me/avatar", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const { actorUserId, workspaceId } = await actorFor(request.headers.authorization, params.data.workspaceId);
    if (!service) return reply.status(503).send(unavailable);
    await service.remove({ actorUserId, workspaceId });
    return reply.status(204).send();
  });

  app.get("/v1/workspaces/:workspaceId/me/last-avatar", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const { actorUserId, workspaceId } = await actorFor(request.headers.authorization, params.data.workspaceId);
    if (!service) return reply.status(503).send(unavailable);
    return reply.send(await service.last({ actorUserId, workspaceId }));
  });
}
