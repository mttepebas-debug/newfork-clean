import {
  documentApplyCommandSchema,
  signatureRetentionPolicyInputSchema,
  signatureTemplateDraftInputSchema,
} from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  resolveActor,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { SignatureSettingsService } from "./signature-settings-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const policyParams = workspaceParams.extend({ policyId: z.string().uuid() });
const templateParams = workspaceParams.extend({
  templateId: z.string().uuid(),
});
const archiveBody = z.object({ archived: z.boolean() });

// Who is asking is resolved here; whether they may is the database's
// (settings.documents.write, FB-6.6), its no mapped by rpcFailure.
export function registerSignatureSettingsRoutes(
  app: FastifyInstance,
  options: {
    service: SignatureSettingsService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  for (const operation of ["target-options", "preview", "apply"] as const) {
    app.route({ method: operation === "target-options" ? "GET" : "POST", url: operation === "target-options" ? "/v1/workspaces/:workspaceId/signature-templates/target-options" : `/v1/workspaces/:workspaceId/signature-versions/:versionId/${operation}`, handler: async (request, reply) => {
      const params = workspaceParams.extend({ versionId: z.string().uuid().optional() }).safeParse(request.params);
      if (!params.success) return reply.status(400).send({ error: "Valid policy required" });
      const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
      if (!options.service) return reply.status(503).send({ error: "Signature settings service is not configured" });
      try {
        if (operation === "target-options") return await options.service.targetOptions(context.userId, params.data.workspaceId);
        const version = z.string().uuid().parse(params.data.versionId);
        if (operation === "preview") return await options.service.preview(context.userId, params.data.workspaceId, version);
        return await options.service.apply(context.userId, params.data.workspaceId, version, documentApplyCommandSchema.parse(request.body));
      } catch (error) { if (error instanceof z.ZodError) return reply.status(400).send({ error: "Valid policy application required" }); throw error; }
    }});
  }

  app.post(
    "/v1/workspaces/:workspaceId/signature-retention-policies",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = signatureRetentionPolicyInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid retention policy details required" });
      const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      return reply.status(201).send({
        id: await options.service.saveRetentionPolicy({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          policy: body.data,
        }),
      });
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/signature-retention-policies/:policyId",
    async (request, reply) => {
      const params = policyParams.safeParse(request.params);
      const body = signatureRetentionPolicyInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid retention policy details required" });
      const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      return reply.send({
        id: await options.service.saveRetentionPolicy({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          policyId: params.data.policyId,
          policy: body.data,
        }),
      });
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/signature-retention-policies/:policyId/approve",
    async (request, reply) => {
      const params = policyParams.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ error: "Valid retention policy required" });
      const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      await options.service.approveRetentionPolicy({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        policyId: params.data.policyId,
      });
      return reply.status(204).send();
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/signature-retention-policies/:policyId/unapprove",
    async (request, reply) => {
      const params = policyParams.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ error: "Valid retention policy required" });
      const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      await options.service.unapproveRetentionPolicy({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        policyId: params.data.policyId,
      });
      return reply.status(204).send();
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/signature-retention-policies/:policyId/archive",
    async (request, reply) => {
      const params = policyParams.safeParse(request.params);
      const body = archiveBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid archive state required" });
      const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      await options.service.setRetentionPolicyArchived({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        policyId: params.data.policyId,
        archived: body.data.archived,
      });
      return reply.status(204).send();
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/signature-templates",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = signatureTemplateDraftInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid acknowledgement template details required" });
      const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      return reply.status(201).send({
        id: await options.service.saveTemplateDraft({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          template: body.data,
        }),
      });
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/signature-templates/:templateId/draft",
    async (request, reply) => {
      const params = templateParams.safeParse(request.params);
      const body = signatureTemplateDraftInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid acknowledgement template details required" });
      const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      return reply.send({
        id: await options.service.saveTemplateDraft({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          templateId: params.data.templateId,
          template: body.data,
        }),
      });
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/signature-templates/:templateId/publish",
    async (request, reply) => {
      const params = templateParams.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ error: "Valid acknowledgement template required" });
      const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      await options.service.publishTemplate({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        templateId: params.data.templateId,
      });
      return reply.status(204).send();
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/signature-templates/:templateId/unpublish",
    async (request, reply) => {
      const params = templateParams.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ error: "Valid acknowledgement template required" });
      const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      await options.service.unpublishTemplate({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        templateId: params.data.templateId,
      });
      return reply.status(204).send();
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/signature-templates/:templateId/archive",
    async (request, reply) => {
      const params = templateParams.safeParse(request.params);
      const body = archiveBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid archive state required" });
      const context = await resolveActor(request.headers.authorization, params.data.workspaceId, options.contextResolver);
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      await options.service.setTemplateArchived({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        templateId: params.data.templateId,
        archived: body.data.archived,
      });
      return reply.status(204).send();
    },
  );
}
