import {
  documentPublishCommandSchema,
  documentTypeInputSchema,
} from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  resolveActor,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { DocumentTypesService } from "./document-types-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const documentTypeParams = workspaceParams.extend({
  documentTypeId: z.string().uuid(),
});
const archiveBody = z.object({ archived: z.boolean() });
const reorderBody = z.object({ orderedIds: z.array(z.string().uuid()) });

// Who is asking is resolved here; whether they may is the database's
// (settings.documents.write, FB-6.6), its no mapped by rpcFailure.
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
        const context = await resolveActor(
          request.headers.authorization,
          params.data.workspaceId,
          options.contextResolver,
        );
        if (!options.service)
          return reply
            .status(503)
            .send({ error: "Document type service is not configured" });
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
      },
    );
  app.get(
    "/v1/workspaces/:workspaceId/document-types/target-options",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid workspace required" });
      const context = await resolveActor(
          request.headers.authorization,
          params.data.workspaceId,
          options.contextResolver,
        );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Document type service is not configured" });
      return await options.service.targetOptions({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
      });
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
      const context = await resolveActor(
          request.headers.authorization,
          params.data.workspaceId,
          options.contextResolver,
        );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Document type service is not configured" });
      return reply.status(201).send({
        id: await options.service.save({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          documentType: body.data,
        }),
      });
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
      const context = await resolveActor(
          request.headers.authorization,
          params.data.workspaceId,
          options.contextResolver,
        );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Document type service is not configured" });
      return reply.send({
        id: await options.service.save({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          documentTypeId: params.data.documentTypeId,
          documentType: body.data,
        }),
      });
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
      const context = await resolveActor(
          request.headers.authorization,
          params.data.workspaceId,
          options.contextResolver,
        );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Document type service is not configured" });
      await options.service.setArchived({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        documentTypeId: params.data.documentTypeId,
        archived: body.data.archived,
      });
      return reply.status(204).send();
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/document-types/reorder",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = reorderBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "Valid order required" });
      const context = await resolveActor(
          request.headers.authorization,
          params.data.workspaceId,
          options.contextResolver,
        );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Document type service is not configured" });
      await options.service.reorder({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        orderedIds: body.data.orderedIds,
      });
      return reply.status(204).send();
    },
  );
}
