import {
  managerManualTimeEntryInputSchema,
  managerTimeAmendmentInputSchema,
  timeCorrectionDecisionInputSchema,
  approveTimeReviewWindowInputSchema,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { WorkspaceContextResolver } from "../auth/workspace-context";
import type { TimeEntriesService } from "./time-entries-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const sessionParams = workspaceParams.extend({ sessionId: z.string().uuid() });
const correctionParams = workspaceParams.extend({
  correctionId: z.string().uuid(),
});
const rangeQuery = z.object({ from: z.string().date(), to: z.string().date() });
const idempotencyKeySchema = z.string().uuid();

export function registerTimeEntriesRoutes(
  app: FastifyInstance,
  options: {
    service: TimeEntriesService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  app.get(
    "/v1/workspaces/:workspaceId/time-entries",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const query = rangeQuery.safeParse(request.query);
      if (!params.success || !query.success)
        return reply
          .status(400)
          .send({ error: "Valid time entry range required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!context || !context.permissions.includes("time.read.location"))
        return reply.status(403).send({ error: "Location time read required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Time Entries service is not configured" });
      try {
        return reply.send(
          await options.service.get({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            ...query.data,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/time-entries/manual",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = managerManualTimeEntryInputSchema.safeParse(request.body);
      const idempotencyKey = idempotencyKeySchema.safeParse(
        request.headers["idempotency-key"],
      );
      if (!params.success || !body.success || !idempotencyKey.success)
        return reply.status(400).send({
          error: "Valid manual time entry and Idempotency-Key required",
        });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!context || !context.permissions.includes("time.amend.location"))
        return reply
          .status(403)
          .send({ error: "Location time amendment required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Time Entries service is not configured" });
      try {
        return reply.status(201).send(
          await options.service.createManual({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            entry: body.data,
            idempotencyKey: idempotencyKey.data,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/time-entries/:sessionId",
    async (request, reply) => {
      const params = sessionParams.safeParse(request.params);
      const body = managerTimeAmendmentInputSchema.safeParse(request.body);
      const idempotencyKey = idempotencyKeySchema.safeParse(
        request.headers["idempotency-key"],
      );
      if (!params.success || !body.success || !idempotencyKey.success)
        return reply.status(400).send({
          error: "Valid time amendment and Idempotency-Key required",
        });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!context || !context.permissions.includes("time.amend.location"))
        return reply
          .status(403)
          .send({ error: "Location time amendment required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Time Entries service is not configured" });
      try {
        return reply.send(
          await options.service.amend({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            sessionId: params.data.sessionId,
            amendment: body.data,
            idempotencyKey: idempotencyKey.data,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/time-entries/corrections/:correctionId/decision",
    async (request, reply) => {
      const params = correctionParams.safeParse(request.params);
      const body = timeCorrectionDecisionInputSchema.safeParse(request.body);
      const idempotencyKey = idempotencyKeySchema.safeParse(
        request.headers["idempotency-key"],
      );
      if (!params.success || !body.success || !idempotencyKey.success)
        return reply.status(400).send({
          error: "Valid correction decision and Idempotency-Key required",
        });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (
        !context ||
        !context.permissions.includes("time.correction.review.location")
      )
        return reply
          .status(403)
          .send({ error: "Location correction review required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Time Entries service is not configured" });
      try {
        return reply.send(
          await options.service.decideCorrection({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            correctionId: params.data.correctionId,
            decision: body.data,
            idempotencyKey: idempotencyKey.data,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/time-entries/review-windows",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = approveTimeReviewWindowInputSchema.safeParse(request.body);
      const idempotencyKey = idempotencyKeySchema.safeParse(
        request.headers["idempotency-key"],
      );
      if (!params.success || !body.success || !idempotencyKey.success)
        return reply.status(400).send({
          error: "Valid review window and Idempotency-Key required",
        });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (
        !context ||
        !context.permissions.includes("time.review.approve.location")
      )
        return reply
          .status(403)
          .send({ error: "Location time review approval required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Time Entries service is not configured" });
      try {
        return reply.status(201).send(
          await options.service.approveReviewWindow({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            review: body.data,
            idempotencyKey: idempotencyKey.data,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );
}

async function authorize(
  authorization: string | undefined,
  workspaceId: string,
  resolver: WorkspaceContextResolver | null,
) {
  if (!resolver || !authorization?.startsWith("Bearer ")) return null;
  const context = await resolver.resolve(authorization.slice(7).trim());
  return context?.workspace.id === workspaceId &&
    context.membership.status === "active"
    ? context
    : null;
}

function requestError(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Time Entries operation failed";
  if (message.includes("denied") || message.includes("assignment required"))
    return reply.status(403).send({ error: message });
  if (message.includes("not found"))
    return reply.status(404).send({ error: message });
  if (
    message.includes("stale") ||
    message.includes("conflict") ||
    message.includes("exists")
  )
    return reply.status(409).send({ error: message });
  return reply.status(400).send({ error: message });
}
