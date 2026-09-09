import {
  weeklyPreferenceSaveSchema,
  weeklyPreferenceSettingsSaveSchema,
} from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  bearerToken,
  resolveWorkspaceMembership,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { AvailabilityService } from "./availability-service";

type WeeklyService = Pick<
  AvailabilityService,
  | "readWeekly"
  | "readWeeklyTeam"
  | "previewWeekly"
  | "saveWeekly"
  | "onboardingReadWeekly"
  | "onboardingPreviewWeekly"
  | "onboardingSaveWeekly"
  | "readWeeklySettings"
  | "saveWeeklySettings"
>;

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
      if (!auth.context)
        return reply.status(403).send({ error: "Workspace access required." });
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
        const status = weeklyErrorStatus(error);
        if (status === 500)
          request.log.error({ err: error }, "Team availability read failed");
        return reply
          .status(status)
          .send({
            error:
              status === 500
                ? "Team availability could not be loaded."
                : error instanceof Error
                  ? error.message
                  : "Team availability is unavailable.",
          });
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
        if (!auth.context)
          return reply
            .status(403)
            .send({ error: "Workspace access required." });
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
          const status = weeklyErrorStatus(error);
          if (status === 500)
            request.log.error(
              { err: error },
              "Weekly preference settings failed",
            );
          return reply.status(status).send({
            error:
              status === 500
                ? "Availability settings could not be confirmed. Retry the same save."
                : error instanceof Error
                  ? error.message
                  : "Availability settings could not be processed.",
          });
        }
      },
    });
  }
  for (const onboarding of [false, true]) {
    const base = onboarding
      ? "/v1/me/onboarding/availability-lifecycle/weekly"
      : "/v1/workspaces/:workspaceId/availability/weekly";
    for (const operation of ["read", "preview", "save"] as const) {
      app.route({
        method: operation === "read" ? "GET" : "POST",
        url: operation === "preview" ? `${base}/preview` : base,
        handler: async (request, reply) => {
          const params = z
            .object({ workspaceId: z.string().uuid().optional() })
            .safeParse(request.params);
          const query = z
            .object({ employee_id: z.string().uuid().optional() })
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
          if (!onboarding && !auth?.context)
            return reply
              .status(403)
              .send({ error: "Workspace access required." });
          if (!options.service)
            return reply
              .status(503)
              .send({ error: "Availability is unavailable." });
          try {
            if (operation === "read")
              return onboarding
                ? await options.service.onboardingReadWeekly(token)
                : await options.service.readWeekly(
                    auth!.context!.userId,
                    params.data.workspaceId!,
                    query.data.employee_id,
                  );
            if (!command?.success)
              return reply
                .status(400)
                .send({ error: "Invalid weekly preferences." });
            if (operation === "preview")
              return onboarding
                ? await options.service.onboardingPreviewWeekly(
                    token,
                    command.data,
                  )
                : await options.service.previewWeekly(
                    auth!.context!.userId,
                    params.data.workspaceId!,
                    command.data,
                  );
            if (!key?.success)
              return reply
                .status(400)
                .send({ error: "A save key is required." });
            return onboarding
              ? await options.service.onboardingSaveWeekly(
                  token,
                  command.data,
                  key.data,
                )
              : await options.service.saveWeekly(
                  auth!.context!.userId,
                  params.data.workspaceId!,
                  command.data,
                  key.data,
                );
          } catch (error) {
            const status = weeklyErrorStatus(error);
            if (status === 500)
              request.log.error(
                { err: error },
                "Weekly preference operation failed",
              );
            return reply.status(status).send({
              error:
                status === 500
                  ? "Availability could not be processed. Your changes have not been confirmed; retry the same save."
                  : error instanceof Error
                    ? error.message
                    : "Availability could not be processed.",
            });
          }
        },
      });
    }
  }
}

function weeklyErrorStatus(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  return code === "42501"
    ? 403
    : code === "P0002"
      ? 404
      : ["40001", "PT409"].includes(code)
        ? 409
        : ["22023", "22007", "22P02", "23514"].includes(code)
          ? 422
          : 500;
}
