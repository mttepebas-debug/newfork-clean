import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveActor, type WorkspaceContextResolver } from "../auth/workspace-context";
import type { ScheduleRequestsService } from "./schedule-requests-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const querySchema = z.object({
  time_off_queue: z.enum(["needs_review", "closed"]).default("needs_review"),
  location_id: z.string().uuid().optional(),
  search: z.string().trim().max(120).default(""),
  time_off_cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export function registerScheduleRequestsRoutes(
  app: FastifyInstance,
  options: {
    service: ScheduleRequestsService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  // EKRAN-02 B1 (R2-21): the one read route. Who may read which list is the
  // authorization core's answer (requests.read, exchange.read): its no comes
  // back as 403 + authz.*, a stranger's as 404.
  app.get(
    "/v1/workspaces/:workspaceId/schedule/requests",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const query = querySchema.safeParse(request.query);
      if (!params.success || !query.success)
        return reply
          .status(400)
          .send({ error: "Valid schedule request query required" });
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule request service is not configured" });
      return reply.send(
        await options.service.get({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          timeOffQueue: query.data.time_off_queue,
          locationId: query.data.location_id ?? null,
          search: query.data.search,
          timeOffCursor: query.data.time_off_cursor ?? null,
          limit: query.data.limit,
        }),
      );
    },
  );
}
