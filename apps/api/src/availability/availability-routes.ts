import { scheduleShiftMutationInputSchema } from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  bearerToken,
  resolveWorkspaceMembership,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { AvailabilityService } from "./availability-service";
import { legacyAvailabilityGone } from "./availability-retirement";
import { registerWeeklyPreferenceRoutes } from "./weekly-preferences-routes";

export function registerAvailabilityRoutes(
  app: FastifyInstance,
  options: {
    service: AvailabilityService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  registerWeeklyPreferenceRoutes(app, options);
  // Keep stale clients explicit and side-effect free; do not translate dated rules.
  for (const route of [
    { method: ["GET", "POST"], path: "" },
    { method: ["GET"], path: "/requests" },
    { method: ["POST"], path: "/impact" },
    { method: ["POST"], path: "/calendar" },
    { method: ["POST"], path: "/calendar-comparison" },
  ] as const) {
    app.route({
      method: [...route.method],
      url: `/v1/workspaces/:workspaceId/availability${route.path}`,
      handler: async (request, reply) => {
        const params = z.object({ workspaceId: z.string().uuid() }).safeParse(request.params);
        if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
        const auth = await resolveWorkspaceMembership({
          authorization: request.headers.authorization,
          workspaceId: params.data.workspaceId,
          resolver: options.contextResolver,
        });
        if (!auth.context) return reply.status(403).send({ error: "Workspace access required" });
        return reply.status(410).send(legacyAvailabilityGone);
      },
    });
  }
  for (const path of ["", "/calendar", "/calendar-comparison"]) {
    app.route({
      method: path ? ["POST"] : ["GET", "POST"],
      url: `/v1/me/onboarding/availability-lifecycle${path}`,
      handler: async (request, reply) => {
        if (!bearerToken(request.headers.authorization))
          return reply.status(401).send({ error: "Sign in to continue onboarding" });
        return reply.status(410).send(legacyAvailabilityGone);
      },
    });
  }
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
      if (!auth.context)
        return reply.status(403).send({ error: "Workspace access required" });
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
        const code =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "";
        const status =
          code === "42501"
            ? 403
            : ["40001", "PT409"].includes(code)
              ? 409
              : ["22023", "22007", "22P02", "23514"].includes(code)
                ? 422
                : 500;
        if (status === 500)
          request.log.error(
            { err: error },
            "Shift availability assessment failed",
          );
        return reply
          .status(status)
          .send({
            error:
              status === 500
                ? "Availability could not be checked. Please retry."
                : error instanceof Error
                  ? error.message
                  : "Unable to check availability",
          });
      }
    },
  );
}
