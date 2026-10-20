import { avatarChoiceSchema, avatarUploadRequestSchema } from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bearerToken, signedOut } from "../auth/workspace-context";
import { avatarServiceFromEnvironment, type AvatarService } from "./avatar-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });

/**
 * AVATAR-IKON (design §4.3-4.4): a person's own avatar in one workspace, also while onboarding there (5.1).
 * No route asks for an active workspace context, which opens only once onboarding is approved: the session
 * names the person and the database's core (avatar.self) answers every "no", as a 404 to a stranger and a
 * 403 otherwise. The upload and a photo's save ask the core before storage is reached (the service's own
 * place); the place is the membership the core said yes to.
 */
export function registerAvatarRoutes(app: FastifyInstance, options: { service?: AvatarService | null }) {
  const service = options.service === undefined ? avatarServiceFromEnvironment() : options.service;
  const unavailable = { error: "Avatar service is not configured" };

  /** Who is asking, from their session; null when the service is not configured. */
  async function actorFor(authorization: string | undefined, workspaceId: string) {
    const token = bearerToken(authorization);
    if (!token) throw signedOut();
    if (!service) return null;
    const actorUserId = await service.actor(token);
    if (!actorUserId) throw signedOut();
    return { actorUserId, workspaceId };
  }

  app.get("/v1/workspaces/:workspaceId/me/avatar", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, params.data.workspaceId);
    if (!service || !actor) return reply.status(503).send(unavailable);
    return reply.send(await service.own(actor));
  });

  app.post("/v1/workspaces/:workspaceId/me/avatar/upload", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, params.data.workspaceId);
    const body = avatarUploadRequestSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "A photo must be a JPG, PNG or WebP image" });
    if (!service || !actor) return reply.status(503).send(unavailable);
    return reply.send(await service.prepareUpload({ ...actor, contentType: body.data.content_type }));
  });

  app.put("/v1/workspaces/:workspaceId/me/avatar", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, params.data.workspaceId);
    const body = avatarChoiceSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Choose a drawing, an uploaded photo or your last avatar" });
    if (!service || !actor) return reply.status(503).send(unavailable);
    await service.save({ ...actor, choice: body.data });
    return reply.status(204).send();
  });

  app.delete("/v1/workspaces/:workspaceId/me/avatar", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, params.data.workspaceId);
    if (!service || !actor) return reply.status(503).send(unavailable);
    await service.remove(actor);
    return reply.status(204).send();
  });

  app.get("/v1/workspaces/:workspaceId/me/last-avatar", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, params.data.workspaceId);
    if (!service || !actor) return reply.status(503).send(unavailable);
    return reply.send(await service.last(actor));
  });
}
