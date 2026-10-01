import {
  timeOffCancellationRequestInputSchema,
  timeOffRevokeInputSchema,
  timeOffSubmitInputSchema,
  timeOffVerdictInputSchema,
} from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveActor, type WorkspaceContextResolver } from "../auth/workspace-context";
import type { TimeOffVotingService } from "./time-off-voting-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const requestParams = workspaceParams.extend({ requestId: z.string().uuid() });
type Actor = { actorUserId: string; workspaceId: string };

/**
 * FB-6.3: time off asked for, voted on and revoked. No gate here: every
 * service asks the authorization core, and its "no" reaches the screen
 * through the global error handler as 404 (not a member) or 403.
 */
export function registerTimeOffVotingRoutes(
  app: FastifyInstance,
  options: { service: TimeOffVotingService | null; contextResolver: WorkspaceContextResolver | null },
) {
  function route<P extends z.ZodType<{ workspaceId: string }>, B extends z.ZodTypeAny>(
    path: string,
    params: P,
    body: B,
    invalid: string,
    run: (service: TimeOffVotingService, actor: Actor, params: z.infer<P>, body: z.infer<B>) => Promise<unknown>,
  ) {
    app.post(`/v1/workspaces/:workspaceId/time-off${path}`, async (request, reply) => {
      const parsedParams = params.safeParse(request.params);
      const parsedBody = body.safeParse(request.body);
      if (!parsedParams.success || !parsedBody.success) return reply.status(400).send({ error: invalid });
      const actor = await resolveActor(request.headers.authorization, parsedParams.data.workspaceId, options.contextResolver);
      if (!options.service) return reply.status(503).send({ error: "Time off service is not configured" });
      return reply.send(await run(options.service, { actorUserId: actor.userId, workspaceId: actor.workspace.id }, parsedParams.data, parsedBody.data));
    });
  }

  route("", workspaceParams, timeOffSubmitInputSchema, "Choose one run of days in a row to request",
    (service, actor, _params, request) => service.submit({ ...actor, request }));
  route("/:requestId/cancellation", requestParams, timeOffCancellationRequestInputSchema, "Choose approved hours to cancel",
    (service, actor, params, cancellation) => service.requestCancellation({ ...actor, requestId: params.requestId, cancellation }));
  route("/:requestId/verdict", requestParams, timeOffVerdictInputSchema, "Approve or deny the time off you reviewed",
    (service, actor, params, verdict) => service.decide({ ...actor, requestId: params.requestId, verdict }));
  route("/:requestId/revoke", requestParams, timeOffRevokeInputSchema, "Say why the time off is revoked",
    (service, actor, params, revoke) => service.revoke({ ...actor, requestId: params.requestId, revoke }));
}
