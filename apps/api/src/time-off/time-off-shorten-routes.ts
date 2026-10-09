import { timeOffShortenInputSchema } from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveActor, type WorkspaceContextResolver } from "../auth/workspace-context";
import type { TimeOffShortenService } from "./time-off-shorten-service";

const params = z.object({ workspaceId: z.string().uuid(), requestId: z.string().uuid() });

/**
 * POST /v1/workspaces/:workspaceId/time-off/:requestId/shorten (BL-127). No
 * gate here: the service asks the authorization core (time_off.decide), and
 * its "no" reaches the screen through the global error handler as 404 (not a
 * member) or 403.
 */
export function registerTimeOffShortenRoutes(
  app: FastifyInstance,
  options: {
    service: TimeOffShortenService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  app.post("/v1/workspaces/:workspaceId/time-off/:requestId/shorten", async (request, reply) => {
    const parsed = params.safeParse(request.params);
    const body = timeOffShortenInputSchema.safeParse(request.body);
    if (!parsed.success || !body.success)
      return reply.status(400).send({ error: "Choose approved hours of this time off to give back" });
    const actor = await resolveActor(
      request.headers.authorization,
      parsed.data.workspaceId,
      options.contextResolver,
    );
    if (!options.service)
      return reply.status(503).send({ error: "Time off service is not configured" });
    return reply.send(
      await options.service.shorten({
        actorUserId: actor.userId,
        workspaceId: actor.workspace.id,
        requestId: parsed.data.requestId,
        change: body.data,
      }),
    );
  });
}
