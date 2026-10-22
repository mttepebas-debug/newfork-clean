import { timeOffAskInputSchema, timeOffWithdrawInputSchema, type AuthzAction } from "@newfork/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authorize, resolveActor, type WorkspaceContextResolver } from "../auth/workspace-context";
import type { TimeOffRequestsService } from "./time-off-requests-service";

const requestParams = z.object({ id: z.string().uuid() });

/**
 * The new time off's routes open only where it is ready: everywhere but production, and in production once
 * TIME_OFF_READY is "true" (time off rebuild, removed in D7 with the old system).
 */
export function timeOffRequestsReady(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" || env.TIME_OFF_READY === "true";
}

// Time off rebuild D2 (KARARLAR S-239): the employee's own time off in the new table. The gate is the core's
// list of actions; the database asks the core again for the request itself and decides every rule.
export function registerTimeOffRequestsRoutes(
  app: FastifyInstance,
  options: { service: TimeOffRequestsService | null; contextResolver: WorkspaceContextResolver | null },
) {
  async function gate(request: FastifyRequest, action: AuthzAction) {
    const { workspaceId } = request.params as { workspaceId?: string };
    const context = authorize(
      await resolveActor(request.headers.authorization, workspaceId ?? "", options.contextResolver),
      action,
    );
    return { actorUserId: context.userId, workspaceId: context.workspace.id };
  }

  function unavailable(reply: FastifyReply) {
    return reply.status(503).send({ error: "Time off is not configured" });
  }

  app.get("/v1/workspaces/:workspaceId/time-off-requests/mine", async (request, reply) => {
    const actor = await gate(request, "employee_hub.read");
    if (!options.service) return unavailable(reply);
    return reply.send(await options.service.mine(actor));
  });

  app.post("/v1/workspaces/:workspaceId/time-off-requests", async (request, reply) => {
    const actor = await gate(request, "time_off.request_own");
    const body = timeOffAskInputSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Choose a type, the days, and the hours unless it is all day" });
    if (!options.service) return unavailable(reply);
    return reply.send(await options.service.ask({ ...actor, request: body.data }));
  });

  app.post("/v1/workspaces/:workspaceId/time-off-requests/:id/withdraw", async (request, reply) => {
    const actor = await gate(request, "time_off.request_own");
    const params = requestParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid time off request required" });
    const body = timeOffWithdrawInputSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Valid request revision required" });
    if (!options.service) return unavailable(reply);
    return reply.send(
      await options.service.withdraw({ ...actor, requestId: params.data.id, expectedRevision: body.data.expected_revision }),
    );
  });
}
