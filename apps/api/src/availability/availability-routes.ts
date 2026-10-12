import { scheduleShiftMutationInputSchema } from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  notMember,
  resolveWorkspaceMembership,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import { HttpError } from "../http-error";
import type { AvailabilityService } from "./availability-service";
import { registerWeeklyPreferenceRoutes } from "./weekly-preferences-routes";

export function registerAvailabilityRoutes(
  app: FastifyInstance,
  options: {
    service: AvailabilityService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  registerWeeklyPreferenceRoutes(app, options);
  app.post(
    "/v1/workspaces/:workspaceId/availability/shift-assessment",
    async (request, reply) => {
      const params = z
        .object({ workspaceId: z.string().uuid() })
        .safeParse(request.params);
      const input = z
        .object({
          shift: scheduleShiftMutationInputSchema,
          shift_id: z.string().uuid().optional(),
          session_id: z.string().uuid().optional(),
        })
        .safeParse(request.body);
      if (!params.success || !input.success)
        return reply
          .status(400)
          .send({
            error: "Choose an employee and a valid shift to check availability",
          });
      const auth = await resolveWorkspaceMembership({
        authorization: request.headers.authorization,
        workspaceId: params.data.workspaceId,
        resolver: options.contextResolver,
      });
      // BL-794: somebody else's workspace is simply not there (one "no").
      if (!auth.context)
        throw notMember();
      if (!options.service)
        return reply.status(503).send({ error: "Availability is unavailable" });
      try {
        return await options.service.assessShift(
          auth.context.userId,
          params.data.workspaceId,
          input.data.shift,
          input.data.shift_id,
          input.data.session_id,
        );
      } catch (error) {
        if (error instanceof HttpError && error.statusCode < 500) throw error;
        request.log.error({ err: error }, "Shift availability assessment failed");
        return reply.status(500).send({ error: "Availability could not be checked. Please retry." });
      }
    },
  );
}
