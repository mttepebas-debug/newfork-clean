import { lineupCommandInputSchema, lineupDayQuerySchema, lineupEditInputSchema, type AuthzAction } from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authorize, resolveActor, type WorkspaceContextResolver } from "../auth/workspace-context";
import { lineupServiceFromEnvironment, type LineupService } from "./lineup-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const dayParams = workspaceParams.extend({ date: z.string().date() });
const versionParams = workspaceParams.extend({ versionId: z.string().uuid() });

// ?location_ids=a,b&shift_type_ids=c: comma-separated; an absent list reads everything the actor may.
const idList = z.string().transform((value) => value.split(","));
const dayQuery = z.object({ location_ids: idList.optional(), shift_type_ids: idList.optional() }).pipe(lineupDayQuerySchema);

/**
 * LINEUP-PUBLISH: a manager publishes a day's lineups or takes them back (lineup.share, where she may publish
 * the Schedule); an employee reads the published lineups she is on and acknowledges one. A stranger gets 404
 * (authz.not_member), anyone else without the action 403; where exactly is the database's to answer.
 */
export function registerLineupRoutes(
  app: FastifyInstance,
  options: { service?: LineupService | null; contextResolver: WorkspaceContextResolver | null },
) {
  const service = options.service === undefined ? lineupServiceFromEnvironment() : options.service;
  const unavailable = { error: "Lineup service is not configured" };

  async function actorFor(authorization: string | undefined, workspaceId: string, action: AuthzAction) {
    const context = authorize(await resolveActor(authorization, workspaceId, options.contextResolver), action);
    return { actorUserId: context.userId, workspaceId: context.workspace.id };
  }

  app.post("/v1/workspaces/:workspaceId/lineups/commands", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, params.data.workspaceId, "lineup.share");
    const body = lineupCommandInputSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Choose lineups to publish or unpublish" });
    if (!service) return reply.status(503).send(unavailable);
    return reply.send(await service.command({ ...actor, command: body.data }));
  });

  // LINEUP-EDIT L2a: a draft lineup's row or notes, by who may publish it there.
  app.post("/v1/workspaces/:workspaceId/lineups/edit", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, params.data.workspaceId, "lineup.share");
    const body = lineupEditInputSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Choose what to change in the lineup" });
    if (!service) return reply.status(503).send(unavailable);
    return reply.send(await service.edit({ ...actor, edit: body.data }));
  });

  app.get("/v1/workspaces/:workspaceId/lineups/:date", async (request, reply) => {
    const workspace = workspaceParams.safeParse(request.params);
    if (!workspace.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, workspace.data.workspaceId, "lineup.read");
    const params = dayParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid day required" });
    const query = dayQuery.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: "Valid locations and shift types required" });
    if (!service) return reply.status(503).send(unavailable);
    return reply.send(await service.day({
      ...actor,
      date: params.data.date,
      ...(query.data.location_ids ? { locationIds: query.data.location_ids } : {}),
      ...(query.data.shift_type_ids ? { shiftTypeIds: query.data.shift_type_ids } : {}),
    }));
  });

  app.get("/v1/workspaces/:workspaceId/my-lineups/:date", async (request, reply) => {
    const workspace = workspaceParams.safeParse(request.params);
    if (!workspace.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, workspace.data.workspaceId, "employee_hub.read");
    const params = dayParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid day required" });
    if (!service) return reply.status(503).send(unavailable);
    return reply.send(await service.myLineups({ ...actor, date: params.data.date }));
  });

  app.post("/v1/workspaces/:workspaceId/lineups/versions/:versionId/acknowledge", async (request, reply) => {
    const workspace = workspaceParams.safeParse(request.params);
    if (!workspace.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await actorFor(request.headers.authorization, workspace.data.workspaceId, "lineup.acknowledge");
    const params = versionParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid lineup version required" });
    if (!service) return reply.status(503).send(unavailable);
    return reply.send(await service.acknowledge({ ...actor, versionId: params.data.versionId }));
  });
}
