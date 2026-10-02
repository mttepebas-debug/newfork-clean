import { importantDateInputSchema, importantDateStateActionSchema } from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveActor, type WorkspaceContextResolver } from "../auth/workspace-context";
import type { ImportantDatesService } from "./important-dates-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const dateParams = workspaceParams.extend({ importantDateId: z.string().uuid() });
const stateParams = dateParams.extend({ action: importantDateStateActionSchema });

// No gate here: every one of these asks the core in the database (FB-6.7,
// important_date.write / .write_wide, settings.important_dates.read), and its
// "no" reaches the screen as 404 or 403 with its reason.
export function registerImportantDatesRoutes(
  app: FastifyInstance,
  options: { service: ImportantDatesService | null; contextResolver: WorkspaceContextResolver | null },
) {
  const base = "/v1/workspaces/:workspaceId/settings/important-dates";
  const unavailable = { error: "Important dates service is not configured" };

  app.post(base, async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    const body = importantDateInputSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: "Valid important date required" });
    const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
    if (!options.service) return reply.status(503).send(unavailable);
    return reply.status(201).send(
      await options.service.save({
        actorUserId: context.userId, workspaceId: params.data.workspaceId, importantDateId: null, date: body.data,
      }),
    );
  });

  app.put(`${base}/:importantDateId`, async (request, reply) => {
    const params = dateParams.safeParse(request.params);
    const body = importantDateInputSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: "Valid important date required" });
    const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
    if (!options.service) return reply.status(503).send(unavailable);
    return reply.send(
      await options.service.save({
        actorUserId: context.userId, workspaceId: params.data.workspaceId,
        importantDateId: params.data.importantDateId, date: body.data,
      }),
    );
  });

  // Unpublish, republish, archive, restore (Mert, 2026-10-02).
  app.post(`${base}/:importantDateId/:action`, async (request, reply) => {
    const params = stateParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid important date action required" });
    const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
    if (!options.service) return reply.status(503).send(unavailable);
    return reply.send(
      await options.service.setState({
        actorUserId: context.userId, workspaceId: params.data.workspaceId,
        importantDateId: params.data.importantDateId, action: params.data.action,
      }),
    );
  });

  app.get(`${base}/:importantDateId/history`, async (request, reply) => {
    const params = dateParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid important date required" });
    const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
    if (!options.service) return reply.status(503).send(unavailable);
    return reply.send(
      await options.service.history({
        actorUserId: context.userId, workspaceId: params.data.workspaceId, importantDateId: params.data.importantDateId,
      }),
    );
  });
}
