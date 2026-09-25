import {
  documentPublishCommandSchema,
  documentTypeInputSchema,
  type Permission,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  resolveWorkspaceAuthorization,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { DocumentTypesService } from "./document-types-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const documentTypeParams = workspaceParams.extend({
  documentTypeId: z.string().uuid(),
});
const archiveBody = z.object({ archived: z.boolean() });
const reorderBody = z.object({ orderedIds: z.array(z.string().uuid()) });

export function registerDocumentTypesRoutes(
  app: FastifyInstance,
  options: {
    service: DocumentTypesService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  for (const action of ["publication-preview", "publish", "unpublish"] as const)
    app.post(
      `/v1/workspaces/:workspaceId/document-types/:documentTypeId/${action}`,
      async (request, reply) => {
        const params = documentTypeParams.safeParse(request.params);
        if (!params.success)
          return reply
            .status(400)
            .send({ error: "Valid document type required" });
        const context = await authorize(
          request.headers.authorization,
          params.data.workspaceId,
          "documents.manage",
          options.contextResolver,
          reply,
        );
        if (!context) return;
        if (!options.service)
          return reply
            .status(503)
            .send({ error: "Document type service is not configured" });
        try {
          const input = { actorUserId: context.userId, ...params.data };
          if (action === "publication-preview")
            return await options.service.publicationPreview(input);
          const command = documentPublishCommandSchema.safeParse(request.body);
          if (!command.success)
            return reply
              .status(400)
              .send({
                error: "A current publication preview and reason are required",
              });
          return await options.service.publish({
            ...input,
            ...command.data,
            targetStatus: action === "publish" ? "published" : "draft",
          });
        } catch (error) {
          return requestError(reply, error);
        }
      },
    );
  app.get(
    "/v1/workspaces/:workspaceId/document-types/target-options",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid workspace required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "documents.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Document type service is not configured" });
      try {
        return await options.service.targetOptions({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
        });
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/document-types",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = documentTypeInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid document type details required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "documents.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Document type service is not configured" });
      try {
        return reply.status(201).send({
          id: await options.service.save({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            documentType: body.data,
          }),
        });
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/document-types/:documentTypeId",
    async (request, reply) => {
      const params = documentTypeParams.safeParse(request.params);
      const body = documentTypeInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid document type details required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "documents.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Document type service is not configured" });
      try {
        return reply.send({
          id: await options.service.save({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            documentTypeId: params.data.documentTypeId,
            documentType: body.data,
          }),
        });
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/document-types/:documentTypeId/archive",
    async (request, reply) => {
      const params = documentTypeParams.safeParse(request.params);
      const body = archiveBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid archive state required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "documents.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Document type service is not configured" });
      try {
        await options.service.setArchived({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          documentTypeId: params.data.documentTypeId,
          archived: body.data.archived,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/document-types/reorder",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = reorderBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "Valid order required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "documents.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Document type service is not configured" });
      try {
        await options.service.reorder({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          orderedIds: body.data.orderedIds,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );
}

async function authorize(
  authorization: string | undefined,
  workspaceId: string,
  permission: Permission,
  resolver: WorkspaceContextResolver | null,
  reply: FastifyReply,
) {
  const result = await resolveWorkspaceAuthorization({
    authorization,
    workspaceId,
    permission,
    resolver,
  });
  if (result.context) return result.context;
  reply.status(result.denied === "workspace_not_found" ? 404 : 403).send({
    error:
      result.denied === "workspace_not_found"
        ? "Workspace not found"
        : "Document management required",
  });
  return null;
}

function requestError(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Document type operation failed";
  if (
    message.includes("access required") ||
    message.includes("access denied") ||
    message.includes("denied")
  )
    return reply.status(403).send({ error: message });
  if (message.includes("not found"))
    return reply.status(404).send({ error: message });
  if (
    message.toLowerCase().includes("published") ||
    message.includes("exists") ||
    message.includes("stale") ||
    message.includes("changed; refresh")
  )
    return reply.status(409).send({ error: message });
  return reply.status(400).send({ error: message });
}
