import {
  signatureRetentionPolicyInputSchema,
  signatureTemplateDraftInputSchema,
  type Permission,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  resolveWorkspaceAuthorization,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { SignatureSettingsService } from "./signature-settings-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const policyParams = workspaceParams.extend({ policyId: z.string().uuid() });
const templateParams = workspaceParams.extend({
  templateId: z.string().uuid(),
});
const archiveBody = z.object({ archived: z.boolean() });

export function registerSignatureSettingsRoutes(
  app: FastifyInstance,
  options: {
    service: SignatureSettingsService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  app.post(
    "/v1/workspaces/:workspaceId/signature-retention-policies",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = signatureRetentionPolicyInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid retention policy details required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "signature_templates.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      try {
        return reply.status(201).send({
          id: await options.service.saveRetentionPolicy({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            policy: body.data,
          }),
        });
      } catch (error) {
        return requestError(reply, error);
      }
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
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "signature_templates.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      try {
        return reply.send({
          id: await options.service.saveRetentionPolicy({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            policyId: params.data.policyId,
            policy: body.data,
          }),
        });
      } catch (error) {
        return requestError(reply, error);
      }
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
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "signature_templates.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      try {
        await options.service.approveRetentionPolicy({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          policyId: params.data.policyId,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
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
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "signature_templates.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      try {
        await options.service.unapproveRetentionPolicy({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          policyId: params.data.policyId,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
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
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "signature_templates.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      try {
        await options.service.setRetentionPolicyArchived({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          policyId: params.data.policyId,
          archived: body.data.archived,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
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
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "signature_templates.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      try {
        return reply.status(201).send({
          id: await options.service.saveTemplateDraft({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            template: body.data,
          }),
        });
      } catch (error) {
        return requestError(reply, error);
      }
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
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "signature_templates.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      try {
        return reply.send({
          id: await options.service.saveTemplateDraft({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            templateId: params.data.templateId,
            template: body.data,
          }),
        });
      } catch (error) {
        return requestError(reply, error);
      }
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
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "signature_templates.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      try {
        await options.service.publishTemplate({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          templateId: params.data.templateId,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
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
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "signature_templates.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      try {
        await options.service.unpublishTemplate({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          templateId: params.data.templateId,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
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
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "signature_templates.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Signature settings service is not configured" });
      try {
        await options.service.setTemplateArchived({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          templateId: params.data.templateId,
          archived: body.data.archived,
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
        : "Acknowledgement template management required",
  });
  return null;
}

function requestError(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Signature settings operation failed";
  if (
    message.includes("access required") ||
    message.includes("access denied") ||
    message.includes("denied")
  )
    return reply.status(403).send({ error: message });
  if (message.includes("not found"))
    return reply.status(404).send({ error: message });
  if (
    message.includes("approved") ||
    message.includes("immutable") ||
    message.includes("required") ||
    message.includes("exists")
  )
    return reply.status(409).send({ error: message });
  return reply.status(400).send({ error: message });
}
