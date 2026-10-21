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
  scheduleOpenShiftChoiceSchema,
  schedulePublicationOverrideInputSchema,
  scheduleShiftMutationInputSchema,
  updateScheduleExportScheduleInputSchema,
  scheduleViewSchema,
  type SchedulePublishResult,
} from "@newfork/shared/schedule";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import {
  authorize,
  resolveActor,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import { HttpError } from "../http-error";
import type { ScheduleReadService } from "./schedule-service";
import { registerScheduleExportV2Routes } from "./schedule-export-v2-routes";
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
const activeTemplateParamsSchema = z.object({
  templateId: z.string().uuid(),
});
const activePresetParamsSchema = z.object({ presetId: z.string().uuid() });
const activeExportScheduleParamsSchema = z.object({
  scheduleId: z.string().uuid(),
});
const acquireBodySchema = z.object({
  week_start: z.string().date(),
  source_kind: scheduleEditSourceSchema,
  source_draft_id: z.string().uuid().nullable().default(null),
  // The locations to edit; none named means every location the person may edit.
  location_ids: z.array(z.string().uuid()).min(1).max(200).nullable().default(null),
  // False when the person asks for a new edit from a menu: an edit of theirs
  // that was left open (its lock ran out) is set aside, never brought back.
  resume: z.boolean().default(true),
});
const activeSessionBodySchema = z.object({
  session_id: z.string().uuid(),
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
const publishBodySchema = publicationPreviewBodySchema.extend({
  week_start: z.string().date().optional(),
  expected_draft_revision: z.number().int().positive(),
  fingerprint: z.string().length(64),
  overrides: z
    .array(schedulePublicationOverrideInputSchema)
    .max(200)
    .default([]),
  preflight_ack: schedulePublicationPreflightAckSchema.optional(),
  open_shifts: scheduleOpenShiftChoiceSchema.optional(),
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
const templateApplyPreviewBodySchema = z.object({
  template_id: z.string().uuid(),
  department_keys: z.array(z.string()).nullable().optional(),
});
const applyAutoFillBodySchema = mutationRevisionSchema.extend({
  fingerprint: z.string().length(64),
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
function workspaceIdFromSource(request: FastifyRequest) {
  const value = request.headers["x-newfork-workspace-id"];
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
  registerScheduleExportV2Routes(app, options);
  for (const action of ["preview", "apply"] as const) {
    app.post(`/v1/workspaces/:workspaceId/schedule/edit-sessions/:sessionId/default-hours-${action}`, async (request, reply) => {
      const context = authorize(await workspaceActor(request, options), "schedule.edit");
      const params = sessionParamsSchema.safeParse(request.params);
      const body = (action === "preview" ? scheduleDefaultHoursInputSchema : scheduleDefaultHoursApplySchema).safeParse(request.body);
      if (!params.success || !body.success) return reply.status(400).send({ error: "Valid default-hours review required" });
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

  app.get("/schedule/reference", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.read");
    const query = activeScheduleQuerySchema.safeParse(request.query);
    const targetDate = query.success
      ? (query.data.date ?? query.data.week_start)
      : null;
    if (!query.success || !targetDate)
      return reply.status(400).send({ error: "Valid schedule period required" });
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
    const context = authorize(await activeActor(request, options), "schedule.read");
    const query = weeklyShiftsQuerySchema.safeParse(request.query);
    if (!query.success)
      return reply.status(400).send({ error: "Valid schedule week required" });
    return weeklyShifts(reply, context, options,
      query.data,
    );
  });

  app.get("/schedule/drafts", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const query = weekQuerySchema.safeParse(request.query);
    if (!query.success)
      return reply.status(400).send({ error: "Valid draft week required" });
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
    const context = authorize(await activeActor(request, options), "schedule.read");
    const query = weekQuerySchema.safeParse(request.query);
    if (!query.success)
      return reply
        .status(400)
        .send({ error: "Valid publication week required" });
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
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const query = pendingOpsQuerySchema.safeParse(request.query);
    if (!query.success)
      return reply.status(400).send({ error: "Valid pending-op scope required" });
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
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const body = createPendingOpBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid pending-op payload required" });
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
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const params = activePendingOpParamsSchema.safeParse(request.params);
    const body = updatePendingOpBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid pending-op payload required" });
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
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const params = activePendingOpParamsSchema.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid pending-op id required" });
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

  app.post("/schedule/edit-lock/acquire", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const body = acquireBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid edit source required" });
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
          locationIds: body.data.location_ids,
          resume: body.data.resume,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.patch("/schedule/edit-lock/heartbeat", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const body = activeSessionBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid edit session required" });
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

  app.delete("/schedule/edit-lock/release", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const body = activeSessionBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid edit session required" });
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

  // S1: the idle countdown ended; the edit is kept as an "Auto-save" draft.
  app.post("/schedule/edit-lock/autosave", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const body = activeSessionBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid edit session required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.autosaveSession(
          context.userId,
          context.workspace.id,
          body.data.session_id,
        ),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/drafts/save", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const body = activeSaveBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid draft save required" });
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

  app.delete("/schedule/drafts/:draftId", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const params = z
      .object({ draftId: z.string().uuid() })
      .safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid draft required" });
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
    const context = authorize(await activeActor(request, options), "schedule.publish");
    const body = publicationPreviewBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid publication scope required" });
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
    const context = authorize(await activeActor(request, options), "schedule.publish");
    const body = publishBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid publication review required" });
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
          overrides: body.data.overrides,
          preflightAck: body.data.preflight_ack,
          openShifts: body.data.open_shifts,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/unpublish", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.publish");
    const body = unpublishBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid unpublish review required" });
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
    const context = authorize(await activeActor(request, options), "schedule.publish");
    const body = unpublishPreviewBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid unpublish scope required" });
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
    const context = authorize(await activeActor(request, options), "schedule.export");
    const body = scheduleExportRequestSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid schedule export required" });
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
    const context = authorize(await activeActor(request, options), "schedule.export");
    const body = scheduleExportRequestSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid schedule export required" });
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
    const context = authorize(await activeActor(request, options), "schedule.export");
    const body = scheduleExportRequestSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid schedule export required" });
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
    const context = authorize(await activeActor(request, options), "schedule.templates.read");
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
    const context = authorize(await activeActor(request, options), "schedule.templates.read");
    const params = activeTemplateParamsSchema.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid template required" });
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
    const context = authorize(await activeActor(request, options), "schedule.templates");
    const body = createTemplateBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid template source required" });
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
    const context = authorize(await activeActor(request, options), "schedule.templates");
    const params = activeTemplateParamsSchema.safeParse(request.params);
    const body = renameTemplateBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid template revision required" });
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
    const context = authorize(await activeActor(request, options), "schedule.templates");
    const params = activeTemplateParamsSchema.safeParse(request.params);
    const body = deleteTemplateBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid template revision required" });
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
    const context = authorize(await activeActor(request, options), "schedule.templates");
    const params = activeSessionParamsSchema.safeParse(request.params);
    const body = applyTemplateBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply
        .status(400)
        .send({ error: "Valid template application required" });
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

  // KK-162 (BL-694): Replace's first click says how many shifts it removes.
  app.post("/schedule/edit-sessions/:sessionId/template-apply-preview", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.templates");
    const params = activeSessionParamsSchema.safeParse(request.params);
    const body = templateApplyPreviewBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply
        .status(400)
        .send({ error: "Valid template preview required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.previewTemplateApply({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          sessionId: params.data.sessionId,
          templateId: body.data.template_id,
          departmentKeys: body.data.department_keys ?? null,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  // S2 (KK-171): Undo takes the edit's last step back on the server.
  app.post("/schedule/edit-sessions/:sessionId/undo", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const params = activeSessionParamsSchema.safeParse(request.params);
    const body = mutationRevisionSchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid undo required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    try {
      return reply.send(
        await options.service.undoSessionStep({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          sessionId: params.data.sessionId,
          expectedSessionRevision: body.data.expected_session_revision,
        }),
      );
    } catch (error) {
      return scheduleError(reply, error);
    }
  });

  app.post("/schedule/edit-sessions/:sessionId/auto-fill-preview", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const params = activeSessionParamsSchema.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid edit session required" });
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
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const params = activeSessionParamsSchema.safeParse(request.params);
    const body = applyAutoFillBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply
        .status(400)
        .send({ error: "Valid auto-fill review required" });
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
    const context = authorize(await activeActor(request, options), "schedule.export");
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
    const context = authorize(await activeActor(request, options), "schedule.export");
    const body = createPresetBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid export preset required" });
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
    const context = authorize(await activeActor(request, options), "schedule.export");
    const params = activePresetParamsSchema.safeParse(request.params);
    const body = updatePresetBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid export preset required" });
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
    const context = authorize(await activeActor(request, options), "schedule.export");
    const params = activePresetParamsSchema.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid export preset required" });
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
    const context = authorize(await activeActor(request, options), "schedule.export");
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
    const context = authorize(await activeActor(request, options), "schedule.export");
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
    const context = authorize(await activeActor(request, options), "schedule.export");
    const body = createExportScheduleBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid scheduled export required" });
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
    const context = authorize(await activeActor(request, options), "schedule.export");
    const params = activeExportScheduleParamsSchema.safeParse(request.params);
    const body = updateExportScheduleBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid scheduled export required" });
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
      const context = authorize(await activeActor(request, options), "schedule.export");
      const params = activeExportScheduleParamsSchema.safeParse(request.params);
      if (!params.success)
        return reply
          .status(400)
          .send({ error: "Valid scheduled export required" });
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
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const body = activeCreateShiftBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid shift required" });
    const idempotencyKey = z
      .string()
      .uuid()
      .safeParse(request.headers["idempotency-key"]);
    if (!idempotencyKey.success)
      return reply.status(400).send({ error: "Idempotency-Key header required" });
    return mutate(reply, context,
      options,
      body.data.session_id,
      body.data,
      "create",
      crypto.randomUUID(),
      idempotencyKey.data,
    );
  });

  app.post("/shifts/batch", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const body = z.object({
      session_id: z.string().uuid(),
      expected_session_revision: z.number().int().min(1),
      shifts: z.array(scheduleShiftMutationInputSchema).min(1).max(200),
    }).safeParse(request.body);
    const key = z.string().uuid().safeParse(request.headers["idempotency-key"]);
    if (!body.success || !key.success) return reply.status(400).send({ error: "Valid shift batch and Idempotency-Key required" });
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
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const body = bulkDeleteShiftsBodySchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid shift ids required" });
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

  app.patch("/shifts/:shiftId", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const params = activeShiftParamsSchema.safeParse(request.params);
    const body = activeUpdateShiftBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid shift revision required" });
    return mutate(reply, context,
      options,
      body.data.session_id,
      body.data,
      "update",
      params.data.shiftId,
    );
  });

  app.delete("/shifts/:shiftId", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const params = activeShiftParamsSchema.safeParse(request.params);
    const body = activeDeleteShiftBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid shift revision required" });
    return mutate(reply, context,
      options,
      body.data.session_id,
      body.data,
      "delete",
      params.data.shiftId,
    );
  });

  app.patch("/shifts/:shiftId/restore", async (request, reply) => {
    const context = authorize(await activeActor(request, options), "schedule.edit");
    const params = activeShiftParamsSchema.safeParse(request.params);
    const body = activeRestoreShiftBodySchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid shift revision required" });
    return mutate(reply, context,
      options,
      body.data.session_id,
      body.data,
      "restore",
      params.data.shiftId,
    );
  });
}

type RouteOptions = {
  readonly service: ScheduleReadService | null;
  readonly contextResolver: WorkspaceContextResolver | null;
};

/** Who is asking, in the workspace the URL names. */
function workspaceActor(request: FastifyRequest, options: RouteOptions) {
  const { workspaceId } = request.params as { workspaceId: string };
  return resolveActor(request.headers.authorization, workspaceId, options.contextResolver);
}

/** Who is asking, in the workspace the tab chose (or the one they last chose). */
function activeActor(request: FastifyRequest, options: RouteOptions) {
  return resolveActor(
    request.headers.authorization,
    workspaceIdFromSource(request),
    options.contextResolver,
  );
}

async function weeklyShifts(
  reply: FastifyReply,
  context: ActiveWorkspaceContext,
  options: RouteOptions,
  query: z.infer<typeof weeklyShiftsQuerySchema>,
) {
  if (!options.service)
    return reply
      .status(503)
      .send({ error: "Schedule service is not configured" });
  try {
    return reply.send(
      await options.service.listWeeklyShifts({
        actorUserId: context.userId,
        workspaceId: context.workspace.id,
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

async function mutate(
  reply: FastifyReply,
  context: ActiveWorkspaceContext,
  options: RouteOptions,
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

/**
 * The past-edit refusals are a RAISE whose message is a JSON payload, which the
 * Retroactive edit window reads (apps/web/src/schedule/lib/retroactiveEditRecovery.ts).
 * rpcFailure swaps a message with double quotes for a plain sentence, so the
 * payload is read from the database error it keeps on `cause`, for these two
 * statuses only.
 */
function pastEditPayload(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof HttpError) || error.pgCode !== "P0001") return null;
  const raw = (error.cause as { message?: unknown } | undefined)?.message;
  if (typeof raw !== "string" || !raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as { status?: unknown } | null;
    return parsed?.status === "past_edit_blocked" ||
      parsed?.status === "past_shift_edit_requires_ack"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The two refusals the screen reads a body for; everything else goes to the global handler. */
// D-O7: the edit conflicts the web acts on travel with a code, so it never matches the sentence.
// BL-958: the database names them in the hint of a PT409 (a 40001 is retried by PostgREST without end).
const EDIT_CONFLICT_CODES: Readonly<Record<string, string>> = {
  "schedule.edit_lease_expired": "edit_lease_expired",
  "schedule.edit_session_closed": "edit_session_closed",
  "schedule.edit_session_stale": "edit_session_stale",
};

function scheduleError(reply: FastifyReply, error: unknown) {
  const pastEdit = pastEditPayload(error);
  if (pastEdit)
    return reply
      .status(pastEdit.status === "past_edit_blocked" ? 403 : 409)
      .send(pastEdit);
  // Only this explicit rejection may enter the client's assessment/retry path
  // (the database raises it as PT409; PostgREST retries 40001 on its own).
  // Other serialization failures still require a fresh edit session.
  // BL-1044: the database names it in the hint; the sentence may change.
  if (
    error instanceof HttpError &&
    error.pgCode === "PT409" &&
    error.reason === "schedule.availability_review_required"
  )
    return reply.status(409).send({
      error: error.message,
      code: error.pgCode,
      status: "availability_review_required",
    });
  const code = error instanceof HttpError && error.pgCode === "PT409" && error.reason ? EDIT_CONFLICT_CODES[error.reason] : undefined;
  if (code) return reply.status(409).send({ error: (error as HttpError).message, code });
  throw error;
}

function bearerToken(authorization: string | undefined): string {
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}
