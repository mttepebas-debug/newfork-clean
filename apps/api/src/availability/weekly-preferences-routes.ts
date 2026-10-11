import {
  weeklyPreferenceSaveSchema,
  weeklyPreferenceSettingsSaveSchema,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  bearerToken,
  resolveWorkspaceMembership,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import { HttpError } from "../http-error";
import type { AvailabilityService } from "./availability-service";

type WeeklyService = Pick<
  AvailabilityService,
  | "readWeekly"
  | "readWeeklyTeam"
  | "saveWeekly"
  | "onboardingReadWeekly"
  | "onboardingSaveWeekly"
  | "readWeeklySettings"
  | "saveWeeklySettings"
>;

// The "no" contract: to somebody who is not in it the workspace is not there.
// BL-794: the one "not a member" answer, reason included, so the web reads
// it as no access.
function workspaceNotFound(reply: FastifyReply) {
  return reply
    .status(404)
    .send({ error: "Workspace not found", reason: "authz.not_member" });
}

export function registerWeeklyPreferenceRoutes(
  app: FastifyInstance,
  options: {
    service: WeeklyService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  app.get(
    "/v1/workspaces/:workspaceId/availability/weekly/team",
    async (request, reply) => {
      const params = z
        .object({ workspaceId: z.string().uuid() })
        .safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Provide a valid workspace." });
      if (!bearerToken(request.headers.authorization))
        return reply
          .status(401)
          .send({ error: "Sign in to view team availability." });
      const auth = await resolveWorkspaceMembership({
        authorization: request.headers.authorization,
        workspaceId: params.data.workspaceId,
        resolver: options.contextResolver,
      });
      if (!auth.context) return workspaceNotFound(reply);
      if (!auth.context.permissions.includes("availability.read"))
        return reply
          .status(403)
          .send({ error: "Team availability access required." });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Availability is unavailable." });
      try {
        return await options.service.readWeeklyTeam(
          auth.context.userId,
          params.data.workspaceId,
        );
      } catch (error) {
        if (error instanceof HttpError && error.statusCode < 500) throw error;
        request.log.error({ err: error }, "Team availability read failed");
        return reply.status(500).send({ error: "Team availability could not be loaded." });
      }
    },
  );
  for (const method of ["GET", "POST"] as const) {
    app.route({
      method,
      url: "/v1/workspaces/:workspaceId/availability/weekly/settings",
      handler: async (request, reply) => {
        const params = z
          .object({ workspaceId: z.string().uuid() })
          .safeParse(request.params);
        const command =
          method === "POST"
            ? weeklyPreferenceSettingsSaveSchema.safeParse(request.body)
            : null;
        const key =
          method === "POST"
            ? z.string().uuid().safeParse(request.headers["idempotency-key"])
            : null;
        if (
          !params.success ||
          (command && !command.success) ||
          (key && !key.success)
        )
          return reply.status(400).send({
            error: "Provide valid availability settings and a save key.",
          });
        if (!bearerToken(request.headers.authorization))
          return reply
            .status(401)
            .send({ error: "Sign in to manage availability." });
        const auth = await resolveWorkspaceMembership({
          authorization: request.headers.authorization,
          workspaceId: params.data.workspaceId,
          resolver: options.contextResolver,
        });
        // The core decides who reads and saves the settings
        // (settings.availability.read/write).
        if (!auth.context) return workspaceNotFound(reply);
        if (!options.service)
          return reply
            .status(503)
            .send({ error: "Availability is unavailable." });
        try {
          return command?.success && key?.success
            ? await options.service.saveWeeklySettings(
                auth.context.userId,
                params.data.workspaceId,
                command.data,
                key.data,
              )
            : await options.service.readWeeklySettings(
                auth.context.userId,
                params.data.workspaceId,
              );
        } catch (error) {
          if (error instanceof HttpError && error.statusCode < 500) throw error;
          request.log.error({ err: error }, "Weekly preference settings failed");
          return reply.status(500).send({ error: "Availability settings could not be confirmed. Retry the same save." });
        }
      },
    });
  }
  for (const onboarding of [false, true]) {
    const base = onboarding
      ? "/v1/me/onboarding/availability/weekly"
      : "/v1/workspaces/:workspaceId/availability/weekly";
    // M5: a save decides nothing about pending requests, so nothing is previewed.
    for (const operation of ["read", "save"] as const) {
      app.route({
        method: operation === "read" ? "GET" : "POST",
        url: base,
        handler: async (request, reply) => {
          const params = z
            .object({ workspaceId: z.string().uuid().optional() })
            .safeParse(request.params);
          const query = z
            .object({
              employee_id: z.string().uuid().optional(),
              // Onboarding only: selects the case when several are open.
              workspaceId: z.string().uuid().optional(),
            })
            .safeParse(request.query);
          const command =
            operation === "read"
              ? null
              : weeklyPreferenceSaveSchema.safeParse(request.body);
          const key =
            operation === "save"
              ? z.string().uuid().safeParse(request.headers["idempotency-key"])
              : null;
          if (
            !params.success ||
            (!onboarding && !params.data.workspaceId) ||
            !query.success ||
            (command && !command.success) ||
            (key && !key.success)
          )
            return reply.status(400).send({
              error: "Provide a valid weekly preference command and save key.",
            });
          const token = bearerToken(request.headers.authorization);
          if (!token)
            return reply
              .status(401)
              .send({ error: "Sign in to manage availability." });
          const auth = onboarding
            ? null
            : await resolveWorkspaceMembership({
                authorization: request.headers.authorization,
                workspaceId: params.data.workspaceId!,
                resolver: options.contextResolver,
              });
          if (!onboarding && !auth?.context) return workspaceNotFound(reply);
          if (!options.service)
            return reply
              .status(503)
              .send({ error: "Availability is unavailable." });
          try {
            if (operation === "read")
              return onboarding
                ? await options.service.onboardingReadWeekly(
                    token,
                    query.data.workspaceId,
                  )
                : await options.service.readWeekly(
                    auth!.context!.userId,
                    params.data.workspaceId!,
                    query.data.employee_id,
                  );
            if (!command?.success)
              return reply
                .status(400)
                .send({ error: "Invalid weekly preferences." });
            if (!key?.success)
              return reply
                .status(400)
                .send({ error: "A save key is required." });
            return onboarding
              ? await options.service.onboardingSaveWeekly(
                  token,
                  command.data,
                  key.data,
                  query.data.workspaceId,
                )
              : await options.service.saveWeekly(
                  auth!.context!.userId,
                  params.data.workspaceId!,
                  command.data,
                  key.data,
                );
          } catch (error) {
            if (error instanceof HttpError && error.statusCode < 500) throw error;
            request.log.error({ err: error }, "Weekly preference operation failed");
            return reply.status(500).send({ error: "Availability could not be processed. Your changes have not been confirmed; retry the same save." });
          }
        },
      });
    }
  }
}
