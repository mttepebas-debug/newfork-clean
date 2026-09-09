import { exchangeCommandSchema } from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  resolveWorkspaceMembership,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { ShiftExchangesService } from "./shift-exchanges-service";

const paramsSchema = z.object({ workspaceId: z.string().uuid() });
const querySchema = z.object({
  view: z.enum(["employee", "manager"]).default("employee"),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  shift_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  application_id: z.string().uuid().optional(),
});
export function registerShiftExchangesRoutes(
  app: FastifyInstance,
  options: {
    service: ShiftExchangesService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  app.route({
    method: ["GET", "POST"],
    url: "/v1/workspaces/:workspaceId/shift-exchanges/schedule-recovery/:sessionId",
    handler: async (request, reply) => {
      const params = paramsSchema
        .extend({ sessionId: z.string().uuid() })
        .safeParse(request.params);
      const body =
        request.method === "POST"
          ? z.object({ fingerprint: z.string().min(1) }).safeParse(request.body)
          : null;
      const key =
        request.method === "POST"
          ? z.string().uuid().safeParse(request.headers["idempotency-key"])
          : null;
      if (!params.success || (body && !body.success) || (key && !key.success))
        return reply
          .status(400)
          .send({
            error: "A valid comparison and idempotency key are required",
          });
      const auth = await resolveWorkspaceMembership({
        authorization: request.headers.authorization,
        workspaceId: params.data.workspaceId,
        resolver: options.contextResolver,
      });
      if (!auth.context)
        return reply.status(403).send({ error: "Workspace access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule recovery is unavailable" });
      try {
        return await options.service.recoverSchedule(
          auth.context.userId,
          params.data.workspaceId,
          params.data.sessionId,
          body?.success ? body.data.fingerprint : undefined,
          key?.success ? key.data : undefined,
        );
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "";
        const status =
          code === "42501"
            ? 403
            : code === "PT409" || code === "40001"
              ? 409
              : code === "22023"
                ? 400
                : 500;
        if (status === 500)
          request.log.error(
            { err: error },
            "Schedule exchange recovery failed",
          );
        return reply
          .status(status)
          .send({
            error:
              status === 500
                ? "Unable to review the approved assignments. Your edits are still here."
                : error instanceof Error
                  ? error.message
                  : "Schedule recovery failed",
          });
      }
    },
  });
  app.route({
    method: ["GET", "POST"],
    url: "/v1/workspaces/:workspaceId/shift-exchanges",
    handler: async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const query = querySchema.safeParse(request.query);
      const command =
        request.method === "POST"
          ? exchangeCommandSchema.safeParse(request.body)
          : null;
      const key =
        request.method === "POST"
          ? z.string().uuid().safeParse(request.headers["idempotency-key"])
          : null;
      if (
        !params.success ||
        !query.success ||
        (command && !command.success) ||
        (key && !key.success)
      )
        return reply
          .status(400)
          .send({ error: "A valid request and idempotency key are required" });
      const auth = await resolveWorkspaceMembership({
        authorization: request.headers.authorization,
        workspaceId: params.data.workspaceId,
        resolver: options.contextResolver,
      });
      if (!auth.context)
        return reply.status(403).send({ error: "Workspace access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Shift changes are unavailable" });
      const actor = auth.context.userId;
      const workspace = params.data.workspaceId;
      try {
        if (command?.success && key?.success)
          return await options.service.command(
            actor,
            workspace,
            command.data,
            key.data,
          );
        if (query.data.shift_id)
          return await options.service.candidates(
            actor,
            workspace,
            query.data.shift_id,
          );
        if (query.data.case_id && query.data.application_id)
          return await options.service.preview(
            actor,
            workspace,
            query.data.case_id,
            query.data.application_id,
          );
        return await options.service.read(
          actor,
          workspace,
          query.data.view === "manager",
          query.data.from,
          query.data.to,
          query.data.case_id,
        );
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "";
        const status =
          code === "42501"
            ? 403
            : code === "P0002"
              ? 404
              : code === "PT409" || code === "40001" || code === "23505"
                ? 409
                : code === "55000"
                  ? 423
                  : code === "P0001" || code === "22023"
                    ? 422
                    : 500;
        if (status === 500)
          request.log.error({ err: error }, "Shift exchange failed");
        return reply.status(status).send({
          error:
            status === 500
              ? "Shift changes are unavailable. Please retry."
              : error instanceof Error
                ? error.message
                : "Unable to update this request",
        });
      }
    },
  });
}
