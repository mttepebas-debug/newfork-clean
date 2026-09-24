import { timeOffDecisionInputSchema } from "@newfork/shared/schedule";
import type { Permission } from "@newfork/shared";
import { timeOffAssignmentPreviewInputSchema } from "@newfork/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { WorkspaceContextResolver } from "../auth/workspace-context";
import type { ScheduleRequestsService } from "./schedule-requests-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const requestParams = workspaceParams.extend({ requestId: z.string().uuid() });
const activeRequestParams = z.object({ requestId: z.string().uuid() });
const explicitWorkspaceHeaderSchema = z.string().uuid();
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
  for (const explicit of [false, true]) app.post(
    `${explicit ? "/v1/workspaces/:workspaceId" : ""}/schedule/requests/time-off/:requestId/assignment-preview`,
    async (request, reply) => {
      const params = (explicit ? requestParams : activeRequestParams).safeParse(request.params);
      const body = timeOffAssignmentPreviewInputSchema.safeParse(request.body);
      if (!params.success || !body.success) return reply.status(400).send({ error: "Valid time off approval preview required" });
      const context = explicit && "workspaceId" in params.data
        ? await authorizeAny(request.headers.authorization, params.data.workspaceId as string, ["schedule.time_off_requests.manage"], options)
        : await authorizeAnyActive(request, ["schedule.time_off_requests.manage"], options);
      if (context === "workspace_mismatch") return reply.status(404).send({ error: "Workspace not found" });
      if (!context) return reply.status(403).send({ error: "Time off management access required" });
      if (!options.service) return reply.status(503).send({ error: "Schedule request service is not configured" });
      try {
        return reply.send(await options.service.previewTimeOffAssignment({ actorUserId: context.userId, workspaceId: context.workspace.id, requestId: params.data.requestId, decision: body.data }));
      } catch (error) { return requestError(reply, error); }
    },
  );
  app.get(
    "/v1/workspaces/:workspaceId/schedule/requests",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const query = querySchema.safeParse(request.query);
      if (!params.success || !query.success)
        return reply
          .status(400)
          .send({ error: "Valid schedule request query required" });
      const context = await authorizeAny(
        request.headers.authorization,
        params.data.workspaceId,
        [
          "schedule.time_off_requests.read",
          "schedule.shift_change_requests.read",
        ],
        options,
      );
      if (context === "workspace_mismatch")
        return reply.status(404).send({ error: "Workspace not found" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule request read access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule request service is not configured" });
      try {
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
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/schedule/requests/time-off/:requestId/viewed",
    async (request, reply) => {
      const params = requestParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid request required" });
      const context = await authorizeAny(
        request.headers.authorization,
        params.data.workspaceId,
        ["schedule.time_off_requests.read"],
        options,
      );
      if (context === "workspace_mismatch")
        return reply.status(404).send({ error: "Workspace not found" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Time off read access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule request service is not configured" });
      try {
        return reply.send(
          await options.service.markTimeOffViewed({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            requestId: params.data.requestId,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/schedule/requests/time-off/:requestId/decision",
    async (request, reply) => {
      const params = requestParams.safeParse(request.params);
      const body = timeOffDecisionInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid time off decision required" });
      const context = await authorizeAny(
        request.headers.authorization,
        params.data.workspaceId,
        ["schedule.time_off_requests.manage"],
        options,
      );
      if (context === "workspace_mismatch")
        return reply.status(404).send({ error: "Workspace not found" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Time off management access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule request service is not configured" });
      try {
        return reply.send(
          await options.service.resolveTimeOff({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            requestId: params.data.requestId,
            decision: body.data,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.get("/schedule/requests", async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    if (!query.success)
      return reply
        .status(400)
        .send({ error: "Valid schedule request query required" });
    const context = await authorizeAnyActive(
      request,
      [
        "schedule.time_off_requests.read",
        "schedule.shift_change_requests.read",
      ],
      options,
    );
    if (!context)
      return reply
        .status(403)
        .send({ error: "Schedule request read access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule request service is not configured" });
    try {
      return reply.send(
        await options.service.get({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          timeOffQueue: query.data.time_off_queue,
          locationId: query.data.location_id ?? null,
          search: query.data.search,
          timeOffCursor: query.data.time_off_cursor ?? null,
          limit: query.data.limit,
        }),
      );
    } catch (error) {
      return requestError(reply, error);
    }
  });

  app.post("/schedule/requests/time-off/:requestId/viewed", async (request, reply) => {
    const params = activeRequestParams.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid request required" });
    const context = await authorizeAnyActive(
      request,
      ["schedule.time_off_requests.read"],
      options,
    );
    if (!context)
      return reply.status(403).send({ error: "Time off read access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule request service is not configured" });
    try {
      return reply.send(
        await options.service.markTimeOffViewed({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          requestId: params.data.requestId,
        }),
      );
    } catch (error) {
      return requestError(reply, error);
    }
  });

  app.post(
    "/schedule/requests/time-off/:requestId/decision",
    async (request, reply) => {
      const params = activeRequestParams.safeParse(request.params);
      const body = timeOffDecisionInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid time off decision required" });
      const context = await authorizeAnyActive(
      request,
        ["schedule.time_off_requests.manage"],
        options,
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Time off management access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule request service is not configured" });
      try {
        return reply.send(
          await options.service.resolveTimeOff({
            actorUserId: context.userId,
            workspaceId: context.workspace.id,
            requestId: params.data.requestId,
            decision: body.data,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );
}

async function authorizeAnyActive(
  source: FastifyRequest | string | undefined,
  permissions: Permission[],
  options: {
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  const authorization =
    typeof source === "string" || source === undefined
      ? source
      : source.headers.authorization;
  const workspaceId =
    typeof source === "string" || source === undefined
      ? null
      : explicitWorkspaceHeaderSchema.safeParse(
          Array.isArray(source.headers["x-newfork-workspace-id"])
            ? source.headers["x-newfork-workspace-id"][0]
            : source.headers["x-newfork-workspace-id"],
        );
  if (!options.contextResolver || !authorization?.startsWith("Bearer "))
    return null;
  const context = await options.contextResolver.resolve(
    authorization.slice("Bearer ".length).trim(),
    workspaceId && workspaceId.success ? workspaceId.data : null,
  );
  return context &&
    permissions.some((permission) => context.permissions.includes(permission))
    ? context
    : null;
}

async function authorizeAny(
  authorization: string | undefined,
  workspaceId: string,
  permissions: Permission[],
  options: {
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  if (!options.contextResolver || !authorization?.startsWith("Bearer "))
    return null;
  const context = await options.contextResolver.resolve(
    authorization.slice("Bearer ".length).trim(),
    workspaceId,
  );
  if (!context) return null;
  if (context.workspace.id !== workspaceId) return "workspace_mismatch";
  return permissions.some((permission) => context.permissions.includes(permission))
    ? context
    : null;
}

function requestError(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Request operation failed";
  if (message.includes("access denied") || message.includes("scope denied"))
    return reply.status(403).send({ error: message });
  if (message.includes("not found"))
    return reply.status(404).send({ error: message });
  if (
    message.includes("stale") ||
    message.includes("conflict") ||
    message.includes("not pending") ||
    message.includes("transition")
  )
    return reply.status(409).send({ error: message });
  return reply.status(400).send({ error: message });
}
