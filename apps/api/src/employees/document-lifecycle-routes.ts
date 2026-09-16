import {
  documentAcknowledgeCommandSchema,
  documentReasonCommandSchema,
  documentReviewCommandSchema,
  documentSubmitCommandSchema,
  isValidIanaTimezone,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { bearerToken } from "../auth/workspace-context";
import {
  DocumentLifecycleError,
  type DocumentLifecycleService,
} from "./document-lifecycle-service";

const paramsSchema = z.object({
  workspaceId: z.string().uuid(),
  requirementId: z.string().uuid().optional(),
  submissionId: z.string().uuid().optional(),
  fileId: z.string().uuid().optional(),
});
const fileSchema = z.object({
  filename: z.string().trim().min(1).max(240),
  sizeBytes: z.number().int().min(1).max(10_485_760),
});
const confirmSchema = fileSchema.extend({
  path: z.string().min(1).max(800),
  revision: z.number().int().positive(),
});

export function registerDocumentLifecycleRoutes(
  app: FastifyInstance,
  service: DocumentLifecycleService | null,
) {
  async function replyWith(
    reply: FastifyReply,
    action: () => Promise<unknown>,
  ) {
    try {
      return await action();
    } catch (error) {
      if (error instanceof z.ZodError)
        return reply
          .status(400)
          .send({ error: "Valid document details required" });
      if (error instanceof DocumentLifecycleError) {
        const status =
          error.code === "42501"
            ? 403
            : error.code === "P0002"
              ? 404
              : error.code === "PT409"
                ? 409
                : error.code === "22023"
                  ? 400
                  : error.code === "401"
                    ? 401
                    : 503;
        return reply
          .status(status)
          .send({ error: error.message, code: error.code });
      }
      return reply
        .status(503)
        .send({ error: "Document service is unavailable" });
    }
  }
  for (const selfOnly of [true, false]) {
    const root = selfOnly
      ? "/v1/me/workspaces/:workspaceId/documents"
      : "/v1/workspaces/:workspaceId/employee-documents";
    for (const operation of [
      "list",
      "detail",
      "download",
      ...(selfOnly
        ? [
            "access",
            "upload-url",
            "confirm",
            "submit",
            "defer",
            "acknowledge",
            "withdraw",
            "remove-draft-file",
          ]
        : [
            "review",
            "exemption",
            "timezone",
            "extend-deadline",
            "assignment-preview",
          ]),
    ]) {
      const suffix =
        operation === "list"
          ? ""
          : operation === "access"
            ? "/access"
            : operation === "detail"
              ? "/:requirementId"
              : operation === "download"
                ? "/:requirementId/submissions/:submissionId/files/:fileId/download"
                : `/:requirementId/${operation}`;
      app.route({
        method: ["list", "detail", "download", "access"].includes(operation)
          ? "GET"
          : "POST",
        url: root + suffix,
        handler: async (request, reply) => {
          const token = bearerToken(request.headers.authorization);
          if (!token)
            return reply
              .status(401)
              .send({ error: "A current session is required" });
          if (!service)
            return reply
              .status(503)
              .send({ error: "Document service is not configured" });
          return replyWith(reply, async () => {
            const params = paramsSchema.parse(request.params);
            const audience = { workspaceId: params.workspaceId, selfOnly };
            if (operation === "access")
              return service.access(token, params.workspaceId);
            if (operation === "list") return service.list(token, audience);
            const requirementId = z.string().uuid().parse(params.requirementId);
            if (operation === "detail")
              return service.detail(token, audience, requirementId);
            if (operation === "download")
              return service.download(
                token,
                audience,
                requirementId,
                z.string().uuid().parse(params.submissionId),
                z.string().uuid().parse(params.fileId),
              );
            if (operation === "upload-url") {
              const file = fileSchema.parse(request.body);
              return service.prepareUpload(
                token,
                params.workspaceId,
                requirementId,
                file.filename,
                file.sizeBytes,
              );
            }
            if (operation === "confirm")
              return {
                revision: await service.confirmUpload(
                  token,
                  params.workspaceId,
                  requirementId,
                  confirmSchema.parse(request.body),
                ),
              };
            if (operation === "submit")
              return {
                revision: await service.submit(
                  token,
                  params.workspaceId,
                  requirementId,
                  documentSubmitCommandSchema.parse(request.body),
                ),
              };
            if (operation === "defer")
              return {
                revision: await service.defer(
                  token,
                  params.workspaceId,
                  requirementId,
                  documentReasonCommandSchema.parse(request.body),
                ),
              };
            if (operation === "remove-draft-file")
              return {
                revision: await service.removeDraftFile(
                  token,
                  params.workspaceId,
                  requirementId,
                  z
                    .object({
                      revision: z.number().int().positive(),
                      submission_id: z.string().uuid(),
                      file_id: z.string().uuid(),
                    })
                    .parse(request.body),
                ),
              };
            if (operation === "withdraw")
              return {
                revision: await service.withdraw(
                  token,
                  params.workspaceId,
                  requirementId,
                  z
                    .object({ revision: z.number().int().positive() })
                    .parse(request.body).revision,
                ),
              };
            if (operation === "acknowledge")
              return {
                revision: await service.acknowledge(
                  token,
                  params.workspaceId,
                  requirementId,
                  documentAcknowledgeCommandSchema.parse(request.body),
                ),
              };
            if (operation === "extend-deadline")
              return {
                revision: await service.extendDeadline(
                  token,
                  params.workspaceId,
                  requirementId,
                  z
                    .object({
                      revision: z.number().int().positive(),
                      additional_days: z.number().int().min(1).max(3650),
                      reason: z.string().trim().min(1).max(500),
                    })
                    .parse(request.body),
                ),
              };
            if (operation === "assignment-preview")
              return service.assignmentPreview(
                token,
                params.workspaceId,
                requirementId,
                z
                  .object({
                    location_ids: z.array(z.string().uuid()).max(100),
                    job_ids: z.array(z.string().uuid()).max(100),
                  })
                  .parse(request.body),
              );
            if (operation === "timezone")
              return {
                revision: await service.setTimezone(
                  token,
                  params.workspaceId,
                  requirementId,
                  z
                    .object({
                      employee_revision: z.number().int().positive(),
                      timezone: z.string().refine(isValidIanaTimezone),
                    })
                    .parse(request.body),
                ),
              };
            if (operation === "exemption")
              return {
                revision: await service.exemption(
                  token,
                  params.workspaceId,
                  requirementId,
                  z
                    .object({
                      revision: z.number().int().positive(),
                      exempt: z.boolean(),
                      reason: z.string().trim().min(1).max(500),
                    })
                    .parse(request.body),
                ),
              };
            return {
              revision: await service.review(
                token,
                params.workspaceId,
                requirementId,
                documentReviewCommandSchema.parse(request.body),
              ),
            };
          });
        },
      });
    }
  }
}
