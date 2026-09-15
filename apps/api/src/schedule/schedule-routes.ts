import {
  scheduleDefaultHoursInputSchema,
  scheduleDefaultHoursApplySchema,
  scheduleEditSourceSchema,
  scheduleAutoFillAssignmentSchema,
  createScheduleExportScheduleInputSchema,
  createSchedulePendingOpInputSchema,
  scheduleExportRequestSchema,
  scheduleExportSettingsSchema,
  updateSchedulePendingOpInputSchema,
  schedulePublicationPreflightAckSchema,
  schedulePublicationOverrideInputSchema,
  scheduleShiftMutationInputSchema,
  updateScheduleExportScheduleInputSchema,
  scheduleViewSchema,
  type SchedulePublishResult,
} from "@newfork/shared/schedule";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { WorkspaceContextResolver } from "../auth/workspace-context";
import type { ScheduleReadService } from "./schedule-service";
import {
  prepareScheduleExport,
  renderScheduleCsv,
  renderSchedulePdf,
  renderSchedulePrintHtml,
  renderScheduleWorkbook,
} from "./schedule-export";

const paramsSchema = z.object({ workspaceId: z.string().uuid() });
const explicitWorkspaceHeaderSchema = z.string().uuid();
const activeScheduleQuerySchema = z.object({
  date: z.string().date().optional(),
  week_start: z.string().date().optional(),
  view: scheduleViewSchema.default("week"),
});
const querySchema = z.object({
  date: z.string().date(),
  view: scheduleViewSchema.default("week"),
});
const weekQuerySchema = z.object({ week_start: z.string().date() });
const pendingOpsQuerySchema = weekQuerySchema.extend({
  location_id: z.string().uuid().optional(),
  location_ids: z
    .preprocess(
      (value) =>
        Array.isArray(value)
          ? value.flatMap((entry) =>
              typeof entry === "string" ? entry.split(",") : [],
            )
          : typeof value === "string"
            ? value.split(",")
            : [],
      z.array(z.string().uuid()).default([]),
    )
    .optional()
    .default([]),
  draft_id: z.string().uuid().nullable().optional(),
});
const weeklyShiftsQuerySchema = weekQuerySchema.extend({
  location_ids: z
    .preprocess(
      (value) =>
        Array.isArray(value)
          ? value.flatMap((entry) =>
              typeof entry === "string" ? entry.split(",") : [],
            )
          : typeof value === "string"
            ? value.split(",")
            : [],
      z.array(z.string().uuid()).default([]),
    )
    .optional()
    .default([]),
  draft_id: z.string().uuid().optional(),
  include_live: z.coerce.boolean().optional().default(false),
});
const sessionParamsSchema = paramsSchema.extend({
  sessionId: z.string().uuid(),
});
const shiftParamsSchema = sessionParamsSchema.extend({
  shiftId: z.string().uuid(),
});
const activeSessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
});
const activeShiftParamsSchema = z.object({
  shiftId: z.string().uuid(),
});

function sendSchedulePublishResult(
  reply: FastifyReply,
  result: SchedulePublishResult,
) {
  if (result.status === "published") return reply.send(result);
  return reply.status(409).send(result);
}
const activeDraftParamsSchema = z.object({
  draftId: z.string().uuid(),
});
const templateParamsSchema = paramsSchema.extend({
  templateId: z.string().uuid(),
});
const activeTemplateParamsSchema = z.object({
  templateId: z.string().uuid(),
});
const presetParamsSchema = paramsSchema.extend({ presetId: z.string().uuid() });
const activePresetParamsSchema = z.object({ presetId: z.string().uuid() });
const exportScheduleParamsSchema = paramsSchema.extend({
  scheduleId: z.string().uuid(),
});
const activeExportScheduleParamsSchema = z.object({
  scheduleId: z.string().uuid(),
});
const acquireBodySchema = z.object({
  week_start: z.string().date(),
  source_kind: scheduleEditSourceSchema,
  source_draft_id: z.string().uuid().nullable().default(null),
});
const activeSessionBodySchema = z.object({
  session_id: z.string().uuid(),
});
const activeTakeoverBodySchema = z
  .object({
    session_id: z.string().uuid().optional(),
    lock_id: z.string().uuid().optional(),
  })
  .refine((value) => value.session_id || value.lock_id);
const materializeLiveDraftBodySchema = z.object({
  week_start: z.string().date(),
  location_ids: z.array(z.string().uuid()).min(1),
});
const mutationRevisionSchema = z.object({
  expected_session_revision: z.number().int().positive(),
});
const createShiftBodySchema = mutationRevisionSchema.extend({
  shift: scheduleShiftMutationInputSchema,
});
const activeCreateShiftBodySchema = createShiftBodySchema.extend({
  session_id: z.string().uuid(),
});
const updateShiftBodySchema = createShiftBodySchema.extend({
  expected_shift_revision: z.number().int().positive(),
});
const activeUpdateShiftBodySchema = updateShiftBodySchema.extend({
  session_id: z.string().uuid(),
});
const deleteShiftBodySchema = mutationRevisionSchema.extend({
  expected_shift_revision: z.number().int().positive(),
});
const activeDeleteShiftBodySchema = deleteShiftBodySchema.extend({
  session_id: z.string().uuid(),
});
const activeRestoreShiftBodySchema = deleteShiftBodySchema.extend({
  session_id: z.string().uuid(),
});
const bulkDeleteShiftsBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});
const saveBodySchema = mutationRevisionSchema.extend({
  name: z.string().trim().min(1).max(80),
  draft_id: z.string().uuid().nullable().default(null),
  expected_draft_revision: z.number().int().positive().nullable().default(null),
  acknowledge_past_edits: z.boolean().optional(),
});
const activeSaveBodySchema = saveBodySchema.extend({
  session_id: z.string().uuid(),
});
const publicationPreviewBodySchema = z.object({
  draft_id: z.string().uuid(),
  location_ids: z.array(z.string().uuid()).min(1),
  department_ids: z.array(z.string().uuid()).optional(),
  include_no_department: z.boolean().optional(),
});
const legacyPublishBodySchema = z.object({
  week_start: z.string().date(),
  location_id: z.string().uuid().optional(),
});
const publishBodySchema = publicationPreviewBodySchema.extend({
  week_start: z.string().date().optional(),
  expected_draft_revision: z.number().int().positive(),
  fingerprint: z.string().length(64),
  notify_employee_ids: z.array(z.string().uuid()).max(500).optional(),
  overrides: z
    .array(schedulePublicationOverrideInputSchema)
    .max(200)
    .default([]),
  preflight_ack: schedulePublicationPreflightAckSchema.optional(),
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
  department_keys: z.array(z.string()).nullable().optional(),
});
const applyAutoFillBodySchema = mutationRevisionSchema.extend({
  fingerprint: z.string().length(64),
  assignments: z.array(scheduleAutoFillAssignmentSchema).max(500),
});
const draftAutoFillPreviewBodySchema = weekQuerySchema;
const draftAutoFillApplyBodySchema = weekQuerySchema.extend({
  assignments: z.array(scheduleAutoFillAssignmentSchema).max(500),
});
const createPresetBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  settings: scheduleExportSettingsSchema,
});
const updatePresetBodySchema = createPresetBodySchema;
const createExportScheduleBodySchema =
  createScheduleExportScheduleInputSchema;
const updateExportScheduleBodySchema =
  updateScheduleExportScheduleInputSchema;
const createPendingOpBodySchema = createSchedulePendingOpInputSchema;
const updatePendingOpBodySchema = updateSchedulePendingOpInputSchema;
const activePendingOpParamsSchema = z.object({ opId: z.string().uuid() });
type WorkspaceContextRequestSource = FastifyRequest | string | undefined;

function authorizationFromSource(source: WorkspaceContextRequestSource) {
  return typeof source === "string" || source === undefined
    ? source
    : source.headers.authorization;
}

function workspaceIdFromSource(source: WorkspaceContextRequestSource) {
  if (typeof source === "string" || source === undefined) return null;
  const value = source.headers["x-newfork-workspace-id"];
  const parsed = explicitWorkspaceHeaderSchema.safeParse(
    Array.isArray(value) ? value[0] : value,
  );
  return parsed.success ? parsed.data : null;
}

export function registerScheduleRoutes(
  app: FastifyInstance,
  options: {
    readonly service: ScheduleReadService | null;
    readonly contextResolver: WorkspaceContextResolver | null;
  },
) {
  for (const action of ["preview", "apply"] as const) {
    app.post(`/v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/default-hours-${action}`, async (request, reply) => {
      const params = sessionParamsSchema.safeParse(request.params);
      const body = (action === "preview" ? scheduleDefaultHoursInputSchema : scheduleDefaultHoursApplySchema).safeParse(request.body);
      if (!params.success || !body.success) return reply.status(400).send({ error: "Valid default-hours review required" });
      const context = await managerContext(request.headers.authorization, params.data.workspaceId, options);
      if (!context || context.membership.status !== "active") return reply.status(403).send({ error: "Schedule manage access required" });
      if (!options.service?.previewDefaultHours || !options.service?.applyDefaultHours) return reply.status(503).send({ error: "Default-hours review is unavailable" });
      try {
        const input = { actorUserId: context.userId, workspaceId: params.data.workspaceId, sessionId: params.data.sessionId };
        return action === "preview"
          ? await options.service.previewDefaultHours({ ...input, command: scheduleDefaultHoursInputSchema.parse(body.data) })
          : await options.service.applyDefaultHours({ ...input, command: scheduleDefaultHoursApplySchema.parse(body.data) });
      } catch (error) { return scheduleError(reply, error); }
    });
  }
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/v1/workspaces/")) return;
    if (!request.url.includes("/schedule")) return;
    const workspaceId = (request.params as { workspaceId?: unknown })
      ?.workspaceId;
    if (typeof workspaceId !== "string") return;
    const token = bearerToken(request.headers.authorization);
    if (!token || !options.contextResolver) return;
    const context = await options.contextResolver.resolve(token, workspaceId);
    if (
      context &&
      (context.workspace.id !== workspaceId ||
        context.membership.status !== "active")
    ) {
      return reply.status(404).send({ error: "Workspace not found" });
    }
  });

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
        ? await options.contextResolver.resolve(token, params.data.workspaceId)
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

  app.get(
    "/v1/workspaces/:workspaceId/schedule/shifts",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const query = weeklyShiftsQuerySchema.safeParse(request.query);
      if (!params.success || !query.success)
        return reply
          .status(400)
          .send({ error: "Valid schedule week required" });
      return weeklyShifts(
        reply,
        request.headers.authorization,
        options,
        params.data.workspaceId,
        query.data,
      );
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
    "/v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/shifts/:shiftId/restore",
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
        "restore",
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
            acknowledgePastEdits: body.data.acknowledge_past_edits,
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
  app.delete(
    "/v1/workspaces/:workspaceId/schedule/drafts/:draftId",
    async (request, reply) => {
      const params = paramsSchema
        .extend({ draftId: z.string().uuid() })
        .safeParse(request.params);
      const context = params.success
        ? await managerContext(
            request.headers.authorization,
            params.data.workspaceId,
            options,
          )
        : null;
      if (!params.success)
        return reply.status(400).send({ error: "Valid draft required" });
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
          await options.service.deleteDraft(
            context.userId,
            params.data.workspaceId,
            params.data.draftId,
          ),
        );
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
            departmentIds: body.data.department_ids,
            includeNoDepartment: body.data.include_no_department,
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
        return sendSchedulePublishResult(
          reply,
          await options.service.publish({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            draftId: body.data.draft_id,
            weekStart: body.data.week_start,
            locationIds: body.data.location_ids,
            departmentIds: body.data.department_ids,
            includeNoDepartment: body.data.include_no_department,
            expectedDraftRevision: body.data.expected_draft_revision,
            fingerprint: body.data.fingerprint,
            notifyEmployeeIds: body.data.notify_employee_ids,
            overrides: body.data.overrides,
            preflightAck: body.data.preflight_ack,
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
            "schedule.templates.read",
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
            "schedule.templates.read",
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
            departmentKeys: body.data.department_keys ?? null,
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
        await options.service.recordExport({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          surface: "schedule",
          format: body.data.settings.format,
          params: {
            week_start: body.data.week_start,
            source: body.data.source,
            location_ids: body.data.location_ids,
            layout: body.data.settings.layout,
          },
        });
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
  app.get(
    "/v1/workspaces/:workspaceId/schedule/exports/recent",
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
          await options.service.listRecentExports(
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
  app.patch(
    "/v1/workspaces/:workspaceId/schedule/export-presets/:presetId",
    async (request, reply) => {
      const params = presetParamsSchema.safeParse(request.params);
      const body = updatePresetBodySchema.safeParse(request.body);
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
        return reply.status(403).send({ error: "Schedule export access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        return reply.send(
          await options.service.updateExportPreset({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            presetId: params.data.presetId,
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
  app.get(
    "/v1/workspaces/:workspaceId/schedule/export-schedules",
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
          await options.service.listExportSchedules(
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
    "/v1/workspaces/:workspaceId/schedule/export-schedules",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = createExportScheduleBodySchema.safeParse(request.body);
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
          .send({ error: "Valid scheduled export required" });
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
          await options.service.createExportSchedule({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            schedule: body.data,
          }),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
  app.patch(
    "/v1/workspaces/:workspaceId/schedule/export-schedules/:scheduleId",
    async (request, reply) => {
      const params = exportScheduleParamsSchema.safeParse(request.params);
      const body = updateExportScheduleBodySchema.safeParse(request.body);
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
          .send({ error: "Valid scheduled export required" });
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
          await options.service.updateExportSchedule({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            scheduleId: params.data.scheduleId,
            schedule: body.data,
          }),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );
  app.delete(
    "/v1/workspaces/:workspaceId/schedule/export-schedules/:scheduleId",
    async (request, reply) => {
      const params = exportScheduleParamsSchema.safeParse(request.params);
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
          .send({ error: "Valid scheduled export required" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule export access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        await options.service.deleteExportSchedule(
          context.userId,
          params.data.workspaceId,
          params.data.scheduleId,
        );
        return reply.status(204).send();
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );

  app.get("/schedule/reference", async (request, reply) => {
    const query = activeScheduleQuerySchema.safeParse(request.query);
    const targetDate = query.success
      ? (query.data.date ?? query.data.week_start)
      : null;
    if (!query.success || !targetDate)
      return reply.status(400).send({ error: "Valid schedule period required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.read",
    );
    if (!context)
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
          context.workspace.id,
          targetDate,
        ),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.get("/schedule/shifts", async (request, reply) => {
    const query = weeklyShiftsQuerySchema.safeParse(request.query);
    if (!query.success)
      return reply.status(400).send({ error: "Valid schedule week required" });
    return activeWeeklyShifts(
      reply,
      request,
      options,
      query.data,
    );
  });

  app.get("/schedule/drafts", async (request, reply) => {
    const query = weekQuerySchema.safeParse(request.query);
    if (!query.success)
      return reply.status(400).send({ error: "Valid draft week required" });
    const context = await activeManagerContext(
      request,
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
        await options.service.listDrafts(
          context.userId,
          context.workspace.id,
          query.data.week_start,
        ),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.get("/schedule/publication-status", async (request, reply) => {
    const query = weekQuerySchema.safeParse(request.query);
    if (!query.success)
      return reply
        .status(400)
        .send({ error: "Valid publication week required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.read",
    );
    if (!context)
      return reply
        .status(403)
        .send({ error: "Manager schedule read access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.getPublicationStatus(
          context.userId,
          context.workspace.id,
          query.data.week_start,
        ),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.get("/schedule/pending-ops", async (request, reply) => {
    const query = pendingOpsQuerySchema.safeParse(request.query);
    if (!query.success)
      return reply.status(400).send({ error: "Valid pending-op scope required" });
    const context = await activeManagerContext(request, options);
    if (!context)
      return reply.status(403).send({ error: "Schedule manage access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    const locationIds = [
      ...new Set([
        ...query.data.location_ids,
        ...(query.data.location_id ? [query.data.location_id] : []),
      ]),
    ];
    try {
      return reply.send(
        await options.service.listPendingOps({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          weekStart: query.data.week_start,
          locationIds,
          draftId: query.data.draft_id ?? null,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/pending-ops", async (request, reply) => {
    const body = createPendingOpBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid pending-op payload required" });
    const context = await activeManagerContext(request, options);
    if (!context)
      return reply.status(403).send({ error: "Schedule manage access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.status(201).send(
        await options.service.addPendingOp({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          pendingOp: body.data,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.patch("/schedule/pending-ops/:opId", async (request, reply) => {
    const params = activePendingOpParamsSchema.safeParse(request.params);
    const body = updatePendingOpBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid pending-op payload required" });
    const context = await activeManagerContext(request, options);
    if (!context)
      return reply.status(403).send({ error: "Schedule manage access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.updatePendingOp({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          opId: params.data.opId,
          pendingOp: body.data,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.delete("/schedule/pending-ops/:opId", async (request, reply) => {
    const params = activePendingOpParamsSchema.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid pending-op id required" });
    const context = await activeManagerContext(request, options);
    if (!context)
      return reply.status(403).send({ error: "Schedule manage access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.removePendingOp({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          opId: params.data.opId,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.get(
    "/schedule/drafts/:draftId/availability-conflicts",
    async (request, reply) => {
      const params = activeDraftParamsSchema.safeParse(request.params);
      const query = weekQuerySchema.safeParse(request.query);
      if (!params.success || !query.success)
        return reply
          .status(400)
          .send({ error: "Valid draft week required" });
      const context = await activeManagerContext(
      request,
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
          await options.service.listDraftAvailabilityConflicts(
            context.userId,
            context.workspace.id,
            params.data.draftId,
            query.data.week_start,
          ),
        );
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );

  app.post(
    "/schedule/drafts/:draftId/auto-fill/preview",
    async (request, reply) => {
      const params = activeDraftParamsSchema.safeParse(request.params);
      const body = draftAutoFillPreviewBodySchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid auto-fill draft required" });
      const context = await activeManagerContext(
      request,
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
      let sessionId: string | null = null;
      try {
        const acquired = await options.service.acquireSession({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          weekStart: body.data.week_start,
          sourceKind: "draft",
          sourceDraftId: params.data.draftId,
        });
        if (acquired.status === "conflict") return reply.status(409).send(acquired);
        sessionId = acquired.session.id;
        const preview = await options.service.previewAutoFill(
          context.userId,
          context.workspace.id,
          acquired.session.id,
        );
        await options.service.discardSession(
          context.userId,
          context.workspace.id,
          acquired.session.id,
        );
        return reply.send(preview);
      } catch (error) {
        if (sessionId) {
          try {
            await options.service.discardSession(
              context.userId,
              context.workspace.id,
              sessionId,
            );
          } catch {
            // Keep the original auto-fill error visible to the caller.
          }
        }
        return scheduleError(reply, error);
      }
    },
  );

  app.post(
    "/schedule/drafts/:draftId/auto-fill/apply",
    async (request, reply) => {
      const params = activeDraftParamsSchema.safeParse(request.params);
      const body = draftAutoFillApplyBodySchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid auto-fill draft required" });
      const context = await activeManagerContext(
      request,
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
      let sessionId: string | null = null;
      try {
        const drafts = await options.service.listDrafts(
          context.userId,
          context.workspace.id,
          body.data.week_start,
        );
        const draft = drafts.drafts.find((candidate) => candidate.id === params.data.draftId);
        if (!draft) return reply.status(404).send({ error: "draft not found" });
        const acquired = await options.service.acquireSession({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          weekStart: body.data.week_start,
          sourceKind: "draft",
          sourceDraftId: params.data.draftId,
        });
        if (acquired.status === "conflict") return reply.status(409).send(acquired);
        sessionId = acquired.session.id;
        const preview = await options.service.previewAutoFill(
          context.userId,
          context.workspace.id,
          acquired.session.id,
        );
        const applied = await options.service.applyAutoFill({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          sessionId: acquired.session.id,
          expectedSessionRevision: preview.session_revision,
          fingerprint: preview.fingerprint,
          assignments: body.data.assignments,
        });
        const savedDraft = await options.service.saveSession({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          sessionId: acquired.session.id,
          expectedSessionRevision: applied.session.revision,
          name: draft.name,
          draftId: draft.id,
          expectedDraftRevision: draft.revision,
        });
        sessionId = null;
        return reply.send({ ...applied, draft: savedDraft });
      } catch (error) {
        if (sessionId) {
          try {
            await options.service.discardSession(
              context.userId,
              context.workspace.id,
              sessionId,
            );
          } catch {
            // Keep the original auto-fill error visible to the caller.
          }
        }
        return scheduleError(reply, error);
      }
    },
  );

  app.post("/schedule/edit-lock/acquire", async (request, reply) => {
    const body = acquireBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid edit source required" });
    const context = await activeManagerContext(
      request,
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
        await options.service.acquireSession({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          weekStart: body.data.week_start,
          sourceKind: body.data.source_kind,
          sourceDraftId: body.data.source_draft_id,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post(
    "/schedule/edit-session/materialize-live-draft",
    async (request, reply) => {
      const body = materializeLiveDraftBodySchema.safeParse(request.body);
      if (!body.success)
        return reply.status(400).send({ error: "Valid live schedule scope required" });
      const context = await activeManagerContext(
      request,
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
        const result = await options.service.acquireSession({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          weekStart: body.data.week_start,
          sourceKind: "published",
          sourceDraftId: null,
        });
        return reply.status(result.status === "conflict" ? 409 : 200).send(result);
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );

  app.patch("/schedule/edit-lock/heartbeat", async (request, reply) => {
    const body = activeSessionBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid edit session required" });
    const context = await activeManagerContext(
      request,
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
        await options.service.heartbeat(
          context.userId,
          context.workspace.id,
          body.data.session_id,
        ),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/edit-lock/takeover", async (request, reply) => {
    const body = activeTakeoverBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid edit session required" });
    const context = await activeManagerContext(
      request,
      options,
    );
    if (
      !context ||
      (context.membership.role !== "owner" && context.membership.role !== "admin")
    )
      return reply
        .status(403)
        .send({ error: "Schedule takeover access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.takeover(
          context.userId,
          context.workspace.id,
          body.data.session_id ?? body.data.lock_id!,
        ),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.delete("/schedule/edit-lock/release", async (request, reply) => {
    const body = activeSessionBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid edit session required" });
    const context = await activeManagerContext(
      request,
      options,
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule manage access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      await options.service.discardSession(
        context.userId,
        context.workspace.id,
        body.data.session_id,
      );
      return reply.status(204).send();
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/drafts/save", async (request, reply) => {
    const body = activeSaveBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid draft save required" });
    const context = await activeManagerContext(
      request,
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
        await options.service.saveSession({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          sessionId: body.data.session_id,
          expectedSessionRevision: body.data.expected_session_revision,
          name: body.data.name,
          draftId: body.data.draft_id,
          expectedDraftRevision: body.data.expected_draft_revision,
          acknowledgePastEdits: body.data.acknowledge_past_edits,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/edit-session/discard", async (request, reply) => {
    const body = activeSessionBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid edit session required" });
    const context = await activeManagerContext(
      request,
      options,
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule manage access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      await options.service.discardSession(
        context.userId,
        context.workspace.id,
        body.data.session_id,
      );
      return reply.send({ removed: 0 });
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.delete("/schedule/drafts/:draftId", async (request, reply) => {
    const params = z
      .object({ draftId: z.string().uuid() })
      .safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid draft required" });
    const context = await activeManagerContext(
      request,
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
        await options.service.deleteDraft(
          context.userId,
          context.workspace.id,
          params.data.draftId,
        ),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/publish-preview", async (request, reply) => {
    const body = publicationPreviewBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid publication scope required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.publish",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule publish access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.previewPublication({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          draftId: body.data.draft_id,
          locationIds: body.data.location_ids,
          departmentIds: body.data.department_ids,
          includeNoDepartment: body.data.include_no_department,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/publish", async (request, reply) => {
    const body = publishBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid publication review required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.publish",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule publish access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return sendSchedulePublishResult(
        reply,
        await options.service.publish({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          draftId: body.data.draft_id,
          weekStart: body.data.week_start,
          locationIds: body.data.location_ids,
          departmentIds: body.data.department_ids,
          includeNoDepartment: body.data.include_no_department,
          expectedDraftRevision: body.data.expected_draft_revision,
          fingerprint: body.data.fingerprint,
          notifyEmployeeIds: body.data.notify_employee_ids,
          overrides: body.data.overrides,
          preflightAck: body.data.preflight_ack,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/unpublish", async (request, reply) => {
    const body = unpublishBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid unpublish review required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.publish",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule publish access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.unpublish({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          weekStart: body.data.week_start,
          locationIds: body.data.location_ids,
          fingerprint: body.data.fingerprint,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/unpublish-preview", async (request, reply) => {
    const body = unpublishPreviewBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid unpublish scope required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.publish",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule publish access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.previewUnpublish({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          weekStart: body.data.week_start,
          locationIds: body.data.location_ids,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/export/preview", async (request, reply) => {
    const body = scheduleExportRequestSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid schedule export required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.export",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule export access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      const source = body.data.source;
      const preview = await options.service.previewExport({
        actorUserId: context.userId,
        workspaceId: context.workspace.id,
        weekStart: body.data.week_start,
        sourceType: source.type,
        sourceDraftId: source.type === "draft" ? source.draft_id : null,
        locationIds: body.data.location_ids,
      });
      return reply.send(prepareScheduleExport(preview, body.data.settings));
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/export/preview-html", async (request, reply) => {
    const body = scheduleExportRequestSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid schedule export required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.export",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule export access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      const source = body.data.source;
      const preview = prepareScheduleExport(
        await options.service.previewExport({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          weekStart: body.data.week_start,
          sourceType: source.type,
          sourceDraftId: source.type === "draft" ? source.draft_id : null,
          locationIds: body.data.location_ids,
        }),
        { ...body.data.settings, format: "print" },
      );
      return reply.send({
        html: renderSchedulePrintHtml(preview, {
          ...body.data.settings,
          format: "print",
        }),
      });
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/export", async (request, reply) => {
    const body = scheduleExportRequestSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid schedule export required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.export",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule export access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      const source = body.data.source;
      const preview = prepareScheduleExport(
        await options.service.previewExport({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          weekStart: body.data.week_start,
          sourceType: source.type,
          sourceDraftId: source.type === "draft" ? source.draft_id : null,
          locationIds: body.data.location_ids,
        }),
        body.data.settings,
      );
      await options.service.recordExport({
        actorUserId: context.userId,
        workspaceId: context.workspace.id,
        surface: "schedule",
        format: body.data.settings.format,
        params: {
          week_start: body.data.week_start,
          source: body.data.source,
          location_ids: body.data.location_ids,
          layout: body.data.settings.layout,
        },
      });
      const fileBase = `schedule-${body.data.week_start}`;
      if (body.data.settings.format === "csv") {
        return reply
          .type("text/csv; charset=utf-8")
          .header("Content-Disposition", `attachment; filename=\"${fileBase}.csv\"`)
          .send(renderScheduleCsv(preview, body.data.settings));
      }
      if (body.data.settings.format === "xlsx") {
        return reply
          .type(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          )
          .header("Content-Disposition", `attachment; filename=\"${fileBase}.xlsx\"`)
          .send(await renderScheduleWorkbook(preview, body.data.settings));
      }
      if (body.data.settings.format === "pdf") {
        return reply
          .type("application/pdf")
          .header("Content-Disposition", `attachment; filename=\"${fileBase}.pdf\"`)
          .send(renderSchedulePdf(preview, body.data.settings));
      }
      return reply
        .type("text/html; charset=utf-8")
        .header("Content-Disposition", `inline; filename=\"${fileBase}.html\"`)
        .send(renderSchedulePrintHtml(preview, body.data.settings));
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.get("/schedule/templates", async (request, reply) => {
    const context = await activeManagerContext(
      request,
      options,
      "schedule.templates.read",
    );
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
        await options.service.listTemplates(context.userId, context.workspace.id),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.get("/schedule/templates/:templateId", async (request, reply) => {
    const params = activeTemplateParamsSchema.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid template required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.templates.read",
    );
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
          context.workspace.id,
          params.data.templateId,
        ),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/templates", async (request, reply) => {
    const body = createTemplateBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid template source required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.templates.manage",
    );
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
          workspaceId: context.workspace.id,
          draftId: body.data.draft_id,
          name: body.data.name,
          stripAssignments: body.data.strip_assignments,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.patch("/schedule/templates/:templateId", async (request, reply) => {
    const params = activeTemplateParamsSchema.safeParse(request.params);
    const body = renameTemplateBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid template revision required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.templates.manage",
    );
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
          workspaceId: context.workspace.id,
          templateId: params.data.templateId,
          name: body.data.name,
          expectedRevision: body.data.expected_revision,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.delete("/schedule/templates/:templateId", async (request, reply) => {
    const params = activeTemplateParamsSchema.safeParse(request.params);
    const body = deleteTemplateBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid template revision required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.templates.manage",
    );
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
        workspaceId: context.workspace.id,
        templateId: params.data.templateId,
        expectedRevision: body.data.expected_revision,
      });
      return reply.status(204).send();
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/edit-sessions/:sessionId/apply-template", async (request, reply) => {
    const params = activeSessionParamsSchema.safeParse(request.params);
    const body = applyTemplateBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply
        .status(400)
        .send({ error: "Valid template application required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.templates.manage",
    );
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
          workspaceId: context.workspace.id,
          sessionId: params.data.sessionId,
          expectedSessionRevision: body.data.expected_session_revision,
          templateId: body.data.template_id,
          mode: body.data.mode,
          departmentKeys: body.data.department_keys ?? null,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/edit-sessions/:sessionId/auto-fill-preview", async (request, reply) => {
    const params = activeSessionParamsSchema.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid edit session required" });
    const context = await activeManagerContext(
      request,
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
        await options.service.previewAutoFill(
          context.userId,
          context.workspace.id,
          params.data.sessionId,
        ),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/edit-sessions/:sessionId/auto-fill-apply", async (request, reply) => {
    const params = activeSessionParamsSchema.safeParse(request.params);
    const body = applyAutoFillBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply
        .status(400)
        .send({ error: "Valid auto-fill review required" });
    const context = await activeManagerContext(
      request,
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
        await options.service.applyAutoFill({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          sessionId: params.data.sessionId,
          expectedSessionRevision: body.data.expected_session_revision,
          fingerprint: body.data.fingerprint,
          assignments: body.data.assignments,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.get("/schedule/export-presets", async (request, reply) => {
    const context = await activeManagerContext(
      request,
      options,
      "schedule.export",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule export access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.listExportPresets(
          context.userId,
          context.workspace.id,
        ),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/export-presets", async (request, reply) => {
    const body = createPresetBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid export preset required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.export",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule export access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.status(201).send(
        await options.service.createExportPreset({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          name: body.data.name,
          settings: body.data.settings,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.patch("/schedule/export-presets/:presetId", async (request, reply) => {
    const params = activePresetParamsSchema.safeParse(request.params);
    const body = updatePresetBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid export preset required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.export",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule export access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.updateExportPreset({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          presetId: params.data.presetId,
          name: body.data.name,
          settings: body.data.settings,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.delete("/schedule/export-presets/:presetId", async (request, reply) => {
    const params = activePresetParamsSchema.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid export preset required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.export",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule export access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      await options.service.deleteExportPreset(
        context.userId,
        context.workspace.id,
        params.data.presetId,
      );
      return reply.status(204).send();
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.get("/schedule/export-schedules", async (request, reply) => {
    const context = await activeManagerContext(
      request,
      options,
      "schedule.export",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule export access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.listExportSchedules(
          context.userId,
          context.workspace.id,
        ),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.get("/schedule/exports/recent", async (request, reply) => {
    const context = await activeManagerContext(
      request,
      options,
      "schedule.export",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule export access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.listRecentExports(
          context.userId,
          context.workspace.id,
        ),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/export-schedules", async (request, reply) => {
    const body = createExportScheduleBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid scheduled export required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.export",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule export access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.status(201).send(
        await options.service.createExportSchedule({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          schedule: body.data,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.patch("/schedule/export-schedules/:scheduleId", async (request, reply) => {
    const params = activeExportScheduleParamsSchema.safeParse(request.params);
    const body = updateExportScheduleBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid scheduled export required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.export",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule export access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.updateExportSchedule({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          scheduleId: params.data.scheduleId,
          schedule: body.data,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.delete(
    "/schedule/export-schedules/:scheduleId",
    async (request, reply) => {
      const params = activeExportScheduleParamsSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ error: "Valid scheduled export required" });
      const context = await activeManagerContext(
      request,
        options,
        "schedule.export",
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Schedule export access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Schedule service is not configured" });
      try {
        await options.service.deleteExportSchedule(
          context.userId,
          context.workspace.id,
          params.data.scheduleId,
        );
        return reply.status(204).send();
      } catch (error) {
        return scheduleError(reply, error);
      }
    },
  );

  app.post("/shifts", async (request, reply) => {
    const body = activeCreateShiftBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid shift required" });
    const idempotencyKey = z
      .string()
      .uuid()
      .safeParse(request.headers["idempotency-key"]);
    if (!idempotencyKey.success)
      return reply.status(400).send({ error: "Idempotency-Key header required" });
    return activeMutate(
      reply,
      request,
      options,
      body.data.session_id,
      body.data,
      "create",
      crypto.randomUUID(),
      idempotencyKey.data,
    );
  });

  app.get("/shifts", async (request, reply) => {
    const query = weeklyShiftsQuerySchema.safeParse(request.query);
    if (!query.success)
      return reply.status(400).send({ error: "Valid schedule week required" });
    return activeWeeklyShifts(
      reply,
      request,
      options,
      query.data,
    );
  });

  app.post("/shifts/batch", async (request, reply) => {
    const body = z.object({
      session_id: z.string().uuid(),
      expected_session_revision: z.number().int().min(1),
      shifts: z.array(scheduleShiftMutationInputSchema).min(1).max(200),
    }).safeParse(request.body);
    const key = z.string().uuid().safeParse(request.headers["idempotency-key"]);
    if (!body.success || !key.success) return reply.status(400).send({ error: "Valid shift batch and Idempotency-Key required" });
    const context = await activeManagerContext(request, options);
    if (!context || context.membership.status !== "active") return reply.status(403).send({ error: "Schedule manage access required" });
    if (!options.service?.createShiftsBatch) return reply.status(503).send({ error: "Schedule service is not configured" });
    try {
      return reply.send(await options.service.createShiftsBatch({
        actorUserId: context.userId, workspaceId: context.workspace.id,
        sessionId: body.data.session_id, expectedSessionRevision: body.data.expected_session_revision,
        shifts: body.data.shifts, idempotencyKey: key.data,
      }));
    } catch (error) { return scheduleError(reply, error); }
  });

  app.post("/shifts/bulk-delete", async (request, reply) => {
    const body = bulkDeleteShiftsBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid shift ids required" });
    const context = await activeManagerContext(
      request,
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
        await options.service.bulkDeleteShifts({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          shiftIds: body.data.ids,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.patch("/shifts/publish", async (request, reply) => {
    const body = legacyPublishBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid publication scope required" });
    const context = await activeManagerContext(
      request,
      options,
      "schedule.publish",
    );
    if (!context)
      return reply.status(403).send({ error: "Schedule publish access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      const drafts = await options.service.listDrafts(
        context.userId,
        context.workspace.id,
        body.data.week_start,
      );
      if (drafts.drafts.length === 0) {
        return reply.send({ published_count: 0 });
      }
      if (drafts.drafts.length > 1) {
        return reply
          .status(409)
          .send({ error: "multiple schedule drafts require explicit publish" });
      }
      const draft = drafts.drafts[0];
      if (!draft) return reply.send({ published_count: 0 });
      const readModel = await options.service.getReadModel(
        context.userId,
        context.workspace.id,
        body.data.week_start,
      );
      const locationIds = body.data.location_id
        ? [body.data.location_id]
        : readModel.locations.map((location) => location.id);
      if (locationIds.length === 0) return reply.send({ published_count: 0 });
      const preview = await options.service.previewPublication({
        actorUserId: context.userId,
        workspaceId: context.workspace.id,
        draftId: draft.id,
        locationIds,
      });
      if (preview.status !== "publish_ready") {
        return reply.status(422).send({
          error: "schedule has publication blockers",
          status: preview.status,
          findings: preview.findings,
        });
      }
      const result = await options.service.publish({
        actorUserId: context.userId,
        workspaceId: context.workspace.id,
        draftId: draft.id,
        locationIds,
        expectedDraftRevision: preview.draft_revision,
        fingerprint: preview.fingerprint,
        overrides: [],
      });
      if (result.status !== "published") {
        return sendSchedulePublishResult(reply, result);
      }
      return reply.send({ published_count: result.published_shift_count });
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.patch("/shifts/:shiftId", async (request, reply) => {
    const params = activeShiftParamsSchema.safeParse(request.params);
    const body = activeUpdateShiftBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid shift revision required" });
    return activeMutate(
      reply,
      request,
      options,
      body.data.session_id,
      body.data,
      "update",
      params.data.shiftId,
    );
  });

  app.delete("/shifts/:shiftId", async (request, reply) => {
    const params = activeShiftParamsSchema.safeParse(request.params);
    const body = activeDeleteShiftBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid shift revision required" });
    return activeMutate(
      reply,
      request,
      options,
      body.data.session_id,
      body.data,
      "delete",
      params.data.shiftId,
    );
  });

  app.patch("/shifts/:shiftId/restore", async (request, reply) => {
    const params = activeShiftParamsSchema.safeParse(request.params);
    const body = activeRestoreShiftBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid shift revision required" });
    return activeMutate(
      reply,
      request,
      options,
      body.data.session_id,
      body.data,
      "restore",
      params.data.shiftId,
    );
  });
}

async function managerContext(
  authorization: string | undefined,
  workspaceId: string,
  options: {
    readonly service: ScheduleReadService | null;
    readonly contextResolver: WorkspaceContextResolver | null;
  },
  permission:
    | "schedule.read"
    | "schedule.manage"
    | "schedule.publish"
    | "schedule.templates.read"
    | "schedule.templates.manage"
    | "schedule.export" = "schedule.manage",
) {
  const token = bearerToken(authorization);
  const context =
    token && options.contextResolver
      ? await options.contextResolver.resolve(token, workspaceId)
      : null;
  return context &&
    context.workspace.id === workspaceId &&
    context.membership.role !== "employee" &&
    context.permissions.includes(permission)
    ? context
    : null;
}

async function activeManagerContext(
  source: WorkspaceContextRequestSource,
  options: {
    readonly service: ScheduleReadService | null;
    readonly contextResolver: WorkspaceContextResolver | null;
  },
  permission:
    | "schedule.read"
    | "schedule.manage"
    | "schedule.publish"
    | "schedule.templates.read"
    | "schedule.templates.manage"
    | "schedule.export" = "schedule.manage",
) {
  const token = bearerToken(authorizationFromSource(source));
  const workspaceId = workspaceIdFromSource(source);
  const context =
    token && options.contextResolver
      ? await options.contextResolver.resolve(token, workspaceId)
      : null;
  return context &&
    (!workspaceId || context.workspace.id === workspaceId) &&
    context.membership.role !== "employee" &&
    context.permissions.includes(permission)
    ? context
    : null;
}

async function activeWeeklyShifts(
  reply: FastifyReply,
  source: WorkspaceContextRequestSource,
  options: {
    readonly service: ScheduleReadService | null;
    readonly contextResolver: WorkspaceContextResolver | null;
  },
  query: z.infer<typeof weeklyShiftsQuerySchema>,
) {
  const context = await activeManagerContext(
    source,
    options,
    "schedule.read",
  );
  if (!context)
    return reply
      .status(403)
      .send({ error: "Manager schedule read access required" });
  return weeklyShifts(
    reply,
    authorizationFromSource(source),
    options,
    context.workspace.id,
    query,
  );
}

async function weeklyShifts(
  reply: FastifyReply,
  authorization: string | undefined,
  options: {
    readonly service: ScheduleReadService | null;
    readonly contextResolver: WorkspaceContextResolver | null;
  },
  workspaceId: string,
  query: z.infer<typeof weeklyShiftsQuerySchema>,
) {
  const context = await managerContext(
    authorization,
    workspaceId,
    options,
    "schedule.read",
  );
  if (!context)
    return reply
      .status(403)
      .send({ error: "Manager schedule read access required" });
  if (!options.service)
    return reply
      .status(503)
      .send({ error: "Schedule service is not configured" });
  try {
    return reply.send(
      await options.service.listWeeklyShifts({
        actorUserId: context.userId,
        workspaceId,
        weekStart: query.week_start,
        locationIds: query.location_ids,
        draftId: query.draft_id ?? null,
        includeLive: query.include_live,
      }),
    );
  } catch (error) {
    return scheduleError(reply, error);
  }
}

async function activeMutate(
  reply: FastifyReply,
  source: WorkspaceContextRequestSource,
  options: {
    readonly service: ScheduleReadService | null;
    readonly contextResolver: WorkspaceContextResolver | null;
  },
  sessionId: string,
  body: {
    expected_session_revision: number;
    expected_shift_revision?: number;
    shift?: z.infer<typeof scheduleShiftMutationInputSchema>;
  },
  operation: "create" | "update" | "delete" | "restore",
  shiftId: string,
  idempotencyKey?: string,
) {
  const context = await activeManagerContext(source, options);
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
        workspaceId: context.workspace.id,
        sessionId,
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
  operation: "create" | "update" | "delete" | "restore",
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

function parseStructuredScheduleError(error: unknown): Record<string, unknown> | null {
  const message = error instanceof Error ? error.message : "";
  if (!message.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(message) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function scheduleError(reply: FastifyReply, error: unknown) {
  const structured = parseStructuredScheduleError(error);
  if (structured?.status === "past_shift_edit_requires_ack") {
    return reply.status(409).send(structured);
  }
  if (structured?.status === "past_edit_blocked") {
    return reply.status(403).send(structured);
  }
  const message =
    error instanceof Error ? error.message : "Schedule operation failed";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  // Only this explicit rejection may enter the client's assessment/retry path.
  // Other serialization failures still require a fresh edit session.
  if (["40001", "PT409"].includes(code) && message === "Review the current availability assessment before saving") {
    return reply.status(409).send({ error: message, code, status: "availability_review_required" });
  }
  if (["42501", "40001", "PT409", "23514", "22023"].includes(code)) {
    const status = code === "42501" ? 403 : ["40001", "PT409"].includes(code) ? 409 : 422;
    return reply.status(status).send({ error: message, code });
  }
  const status =
    message.includes("access required") || message.includes("scope denied")
      ? 403
      : message.includes("not found")
        ? 404
        : message.includes("hard document blockers") ||
            message.includes("hard publication blockers")
          ? 422
        : message.includes("stale") ||
            message.includes("expired") ||
            message.includes("conflict") ||
            message.includes("in use")
          ? 409
          : 400;
  return reply.status(status).send({ error: message });
}

function bearerToken(authorization: string | undefined): string {
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}
