import {
  scheduleEditSourceSchema,
  scheduleAutoFillAssignmentSchema,
  scheduleExportRequestSchema,
  scheduleExportSettingsSchema,
  schedulePublicationOverrideInputSchema,
  scheduleShiftMutationInputSchema,
  scheduleViewSchema,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { WorkspaceContextResolver } from "../auth/workspace-context";
import type { ScheduleReadService } from "./schedule-service";
import {
  prepareScheduleExport,
  renderScheduleCsv,
  renderSchedulePrintHtml,
} from "./schedule-export";

const paramsSchema = z.object({ workspaceId: z.string().uuid() });
const querySchema = z.object({
  date: z.string().date(),
  view: scheduleViewSchema.default("week"),
});
const weekQuerySchema = z.object({ week_start: z.string().date() });
const sessionParamsSchema = paramsSchema.extend({
  sessionId: z.string().uuid(),
});
const shiftParamsSchema = sessionParamsSchema.extend({
  shiftId: z.string().uuid(),
});
const templateParamsSchema = paramsSchema.extend({
  templateId: z.string().uuid(),
});
const presetParamsSchema = paramsSchema.extend({ presetId: z.string().uuid() });
const acquireBodySchema = z.object({
  week_start: z.string().date(),
  source_kind: scheduleEditSourceSchema,
  source_draft_id: z.string().uuid().nullable().default(null),
});
const mutationRevisionSchema = z.object({
  expected_session_revision: z.number().int().positive(),
});
const createShiftBodySchema = mutationRevisionSchema.extend({
  shift: scheduleShiftMutationInputSchema,
});
const updateShiftBodySchema = createShiftBodySchema.extend({
  expected_shift_revision: z.number().int().positive(),
});
const deleteShiftBodySchema = mutationRevisionSchema.extend({
  expected_shift_revision: z.number().int().positive(),
});
const saveBodySchema = mutationRevisionSchema.extend({
  name: z.string().trim().min(1).max(80),
  draft_id: z.string().uuid().nullable().default(null),
  expected_draft_revision: z.number().int().positive().nullable().default(null),
});
const publicationPreviewBodySchema = z.object({
  draft_id: z.string().uuid(),
  location_ids: z.array(z.string().uuid()).min(1),
});
const publishBodySchema = publicationPreviewBodySchema.extend({
  expected_draft_revision: z.number().int().positive(),
  fingerprint: z.string().length(64),
  overrides: z
    .array(schedulePublicationOverrideInputSchema)
    .max(200)
    .default([]),
});
const unpublishPreviewBodySchema = z.object({
  week_start: z.string().date(),
  location_ids: z.array(z.string().uuid()).min(1),
});
const unpublishBodySchema = unpublishPreviewBodySchema.extend({
  fingerprint: z.string().length(64),
});
const createTemplateBodySchema = z.object({
  draft_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  strip_assignments: z.boolean().default(true),
});
const renameTemplateBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  expected_revision: z.number().int().positive(),
});
const deleteTemplateBodySchema = z.object({
  expected_revision: z.number().int().positive(),
});
const applyTemplateBodySchema = mutationRevisionSchema.extend({
  template_id: z.string().uuid(),
  mode: z.enum(["merge", "overwrite"]),
});
const applyAutoFillBodySchema = mutationRevisionSchema.extend({
  fingerprint: z.string().length(64),
  assignments: z.array(scheduleAutoFillAssignmentSchema).max(500),
});
const createPresetBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  settings: scheduleExportSettingsSchema,
});

export function registerScheduleRoutes(
  app: FastifyInstance,
  options: {
    readonly service: ScheduleReadService | null;
    readonly contextResolver: WorkspaceContextResolver | null;
  },
) {
  app.get("/v1/workspaces/:workspaceId/schedule", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const query = querySchema.safeParse(request.query);
    if (!params.success || !query.success)
      return reply
        .status(400)
        .send({ error: "Valid schedule period required" });

    const token = bearerToken(request.headers.authorization);
    const context =
      token && options.contextResolver
        ? await options.contextResolver.resolve(token)
        : null;
    if (!context)
      return reply.status(401).send({ error: "Valid bearer session required" });
    if (
      context.workspace.id !== params.data.workspaceId ||
      context.membership.role === "employee" ||
      !context.permissions.includes("schedule.read")
    )
      return reply
        .status(403)
        .send({ error: "Manager schedule read access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule read service is not configured" });

    try {
      return reply.send(
        await options.service.getReadModel(
          context.userId,
          params.data.workspaceId,
          query.data.date,
        ),
      );
    } catch (error) {
      return reply.status(409).send({
        error:
          error instanceof Error ? error.message : "Schedule is unavailable",
      });
    }
  });

  app.get(
    "/v1/workspaces/:workspaceId/schedule/drafts",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const query = weekQuerySchema.safeParse(request.query);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
          )
        : null;
      if (!params.success || !query.success)
        return reply.status(400).send({ error: "Valid draft week required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule manage access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.listDrafts(
            context.userId,
            params.data.workspaceId,
            query.data.week_start,
          ),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/schedule/edit-sessions",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = acquireBodySchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "Valid edit source required" });
      const context = await managerContext(
        request.headers.authorization,
        params.data.workspaceId,
        options,
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule manage access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.acquireSession({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            weekStart: body.data.week_start,
            sourceKind: body.data.source_kind,
            sourceDraftId: body.data.source_draft_id,
          }),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/schedule/publication-history",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const query = weekQuerySchema.safeParse(request.query);
      if (!params.success || !query.success)
        return reply
          .status(400)
          .send({ error: "Valid publication week required" });
      const context = await managerContext(
        request.headers.authorization,
        params.data.workspaceId,
        options,
        "schedule.publish",
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule publish access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.getPublicationHistory(
            context.userId,
            params.data.workspaceId,
            query.data.week_start,
          ),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/heartbeat",
    async (request, reply) => {
      const params = sessionParamsSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid edit session required" });
      const context = await managerContext(
        request.headers.authorization,
        params.data.workspaceId,
        options,
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule manage access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.heartbeat(
            context.userId,
            params.data.workspaceId,
            params.data.sessionId,
          ),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/shifts",
    async (request, reply) => {
      const params = sessionParamsSchema.safeParse(request.params);
      const body = createShiftBodySchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "Valid shift required" });
      const idempotencyKey = z
        .string()
        .uuid()
        .safeParse(request.headers["idempotency-key"]);
      if (!idempotencyKey.success)
        return reply
          .status(400)
          .send({ error: "Idempotency-Key header required" });
      return mutate(
        reply,
        request.headers.authorization,
        options,
        params.data,
        body.data,
        "create",
        crypto.randomUUID(),
        idempotencyKey.data,
      );
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/shifts/:shiftId",
    async (request, reply) => {
      const params = shiftParamsSchema.safeParse(request.params);
      const body = updateShiftBodySchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid shift revision required" });
      return mutate(
        reply,
        request.headers.authorization,
        options,
        params.data,
        body.data,
        "update",
        params.data.shiftId,
      );
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/shifts/:shiftId",
    async (request, reply) => {
      const params = shiftParamsSchema.safeParse(request.params);
      const body = deleteShiftBodySchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid shift revision required" });
      return mutate(
        reply,
        request.headers.authorization,
        options,
        params.data,
        body.data,
        "delete",
        params.data.shiftId,
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/save",
    async (request, reply) => {
      const params = sessionParamsSchema.safeParse(request.params);
      const body = saveBodySchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "Valid draft save required" });
      const context = await managerContext(
        request.headers.authorization,
        params.data.workspaceId,
        options,
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule manage access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.saveSession({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            sessionId: params.data.sessionId,
            expectedSessionRevision: body.data.expected_session_revision,
            name: body.data.name,
            draftId: body.data.draft_id,
            expectedDraftRevision: body.data.expected_draft_revision,
          }),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId",
    async (request, reply) => {
      const params = sessionParamsSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid edit session required" });
      const context = await managerContext(
        request.headers.authorization,
        params.data.workspaceId,
        options,
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule manage access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        await options.service.discardSession(
          context.userId,
          params.data.workspaceId,
          params.data.sessionId,
        );
        return reply.status(204).send();
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/schedule/publication-preview",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = publicationPreviewBodySchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid publication scope required" });
      const context = await managerContext(
        request.headers.authorization,
        params.data.workspaceId,
        options,
        "schedule.publish",
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule publish access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.previewPublication({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            draftId: body.data.draft_id,
            locationIds: body.data.location_ids,
          }),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/schedule/publications",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = publishBodySchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid publication review required" });
      const context = await managerContext(
        request.headers.authorization,
        params.data.workspaceId,
        options,
        "schedule.publish",
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule publish access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.publish({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            draftId: body.data.draft_id,
            locationIds: body.data.location_ids,
            expectedDraftRevision: body.data.expected_draft_revision,
            fingerprint: body.data.fingerprint,
            overrides: body.data.overrides,
          }),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/schedule/unpublish-preview",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = unpublishPreviewBodySchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid unpublish scope required" });
      const context = await managerContext(
        request.headers.authorization,
        params.data.workspaceId,
        options,
        "schedule.publish",
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule publish access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.previewUnpublish({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            weekStart: body.data.week_start,
            locationIds: body.data.location_ids,
          }),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/schedule/unpublications",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = unpublishBodySchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid unpublish review required" });
      const context = await managerContext(
        request.headers.authorization,
        params.data.workspaceId,
        options,
        "schedule.publish",
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule publish access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.unpublish({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            weekStart: body.data.week_start,
            locationIds: body.data.location_ids,
            fingerprint: body.data.fingerprint,
          }),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/schedule/templates",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
            "schedule.templates.manage",
          )
        : null;
      if (!params.success)
        return reply.status(400).send({ error: "Valid workspace required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule template access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.listTemplates(
            context.userId,
            params.data.workspaceId,
          ),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
  app.get(
    "/v1/workspaces/:workspaceId/schedule/templates/:templateId",
    async (request, reply) => {
      const params = templateParamsSchema.safeParse(request.params);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
            "schedule.templates.manage",
          )
        : null;
      if (!params.success)
        return reply.status(400).send({ error: "Valid template required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule template access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.getTemplate(
            context.userId,
            params.data.workspaceId,
            params.data.templateId,
          ),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/schedule/templates",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = createTemplateBodySchema.safeParse(request.body);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
            "schedule.templates.manage",
          )
        : null;
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid template source required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule template access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.status(201).send(
          await options.service.createTemplate({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            draftId: body.data.draft_id,
            name: body.data.name,
            stripAssignments: body.data.strip_assignments,
          }),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
  app.patch(
    "/v1/workspaces/:workspaceId/schedule/templates/:templateId",
    async (request, reply) => {
      const params = templateParamsSchema.safeParse(request.params);
      const body = renameTemplateBodySchema.safeParse(request.body);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
            "schedule.templates.manage",
          )
        : null;
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid template revision required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule template access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.renameTemplate({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            templateId: params.data.templateId,
            name: body.data.name,
            expectedRevision: body.data.expected_revision,
          }),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
  app.delete(
    "/v1/workspaces/:workspaceId/schedule/templates/:templateId",
    async (request, reply) => {
      const params = templateParamsSchema.safeParse(request.params);
      const body = deleteTemplateBodySchema.safeParse(request.body);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
            "schedule.templates.manage",
          )
        : null;
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid template revision required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule template access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        await options.service.deleteTemplate({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          templateId: params.data.templateId,
          expectedRevision: body.data.expected_revision,
        });
        return reply.status(204).send();
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/apply-template",
    async (request, reply) => {
      const params = sessionParamsSchema.safeParse(request.params);
      const body = applyTemplateBodySchema.safeParse(request.body);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
            "schedule.templates.manage",
          )
        : null;
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid template application required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule template access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.applyTemplate({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            sessionId: params.data.sessionId,
            expectedSessionRevision: body.data.expected_session_revision,
            templateId: body.data.template_id,
            mode: body.data.mode,
          }),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/auto-fill-preview",
    async (request, reply) => {
      const params = sessionParamsSchema.safeParse(request.params);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
          )
        : null;
      if (!params.success)
        return reply.status(400).send({ error: "Valid edit session required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule manage access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.previewAutoFill(
            context.userId,
            params.data.workspaceId,
            params.data.sessionId,
          ),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/auto-fill-apply",
    async (request, reply) => {
      const params = sessionParamsSchema.safeParse(request.params);
      const body = applyAutoFillBodySchema.safeParse(request.body);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
          )
        : null;
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid auto-fill review required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule manage access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.applyAutoFill({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            sessionId: params.data.sessionId,
            expectedSessionRevision: body.data.expected_session_revision,
            fingerprint: body.data.fingerprint,
            assignments: body.data.assignments,
          }),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/schedule/export-preview",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = scheduleExportRequestSchema.safeParse(request.body);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
            "schedule.export",
          )
        : null;
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid schedule export required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule export access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        const source = body.data.source;
        const preview = await options.service.previewExport({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          weekStart: body.data.week_start,
          sourceType: source.type,
          sourceDraftId: source.type === "draft" ? source.draft_id : null,
          locationIds: body.data.location_ids,
        });
        return reply.send(prepareScheduleExport(preview, body.data.settings));
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/schedule/exports",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = scheduleExportRequestSchema.safeParse(request.body);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
            "schedule.export",
          )
        : null;
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid schedule export required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule export access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        const source = body.data.source;
        const preview = prepareScheduleExport(
          await options.service.previewExport({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            weekStart: body.data.week_start,
            sourceType: source.type,
            sourceDraftId: source.type === "draft" ? source.draft_id : null,
            locationIds: body.data.location_ids,
          }),
          body.data.settings,
        );
        const fileBase = `schedule-${body.data.week_start}`;
        return body.data.settings.format === "csv"
          ? reply
              .type("text/csv; charset=utf-8")
              .header(
                "Content-Disposition",
                `attachment; filename=\"${fileBase}.csv\"`,
              )
              .send(renderScheduleCsv(preview, body.data.settings))
          : reply
              .type("text/html; charset=utf-8")
              .header(
                "Content-Disposition",
                `inline; filename=\"${fileBase}.html\"`,
              )
              .send(renderSchedulePrintHtml(preview, body.data.settings));
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
  app.get(
    "/v1/workspaces/:workspaceId/schedule/export-presets",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
            "schedule.export",
          )
        : null;
      if (!params.success)
        return reply.status(400).send({ error: "Valid workspace required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule export access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.listExportPresets(
            context.userId,
            params.data.workspaceId,
          ),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/schedule/export-presets",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = createPresetBodySchema.safeParse(request.body);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
            "schedule.export",
          )
        : null;
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid export preset required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule export access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.status(201).send(
          await options.service.createExportPreset({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            name: body.data.name,
            settings: body.data.settings,
          }),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
  app.delete(
    "/v1/workspaces/:workspaceId/schedule/export-presets/:presetId",
    async (request, reply) => {
      const params = presetParamsSchema.safeParse(request.params);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
            "schedule.export",
          )
        : null;
      if (!params.success)
        return reply
          .status(400)
          .send({ error: "Valid export preset required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule export access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        await options.service.deleteExportPreset(
          context.userId,
          params.data.workspaceId,
          params.data.presetId,
        );
        return reply.status(204).send();
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
}

async function managerContext(
  authorization: string | undefined,
  workspaceId: string,
  options: {
    readonly service: ScheduleReadService | null;
    readonly contextResolver: WorkspaceContextResolver | null;
  },
  permission:
    | "schedule.manage"
    | "schedule.publish"
    | "schedule.templates.manage"
    | "schedule.export" = "schedule.manage",
) {
  const token = bearerToken(authorization);
  const context =
    token && options.contextResolver
      ? await options.contextResolver.resolve(token)
      : null;
  return context &&
    context.workspace.id === workspaceId &&
    context.membership.role !== "employee" &&
    context.permissions.includes(permission)
    ? context
    : null;
}

async function mutate(
  reply: FastifyReply,
  authorization: string | undefined,
  options: {
    readonly service: ScheduleReadService | null;
    readonly contextResolver: WorkspaceContextResolver | null;
  },
  params: { workspaceId: string; sessionId: string; shiftId?: string },
  body: {
    expected_session_revision: number;
    expected_shift_revision?: number;
    shift?: z.infer<typeof scheduleShiftMutationInputSchema>;
  },
  operation: "create" | "update" | "delete",
  shiftId: string,
  idempotencyKey?: string,
) {
  const context = await managerContext(
    authorization,
    params.workspaceId,
    options,
  );
  if (!context)
    return reply.status(403).send({ error: "Schedule manage access required" });
  if (!options.service)
    return reply
      .status(503)
      .send({ error: "Schedule service is not configured" });
  try {
    return reply.send(
      await options.service.mutateShift({
        actorUserId: context.userId,
        workspaceId: params.workspaceId,
        sessionId: params.sessionId,
        expectedSessionRevision: body.expected_session_revision,
        operation,
        shiftId,
        expectedShiftRevision: body.expected_shift_revision,
        shift: body.shift,
        idempotencyKey,
      }),
    );
  } catch (error) {
    return scheduleError(reply, error);
  }
}

function scheduleError(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Schedule operation failed";
  const status =
    message.includes("access required") || message.includes("scope denied")
      ? 403
      : message.includes("not found")
        ? 404
        : message.includes("stale") ||
            message.includes("expired") ||
            message.includes("conflict")
          ? 409
          : message.includes("hard publication blockers")
            ? 422
            : 400;
  return reply.status(status).send({ error: message });
}

function bearerToken(authorization: string | undefined): string {
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}
