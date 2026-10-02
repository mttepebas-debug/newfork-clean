import {
  scheduleDefaultHoursPreviewSchema,
  type ScheduleDefaultHoursInput,
  type ScheduleDefaultHoursApply,
  type ScheduleDefaultHoursPreview,
  scheduleDraftListSchema,
  scheduleDraftDeleteResultSchema,
  scheduleAvailabilityConflictResultSchema,
  scheduleBulkDeleteResultSchema,
  scheduleDraftSummarySchema,
  scheduleEditAcquireResultSchema,
  scheduleEditSessionSchema,
  schedulePublicationPreviewSchema,
  schedulePublicationHistorySchema,
  schedulePublishResultSchema,
  scheduleReadModelSchema,
  scheduleUnpublishPreviewSchema,
  scheduleUnpublishResultSchema,
  scheduleAutoFillApplyResultSchema,
  scheduleAutoFillPreviewSchema,
  scheduleExportPresetListSchema,
  scheduleExportPresetSchema,
  scheduleExportPreviewSchema,
  scheduleExportSettingsSchema,
  schedulePendingOpListSchema,
  schedulePendingOpMutationResultSchema,
  schedulePublicationStatusSchema,
  scheduleRecentExportEventListSchema,
  scheduleRecentExportEventSchema,
  scheduleExportScheduleListSchema,
  scheduleExportScheduleSchema,
  legacyScheduleShiftListSchema,
  scheduleTemplateApplyResultSchema,
  scheduleTemplateDetailSchema,
  scheduleTemplateListSchema,
  type ScheduleDraftList,
  type ScheduleDraftDeleteResult,
  type ScheduleAvailabilityConflictResult,
  type ScheduleBulkDeleteResult,
  type ScheduleDraftSummary,
  type ScheduleEditAcquireResult,
  type ScheduleEditSession,
  type ScheduleEditSource,
  type SchedulePublicationOverrideInput,
  type SchedulePublicationPreflightAck,
  type SchedulePublicationHistory,
  type SchedulePublicationPreview,
  type SchedulePublishResult,
  type ScheduleReadModel,
  type ScheduleShiftMutationInput,
  type ScheduleUnpublishPreview,
  type ScheduleUnpublishResult,
  type ScheduleAutoFillApplyResult,
  type ScheduleAutoFillAssignment,
  type ScheduleAutoFillPreview,
  type ScheduleExportPreset,
  type ScheduleExportPreview,
  type ScheduleExportSchedule,
  type ScheduleExportSettings,
  type SchedulePendingOpMutationResult,
  type SchedulePublicationStatus,
  type ScheduleRecentExportEvent,
  type ScheduleTemplateApplyResult,
  type ScheduleTemplateDetail,
  type ScheduleTemplateList,
  type CreateScheduleExportScheduleInput,
  type CreateSchedulePendingOpInput,
  type LegacyScheduleShiftList,
  type UpdateSchedulePendingOpInput,
  type UpdateScheduleExportScheduleInput,
} from "@newfork/shared/schedule";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rpcFailure } from "../http-error.js";

export const scheduledExportCronCandidateSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  workspace_name: z.string().trim().min(1),
  created_by: z.string().uuid(),
  preset_id: z.string().uuid(),
  preset_name: z.string().trim().min(1).max(80),
  settings: scheduleExportSettingsSchema,
  name: z.string().trim().min(1).max(80),
  recipients: z.array(z.string().email()).min(1).max(10),
  // Only live locations (Q-C); empty when every one was deleted.
  location_ids: z.array(z.string().uuid()).max(100),
  day_of_week: z.coerce.number().int().min(0).max(6),
  send_hour: z.coerce.number().int().min(0).max(23),
  timezone: z.string().trim().min(1).max(80),
  week_start_day: z.enum(["sunday", "monday"]),
  last_sent_at: z.string().datetime({ offset: true }).nullable(),
  consecutive_failures: z.coerce.number().int().nonnegative(),
});
export type ScheduledExportCronCandidate = z.infer<
  typeof scheduledExportCronCandidateSchema
>;
const scheduledExportCronCandidateListSchema = z.object({
  schedules: z.array(z.unknown()),
});
const scheduledExportCronIdentitySchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
});
const scheduleDraftDocumentConflictPreviewSchema = z.object({
  status: z.literal("ok"),
  conflicts: z.array(z.unknown()).default([]),
  fingerprint: z.string().min(1).max(128),
});
type ScheduleInvalidationTarget =
  | "published_shifts"
  | "draft_shifts"
  | "pending_ops"
  | "drafts"
  | "edit_lock"
  | "employee_my_schedule";

interface ScheduleInvalidationPayload {
  readonly workspace_id: string;
  readonly actor_user_id: string;
  readonly week_start?: string;
  readonly location_ids?: readonly string[];
  readonly draft_id?: string | null;
  readonly targets: readonly ScheduleInvalidationTarget[];
  readonly changed_shift_ids?: readonly string[];
}

export interface ScheduleReadService {
  getReadModel(
    actorUserId: string,
    workspaceId: string,
    targetDate: string,
  ): Promise<ScheduleReadModel>;
  listDrafts(
    actorUserId: string,
    workspaceId: string,
    weekStart: string,
  ): Promise<ScheduleDraftList>;
  listWeeklyShifts(input: {
    actorUserId: string;
    workspaceId: string;
    weekStart: string;
    locationIds?: string[];
    draftId?: string | null;
    includeLive?: boolean;
  }): Promise<LegacyScheduleShiftList>;
  acquireSession(input: {
    actorUserId: string;
    workspaceId: string;
    weekStart: string;
    sourceKind: ScheduleEditSource;
    sourceDraftId: string | null;
    locationIds?: readonly string[] | null;
  }): Promise<ScheduleEditAcquireResult>;
  heartbeat(
    actorUserId: string,
    workspaceId: string,
    sessionId: string,
  ): Promise<ScheduleEditSession>;
  mutateShift(input: {
    actorUserId: string;
    workspaceId: string;
    sessionId: string;
    expectedSessionRevision: number;
    operation: "create" | "update" | "delete" | "restore";
    shiftId: string;
    expectedShiftRevision?: number;
    shift?: ScheduleShiftMutationInput;
    idempotencyKey?: string;
  }): Promise<ScheduleEditSession>;
  createShiftsBatch?(input: {
    actorUserId: string;
    workspaceId: string;
    sessionId: string;
    expectedSessionRevision: number;
    shifts: ScheduleShiftMutationInput[];
    idempotencyKey: string;
  }): Promise<ScheduleEditSession>;
  bulkDeleteShifts(input: {
    actorUserId: string;
    workspaceId: string;
    shiftIds: string[];
  }): Promise<ScheduleBulkDeleteResult>;
  previewDefaultHours?(input: {
    actorUserId: string;
    workspaceId: string;
    sessionId: string;
    command: ScheduleDefaultHoursInput;
  }): Promise<ScheduleDefaultHoursPreview>;
  applyDefaultHours?(input: {
    actorUserId: string;
    workspaceId: string;
    sessionId: string;
    command: ScheduleDefaultHoursApply;
  }): Promise<ScheduleEditSession>;
  saveSession(input: {
    actorUserId: string;
    workspaceId: string;
    sessionId: string;
    expectedSessionRevision: number;
    name: string;
    draftId: string | null;
    expectedDraftRevision: number | null;
    acknowledgePastEdits?: boolean;
  }): Promise<ScheduleDraftSummary>;
  discardSession(
    actorUserId: string,
    workspaceId: string,
    sessionId: string,
  ): Promise<void>;
  deleteDraft(
    actorUserId: string,
    workspaceId: string,
    draftId: string,
  ): Promise<ScheduleDraftDeleteResult>;
  listDraftAvailabilityConflicts(
    actorUserId: string,
    workspaceId: string,
    draftId: string,
    weekStart: string,
  ): Promise<ScheduleAvailabilityConflictResult>;
  listPendingOps(input: {
    actorUserId: string;
    workspaceId: string;
    weekStart: string;
    locationIds?: string[];
    draftId?: string | null;
  }): Promise<ReturnType<typeof schedulePendingOpListSchema.parse>>;
  addPendingOp(input: {
    actorUserId: string;
    workspaceId: string;
    pendingOp: CreateSchedulePendingOpInput;
  }): Promise<SchedulePendingOpMutationResult>;
  updatePendingOp(input: {
    actorUserId: string;
    workspaceId: string;
    opId: string;
    pendingOp: UpdateSchedulePendingOpInput;
  }): Promise<SchedulePendingOpMutationResult>;
  removePendingOp(input: {
    actorUserId: string;
    workspaceId: string;
    opId: string;
  }): Promise<SchedulePendingOpMutationResult>;
  getPublicationStatus(
    actorUserId: string,
    workspaceId: string,
    weekStart: string,
  ): Promise<SchedulePublicationStatus>;
  previewPublication(input: {
    actorUserId: string;
    workspaceId: string;
    draftId: string;
    locationIds: string[];
    departmentIds?: string[];
    includeNoDepartment?: boolean;
  }): Promise<SchedulePublicationPreview>;
  publish(input: {
    actorUserId: string;
    workspaceId: string;
    draftId: string;
    weekStart?: string;
    locationIds: string[];
    departmentIds?: string[];
    includeNoDepartment?: boolean;
    expectedDraftRevision: number;
    fingerprint: string;
    notifyEmployeeIds?: string[];
    overrides: SchedulePublicationOverrideInput[];
    preflightAck?: SchedulePublicationPreflightAck;
  }): Promise<SchedulePublishResult>;
  previewUnpublish(input: {
    actorUserId: string;
    workspaceId: string;
    weekStart: string;
    locationIds: string[];
  }): Promise<ScheduleUnpublishPreview>;
  unpublish(input: {
    actorUserId: string;
    workspaceId: string;
    weekStart: string;
    locationIds: string[];
    fingerprint: string;
  }): Promise<ScheduleUnpublishResult>;
  getPublicationHistory(
    actorUserId: string,
    workspaceId: string,
    weekStart: string,
  ): Promise<SchedulePublicationHistory>;
  listTemplates(
    actorUserId: string,
    workspaceId: string,
  ): Promise<ScheduleTemplateList>;
  getTemplate(
    actorUserId: string,
    workspaceId: string,
    templateId: string,
  ): Promise<ScheduleTemplateDetail>;
  createTemplate(input: {
    actorUserId: string;
    workspaceId: string;
    draftId: string;
    name: string;
    stripAssignments: boolean;
  }): Promise<ScheduleTemplateDetail>;
  renameTemplate(input: {
    actorUserId: string;
    workspaceId: string;
    templateId: string;
    name: string;
    expectedRevision: number;
  }): Promise<ScheduleTemplateDetail>;
  deleteTemplate(input: {
    actorUserId: string;
    workspaceId: string;
    templateId: string;
    expectedRevision: number;
  }): Promise<void>;
  applyTemplate(input: {
    actorUserId: string;
    workspaceId: string;
    sessionId: string;
    expectedSessionRevision: number;
    templateId: string;
    mode: "merge" | "overwrite";
    departmentKeys: readonly string[] | null;
  }): Promise<ScheduleTemplateApplyResult>;
  previewAutoFill(
    actorUserId: string,
    workspaceId: string,
    sessionId: string,
  ): Promise<ScheduleAutoFillPreview>;
  applyAutoFill(input: {
    actorUserId: string;
    workspaceId: string;
    sessionId: string;
    expectedSessionRevision: number;
    fingerprint: string;
    assignments: ScheduleAutoFillAssignment[];
  }): Promise<ScheduleAutoFillApplyResult>;
  previewExport(input: {
    actorUserId: string;
    workspaceId: string;
    weekStart: string;
    sourceType: "published" | "draft";
    sourceDraftId: string | null;
    locationIds: string[];
  }): Promise<ScheduleExportPreview>;
  listExportPresets(
    actorUserId: string,
    workspaceId: string,
  ): Promise<{ presets: ScheduleExportPreset[] }>;
  createExportPreset(input: {
    actorUserId: string;
    workspaceId: string;
    name: string;
    settings: ScheduleExportSettings;
  }): Promise<ScheduleExportPreset>;
  updateExportPreset(input: {
    actorUserId: string;
    workspaceId: string;
    presetId: string;
    name: string;
    settings: ScheduleExportSettings;
  }): Promise<ScheduleExportPreset>;
  deleteExportPreset(
    actorUserId: string,
    workspaceId: string,
    presetId: string,
  ): Promise<void>;
  listExportSchedules(
    actorUserId: string,
    workspaceId: string,
  ): Promise<{ schedules: ScheduleExportSchedule[] }>;
  createExportSchedule(input: {
    actorUserId: string;
    workspaceId: string;
    schedule: CreateScheduleExportScheduleInput;
  }): Promise<ScheduleExportSchedule>;
  updateExportSchedule(input: {
    actorUserId: string;
    workspaceId: string;
    scheduleId: string;
    schedule: UpdateScheduleExportScheduleInput;
  }): Promise<ScheduleExportSchedule>;
  deleteExportSchedule(
    actorUserId: string,
    workspaceId: string,
    scheduleId: string,
  ): Promise<void>;
  listRecentExports(
    actorUserId: string,
    workspaceId: string,
  ): Promise<{ events: ScheduleRecentExportEvent[] }>;
  recordExport(input: {
    actorUserId: string;
    workspaceId: string;
    surface: string;
    format: string;
    params: Record<string, unknown>;
  }): Promise<ScheduleRecentExportEvent>;
  listScheduledExportCronCandidates(now: Date): Promise<{
    schedules: ScheduledExportCronCandidate[];
    /** Rows that no longer parse; the cron switches them off and says so. */
    unreadable: { id: string; workspace_id: string }[];
  }>;
  recordScheduledExportSuccess(input: {
    workspaceId: string;
    scheduleId: string;
    sentAt: Date;
    format: string;
    params: Record<string, unknown>;
  }): Promise<ScheduleExportSchedule>;
  recordScheduledExportFailure(input: {
    workspaceId: string;
    scheduleId: string;
    error: string;
    autoDisableAfter: number;
  }): Promise<ScheduleExportSchedule>;
}

export function createScheduleReadService(options: {
  readonly url: string;
  readonly serviceRoleKey: string;
}): ScheduleReadService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    async getReadModel(actorUserId, workspaceId, targetDate) {
      const { data, error } = await client.rpc(
        "get_schedule_read_model_service",
        {
          actor_user_id: actorUserId,
          target_workspace_id: workspaceId,
          target_date: targetDate,
        },
      );
      if (error) throw rpcFailure(error);
      const readModelPayload =
        typeof data === "object" && data !== null
          ? (data as Record<string, unknown>)
          : {};
      const allowedLocationIds = Array.isArray(readModelPayload.locations)
        ? readModelPayload.locations
            .map((location: unknown) =>
              typeof location === "object" &&
              location !== null &&
              "id" in location &&
              typeof location.id === "string"
                ? location.id
                : null,
            )
            .filter((id: string | null): id is string => Boolean(id))
        : [];
      const weekStart =
        "week_start" in readModelPayload &&
        typeof readModelPayload.week_start === "string"
          ? readModelPayload.week_start
          : targetDate;
      const weekEnd = addDaysIso(weekStart, 6);
      // The RPC has established the actor's scope. These independent reads
      // share that scope and need not add three sequential network waits.
      const [settingsResult, closuresResult, importantDatesResult, shortNamesResult] = await Promise.all([
        client
          .from("workspace_scheduling_settings")
          .select("time_format")
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
        allowedLocationIds.length
          ? client
            .from("schedule_closures")
            .select(
              "id,location_id,closed_date,end_date,title,is_all_day,shift_type_ids",
            )
            .in("location_id", allowedLocationIds)
            .lte("closed_date", weekEnd)
            .or(`end_date.gte.${weekStart},end_date.is.null`)
            .order("closed_date")
            .order("title")
          : Promise.resolve({ data: [], error: null }),
        client
          .from("important_dates")
          .select(
            "id,location_id,location_ids,title,type,starts_on,ends_on,recurrence",
          )
          .eq("workspace_id", workspaceId)
          .is("archived_at", null)
          // An unpublished date is hidden from the Schedule (FB-6.7).
          .eq("status", "published")
          .eq("affects_scheduling", true)
          .order("starts_on")
          .order("title"),
        allowedLocationIds.length
          ? client.from("locations").select("id,short_name")
              .eq("workspace_id", workspaceId).in("id", allowedLocationIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const { data: settings } = settingsResult;
      const { data: closures, error: closuresError } = closuresResult;
      const { data: importantDates, error: importantDatesError } = importantDatesResult;
      if (closuresError) throw rpcFailure(closuresError);
      if (importantDatesError) throw rpcFailure(importantDatesError);
      if (shortNamesResult.error) throw rpcFailure(shortNamesResult.error);
      const shortNames = new Map((shortNamesResult.data ?? []).map((location) => [location.id, location.short_name]));
      return scheduleReadModelSchema.parse({
        ...readModelPayload,
        locations: Array.isArray(readModelPayload.locations)
          ? readModelPayload.locations.map((location: Record<string, unknown>) => ({
              ...location, short_name: shortNames.get(location.id as string),
            }))
          : [],
        settings: {
          time_format:
            settings?.time_format === "24h" || settings?.time_format === "12h"
              ? settings.time_format
              : "12h",
        },
        closures: closures ?? [],
        important_dates: (importantDates ?? [])
          .flatMap((date) => {
            // Preserve the per-location schedule contract without duplicating stored dates.
            const locationIds: string[] =
              date.location_ids ?? (date.location_id ? [date.location_id] : []);
            return locationIds.length
              ? locationIds
                  .filter((id) => allowedLocationIds.includes(id))
                  .map((location_id) => ({ ...date, location_id }))
              : [date];
          })
          .filter((date) =>
            importantDateTouchesRange(date, weekStart, weekEnd),
          ),
      });
    },
    async listDrafts(actorUserId, workspaceId, weekStart) {
      const { data, error } = await client.rpc("list_schedule_drafts_service", {
        actor_user_id: actorUserId,
        target_workspace_id: workspaceId,
        target_week_start: weekStart,
      });
      if (error) throw rpcFailure(error);
      return scheduleDraftListSchema.parse(data);
    },
    async listWeeklyShifts(input) {
      const { data, error } = await client.rpc(
        "list_schedule_weekly_shifts_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_week_start: input.weekStart,
          target_location_ids: input.locationIds ?? null,
          target_draft_id: input.draftId ?? null,
          include_live_context: input.includeLive ?? false,
        },
      );
      if (error) throw rpcFailure(error);
      return legacyScheduleShiftListSchema.parse(data);
    },
    async acquireSession(input) {
      const { data, error } = await client.rpc(
        "acquire_schedule_edit_session_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_week_start: input.weekStart,
          requested_source: input.sourceKind,
          requested_draft_id: input.sourceDraftId,
          target_location_ids: input.locationIds ?? null,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleEditAcquireResultSchema.parse(data);
    },
    async heartbeat(actorUserId, workspaceId, sessionId) {
      const { data, error } = await client.rpc(
        "heartbeat_schedule_edit_session_service",
        {
          actor_user_id: actorUserId,
          target_workspace_id: workspaceId,
          target_session_id: sessionId,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleEditSessionSchema.parse(data);
    },
    async mutateShift(input) {
      const { data, error } = await client.rpc(
        "mutate_schedule_edit_shift_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_session_id: input.sessionId,
          expected_session_revision: input.expectedSessionRevision,
          operation: input.operation,
          target_shift_id: input.shiftId,
          expected_shift_revision: input.expectedShiftRevision,
          shift_payload: input.shift,
          request_idempotency_key: input.idempotencyKey,
        },
      );
      if (error)
        throw rpcFailure(error);
      const session = scheduleEditSessionSchema.parse(data);
      await broadcastScheduleInvalidation(client, {
        workspace_id: input.workspaceId,
        actor_user_id: input.actorUserId,
        week_start: session.week_start,
        location_ids: scheduleSessionLocationIds(session),
        draft_id: session.source_draft_id,
        targets: ["draft_shifts", "pending_ops", "edit_lock"],
        changed_shift_ids: [input.shiftId],
      });
      return session;
    },
    async createShiftsBatch(input) {
      const { data, error } = await client.rpc("create_schedule_shifts_batch_service", {
        actor: input.actorUserId, w: input.workspaceId, sid: input.sessionId,
        expected_revision: input.expectedSessionRevision, shifts: input.shifts,
        request_key: input.idempotencyKey,
      });
      if (error) throw rpcFailure(error);
      const session = scheduleEditSessionSchema.parse(data);
      await broadcastScheduleInvalidation(client, {
        workspace_id: input.workspaceId, actor_user_id: input.actorUserId,
        week_start: session.week_start, location_ids: scheduleSessionLocationIds(session),
        draft_id: session.source_draft_id, targets: ["draft_shifts", "pending_ops", "edit_lock"],
      });
      return session;
    },
    async bulkDeleteShifts(input) {
      const { data, error } = await client.rpc(
        "bulk_delete_schedule_edit_shifts_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_shift_ids: input.shiftIds,
        },
      );
      if (error) throw rpcFailure(error);
      const result = scheduleBulkDeleteResultSchema.parse(data);
      await broadcastScheduleInvalidation(client, {
        workspace_id: input.workspaceId,
        actor_user_id: input.actorUserId,
        week_start: result.session?.week_start,
        location_ids: result.session
          ? scheduleSessionLocationIds(result.session)
          : undefined,
        draft_id: result.session?.source_draft_id,
        targets: ["draft_shifts", "pending_ops", "edit_lock"],
        changed_shift_ids: input.shiftIds,
      });
      return result;
    },
    async previewDefaultHours(input) {
      const { data, error } = await client.rpc(
        "preview_schedule_default_hours_service",
        {
          actor: input.actorUserId,
          w: input.workspaceId,
          sid: input.sessionId,
          command: input.command,
        },
      );
      if (error)
        throw rpcFailure(error);
      return scheduleDefaultHoursPreviewSchema.parse(data);
    },
    async applyDefaultHours(input) {
      const { data, error } = await client.rpc(
        "apply_schedule_default_hours_service",
        {
          actor: input.actorUserId,
          w: input.workspaceId,
          sid: input.sessionId,
          command: input.command,
        },
      );
      if (error)
        throw rpcFailure(error);
      const session = scheduleEditSessionSchema.parse(data);
      await broadcastScheduleInvalidation(client, {
        workspace_id: input.workspaceId,
        actor_user_id: input.actorUserId,
        week_start: session.week_start,
        location_ids: scheduleSessionLocationIds(session),
        draft_id: session.source_draft_id,
        targets: ["draft_shifts", "pending_ops", "edit_lock"],
        changed_shift_ids: input.command.shift_ids,
      });
      return session;
    },
    async saveSession(input) {
      const { data, error } = await client.rpc(
        "save_schedule_edit_session_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_session_id: input.sessionId,
          expected_session_revision: input.expectedSessionRevision,
          target_name: input.name,
          target_draft_id: input.draftId,
          expected_draft_revision: input.expectedDraftRevision,
          acknowledge_past_edits: input.acknowledgePastEdits ?? false,
        },
      );
      if (error) throw rpcFailure(error);
      const draft = scheduleDraftSummarySchema.parse(data);
      await broadcastScheduleInvalidation(client, {
        workspace_id: input.workspaceId,
        actor_user_id: input.actorUserId,
        week_start: draft.week_start,
        draft_id: draft.id,
        targets: ["drafts", "draft_shifts", "pending_ops"],
      });
      return draft;
    },
    async discardSession(actorUserId, workspaceId, sessionId) {
      const { error } = await client.rpc(
        "discard_schedule_edit_session_service",
        {
          actor_user_id: actorUserId,
          target_workspace_id: workspaceId,
          target_session_id: sessionId,
        },
      );
      if (error) throw rpcFailure(error);
    },
    async deleteDraft(actorUserId, workspaceId, draftId) {
      const { data, error } = await client.rpc(
        "delete_schedule_draft_service",
        {
          actor_user_id: actorUserId,
          target_workspace_id: workspaceId,
          target_draft_id: draftId,
        },
      );
      if (error) throw rpcFailure(error);
      const result = scheduleDraftDeleteResultSchema.parse(data);
      await broadcastScheduleInvalidation(client, {
        workspace_id: workspaceId,
        actor_user_id: actorUserId,
        draft_id: result.draft_id,
        targets: ["drafts", "draft_shifts", "pending_ops"],
      });
      return result;
    },
    async listDraftAvailabilityConflicts(
      actorUserId,
      workspaceId,
      draftId,
      weekStart,
    ) {
      const { data, error } = await client.rpc(
        "list_schedule_draft_availability_conflicts_service",
        {
          actor_user_id: actorUserId,
          target_workspace_id: workspaceId,
          target_draft_id: draftId,
          target_week_start: weekStart,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleAvailabilityConflictResultSchema.parse(data);
    },
    async listPendingOps(input) {
      const { data, error } = await client.rpc(
        "list_schedule_pending_ops_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_week_start: input.weekStart,
          target_location_ids: input.locationIds ?? null,
          target_draft_id: input.draftId ?? null,
        },
      );
      if (error) throw rpcFailure(error);
      return schedulePendingOpListSchema.parse(data);
    },
    async addPendingOp(input) {
      const { data, error } = await client.rpc(
        "add_schedule_pending_op_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_session_id: input.pendingOp.lock_id,
          target_op_type: input.pendingOp.op_type,
          target_shift_id: input.pendingOp.target_shift_id ?? null,
          target_payload: input.pendingOp.payload,
        },
      );
      if (error) throw rpcFailure(error);
      const result = schedulePendingOpMutationResultSchema.parse(data);
      await broadcastScheduleInvalidation(client, {
        workspace_id: input.workspaceId,
        actor_user_id: input.actorUserId,
        location_ids: pendingOpLocationIds(input.pendingOp.payload),
        targets: ["pending_ops", "draft_shifts"],
        changed_shift_ids: input.pendingOp.target_shift_id
          ? [input.pendingOp.target_shift_id]
          : undefined,
      });
      return result;
    },
    async updatePendingOp(input) {
      const { data, error } = await client.rpc(
        "update_schedule_pending_op_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_op_id: input.opId,
          target_payload: input.pendingOp.payload,
        },
      );
      if (error) throw rpcFailure(error);
      const result = schedulePendingOpMutationResultSchema.parse(data);
      await broadcastScheduleInvalidation(client, {
        workspace_id: input.workspaceId,
        actor_user_id: input.actorUserId,
        location_ids: pendingOpLocationIds(input.pendingOp.payload),
        targets: ["pending_ops", "draft_shifts"],
        changed_shift_ids: [input.opId],
      });
      return result;
    },
    async removePendingOp(input) {
      const { data, error } = await client.rpc(
        "remove_schedule_pending_op_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_op_id: input.opId,
        },
      );
      if (error) throw rpcFailure(error);
      const result = schedulePendingOpMutationResultSchema.parse(data);
      await broadcastScheduleInvalidation(client, {
        workspace_id: input.workspaceId,
        actor_user_id: input.actorUserId,
        targets: ["pending_ops", "draft_shifts"],
        changed_shift_ids: [input.opId],
      });
      return result;
    },
    async getPublicationStatus(actorUserId, workspaceId, weekStart) {
      const { data, error } = await client.rpc(
        "get_schedule_publication_status_service",
        {
          actor_user_id: actorUserId,
          target_workspace_id: workspaceId,
          target_week_start: weekStart,
        },
      );
      if (error) throw rpcFailure(error);
      return schedulePublicationStatusSchema.parse(data);
    },
    async previewPublication(input) {
      const { data, error } = await client.rpc(
        "preview_schedule_publication_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_draft_id: input.draftId,
          target_location_ids: input.locationIds,
          target_department_ids: input.departmentIds ?? null,
          include_no_department: input.includeNoDepartment ?? true,
        },
      );
      if (error) throw rpcFailure(error);
      return schedulePublicationPreviewSchema.parse(data);
    },
    async publish(input) {
      const { data, error } = await client.rpc(
        "publish_schedule_draft_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_draft_id: input.draftId,
          target_location_ids: input.locationIds,
          target_department_ids: input.departmentIds ?? null,
          include_no_department: input.includeNoDepartment ?? true,
          expected_draft_revision: input.expectedDraftRevision,
          expected_fingerprint: input.fingerprint,
          override_decisions: input.preflightAck?.decisions ?? input.overrides,
          target_notify_employee_ids: input.notifyEmployeeIds?.length
            ? input.notifyEmployeeIds
            : null,
        },
      );
      if (error) {
        const conflicts = await recoverDocumentPublicationConflicts(
          client,
          input,
          error,
        );
        if (conflicts) return conflicts;
        if (["40001", "PT409"].includes(error.code) && error.message === "stale publication preview") {
          const refreshed = await client.rpc("preview_schedule_publication_service", {
            actor_user_id: input.actorUserId, target_workspace_id: input.workspaceId,
            target_draft_id: input.draftId, target_location_ids: input.locationIds,
            target_department_ids: input.departmentIds ?? null,
            include_no_department: input.includeNoDepartment ?? true,
          });
          if (refreshed.error) throw rpcFailure(refreshed.error);
          return { status: "preflight", preflight: schedulePublicationPreviewSchema.parse(refreshed.data), preflight_block_reason: "stale_fingerprint" };
        }
        throw rpcFailure(error);
      }
      const result = schedulePublishResultSchema.parse(data);
      if (result.status !== "published") return result;
      await broadcastScheduleInvalidation(client, {
        workspace_id: input.workspaceId,
        actor_user_id: input.actorUserId,
        week_start: result.week_start,
        location_ids: result.location_ids,
        draft_id: result.draft_id,
        targets: [
          "published_shifts",
          "drafts",
          "pending_ops",
          "employee_my_schedule",
        ],
      });
      return result;
    },
    async previewUnpublish(input) {
      const { data, error } = await client.rpc(
        "preview_schedule_unpublication_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_week_start: input.weekStart,
          target_location_ids: input.locationIds,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleUnpublishPreviewSchema.parse(data);
    },
    async unpublish(input) {
      const { data, error } = await client.rpc("unpublish_schedule_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_week_start: input.weekStart,
        target_location_ids: input.locationIds,
        expected_fingerprint: input.fingerprint,
      });
      if (error) throw rpcFailure(error);
      const result = scheduleUnpublishResultSchema.parse(data);
      await broadcastScheduleInvalidation(client, {
        workspace_id: input.workspaceId,
        actor_user_id: input.actorUserId,
        week_start: result.week_start,
        location_ids: result.location_ids,
        targets: ["published_shifts", "employee_my_schedule"],
      });
      return result;
    },
    async getPublicationHistory(actorUserId, workspaceId, weekStart) {
      const { data, error } = await client.rpc(
        "get_schedule_publication_history_service",
        {
          actor_user_id: actorUserId,
          target_workspace_id: workspaceId,
          target_week_start: weekStart,
        },
      );
      if (error) throw rpcFailure(error);
      return schedulePublicationHistorySchema.parse(data);
    },
    async listTemplates(actorUserId, workspaceId) {
      const { data, error } = await client.rpc(
        "list_schedule_templates_service",
        { actor_user_id: actorUserId, target_workspace_id: workspaceId },
      );
      if (error) throw rpcFailure(error);
      return scheduleTemplateListSchema.parse(data);
    },
    async getTemplate(actorUserId, workspaceId, templateId) {
      const { data, error } = await client.rpc(
        "get_schedule_template_service",
        {
          actor_user_id: actorUserId,
          target_workspace_id: workspaceId,
          target_template_id: templateId,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleTemplateDetailSchema.parse(data);
    },
    async createTemplate(input) {
      const { data, error } = await client.rpc(
        "create_schedule_template_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_draft_id: input.draftId,
          target_name: input.name,
          strip_assignments: input.stripAssignments,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleTemplateDetailSchema.parse(data);
    },
    async renameTemplate(input) {
      const { data, error } = await client.rpc(
        "rename_schedule_template_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_template_id: input.templateId,
          target_name: input.name,
          expected_revision: input.expectedRevision,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleTemplateDetailSchema.parse(data);
    },
    async deleteTemplate(input) {
      const { error } = await client.rpc("delete_schedule_template_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_template_id: input.templateId,
        expected_revision: input.expectedRevision,
      });
      if (error) throw rpcFailure(error);
    },
    async applyTemplate(input) {
      const { data, error } = await client.rpc(
        "apply_schedule_template_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_session_id: input.sessionId,
          expected_session_revision: input.expectedSessionRevision,
          target_template_id: input.templateId,
          apply_mode: input.mode,
          department_keys: input.departmentKeys,
        },
      );
      if (error) throw rpcFailure(error);
      const result = scheduleTemplateApplyResultSchema.parse(data);
      await broadcastScheduleInvalidation(client, {
        workspace_id: input.workspaceId,
        actor_user_id: input.actorUserId,
        week_start: result.session.week_start,
        location_ids: scheduleSessionLocationIds(result.session),
        draft_id: result.session.source_draft_id,
        targets: ["draft_shifts", "pending_ops", "edit_lock"],
      });
      return result;
    },
    async previewAutoFill(actorUserId, workspaceId, sessionId) {
      const { data, error } = await client.rpc(
        "preview_schedule_auto_fill_service",
        {
          actor_user_id: actorUserId,
          target_workspace_id: workspaceId,
          target_session_id: sessionId,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleAutoFillPreviewSchema.parse(data);
    },
    async applyAutoFill(input) {
      const { data, error } = await client.rpc(
        "apply_schedule_auto_fill_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_session_id: input.sessionId,
          expected_session_revision: input.expectedSessionRevision,
          expected_fingerprint: input.fingerprint,
          assignments: input.assignments,
        },
      );
      if (error) throw rpcFailure(error);
      const result = scheduleAutoFillApplyResultSchema.parse(data);
      await broadcastScheduleInvalidation(client, {
        workspace_id: input.workspaceId,
        actor_user_id: input.actorUserId,
        week_start: result.session.week_start,
        location_ids: scheduleSessionLocationIds(result.session),
        draft_id: result.session.source_draft_id,
        targets: ["draft_shifts", "pending_ops", "edit_lock"],
        changed_shift_ids: result.applied.map(
          (assignment) => assignment.shift_id,
        ),
      });
      return result;
    },
    async previewExport(input) {
      const { data, error } = await client.rpc(
        "preview_schedule_export_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_week_start: input.weekStart,
          source_type: input.sourceType,
          source_draft_id: input.sourceDraftId,
          target_location_ids: input.locationIds,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleExportPreviewSchema.parse(data);
    },
    async listExportPresets(actorUserId, workspaceId) {
      const { data, error } = await client.rpc(
        "list_schedule_export_presets_service",
        { actor_user_id: actorUserId, target_workspace_id: workspaceId },
      );
      if (error) throw rpcFailure(error);
      return scheduleExportPresetListSchema.parse(data);
    },
    async createExportPreset(input) {
      const { data, error } = await client.rpc(
        "create_schedule_export_preset_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_name: input.name,
          target_settings: input.settings,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleExportPresetSchema.parse(data);
    },
    async updateExportPreset(input) {
      const { data, error } = await client.rpc(
        "update_schedule_export_preset_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_preset_id: input.presetId,
          target_name: input.name,
          target_settings: input.settings,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleExportPresetSchema.parse(data);
    },
    async deleteExportPreset(actorUserId, workspaceId, presetId) {
      const { error } = await client.rpc(
        "delete_schedule_export_preset_service",
        {
          actor_user_id: actorUserId,
          target_workspace_id: workspaceId,
          target_preset_id: presetId,
        },
      );
      if (error) throw rpcFailure(error);
    },
    async listExportSchedules(actorUserId, workspaceId) {
      const { data, error } = await client.rpc(
        "list_schedule_export_schedules_service",
        { actor_user_id: actorUserId, target_workspace_id: workspaceId },
      );
      if (error) throw rpcFailure(error);
      return scheduleExportScheduleListSchema.parse(data);
    },
    async createExportSchedule(input) {
      const { data, error } = await client.rpc(
        "create_schedule_export_schedule_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_payload: input.schedule,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleExportScheduleSchema.parse(data);
    },
    async updateExportSchedule(input) {
      const { data, error } = await client.rpc(
        "update_schedule_export_schedule_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_schedule_id: input.scheduleId,
          target_payload: input.schedule,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleExportScheduleSchema.parse(data);
    },
    async deleteExportSchedule(actorUserId, workspaceId, scheduleId) {
      const { error } = await client.rpc(
        "delete_schedule_export_schedule_service",
        {
          actor_user_id: actorUserId,
          target_workspace_id: workspaceId,
          target_schedule_id: scheduleId,
        },
      );
      if (error) throw rpcFailure(error);
    },
    async listRecentExports(actorUserId, workspaceId) {
      const { data, error } = await client.rpc(
        "list_schedule_export_events_service",
        { actor_user_id: actorUserId, target_workspace_id: workspaceId },
      );
      if (error) throw rpcFailure(error);
      return scheduleRecentExportEventListSchema.parse(data);
    },
    async recordExport(input) {
      const { data, error } = await client.rpc(
        "record_schedule_export_event_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_surface: input.surface,
          target_format: input.format,
          target_params: input.params,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleRecentExportEventSchema.parse(data);
    },
    async listScheduledExportCronCandidates(now) {
      const { data, error } = await client.rpc(
        "list_schedule_export_cron_candidates_service",
        { target_now: now.toISOString() },
      );
      if (error) throw rpcFailure(error);
      const schedules: ScheduledExportCronCandidate[] = [];
      const unreadable: { id: string; workspace_id: string }[] = [];
      // Row by row: one workspace's broken row must not stop the others (BL-272).
      for (const row of scheduledExportCronCandidateListSchema.parse(data).schedules) {
        const candidate = scheduledExportCronCandidateSchema.safeParse(row);
        if (candidate.success) {
          schedules.push(candidate.data);
          continue;
        }
        // ponytail: a row without its own ids cannot exist (primary key), so it is not recorded.
        const identity = scheduledExportCronIdentitySchema.safeParse(row);
        if (identity.success) unreadable.push(identity.data);
      }
      return { schedules, unreadable };
    },
    async recordScheduledExportSuccess(input) {
      const { data, error } = await client.rpc(
        "record_schedule_export_schedule_success_service",
        {
          target_workspace_id: input.workspaceId,
          target_schedule_id: input.scheduleId,
          target_sent_at: input.sentAt.toISOString(),
          target_format: input.format,
          target_params: input.params,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleExportScheduleSchema.parse(data);
    },
    async recordScheduledExportFailure(input) {
      const { data, error } = await client.rpc(
        "record_schedule_export_schedule_failure_service",
        {
          target_workspace_id: input.workspaceId,
          target_schedule_id: input.scheduleId,
          target_error: input.error,
          auto_disable_after: input.autoDisableAfter,
        },
      );
      if (error) throw rpcFailure(error);
      return scheduleExportScheduleSchema.parse(data);
    },
  };
}

async function recoverDocumentPublicationConflicts(
  client: SupabaseClient,
  input: Parameters<ScheduleReadService["publish"]>[0],
  error: { readonly message?: string },
): Promise<SchedulePublishResult | null> {
  if (!error.message?.includes("schedule has hard document blockers")) {
    return null;
  }
  if (!input.weekStart) return null;
  const { data, error: conflictError } = await client.rpc(
    "list_schedule_draft_document_conflicts_service",
    {
      actor_user_id: input.actorUserId,
      target_workspace_id: input.workspaceId,
      target_draft_id: input.draftId,
      target_week_start: input.weekStart,
      target_location_ids: input.locationIds,
      target_department_ids: input.departmentIds ?? null,
      include_no_department: input.includeNoDepartment ?? true,
    },
  );
  if (conflictError) throw rpcFailure(conflictError);
  const preview = scheduleDraftDocumentConflictPreviewSchema.parse(data);
  if (!preview.conflicts.length) return null;
  return schedulePublishResultSchema.parse({
    status: "schedule_conflicts",
    schedule_conflicts: preview.conflicts,
  });
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function broadcastScheduleInvalidation(
  client: SupabaseClient,
  payload: ScheduleInvalidationPayload,
): Promise<void> {
  // Private: only readers of this workspace's schedule receive it.
  const channel = client.channel(
    `schedule:invalidation:${payload.workspace_id}`,
    { config: { private: true } },
  );
  try {
    await channel.send({
      type: "broadcast",
      event: "schedule_invalidation",
      payload: {
        kind: "schedule_invalidation",
        ...removeUndefinedFields(payload),
      },
    });
  } catch {
    // Realtime is advisory; the write already succeeded and HTTP clients still refetch.
  } finally {
    await client.removeChannel(channel).catch(() => undefined);
  }
}

function scheduleSessionLocationIds(
  session: ScheduleEditSession,
): readonly string[] {
  return session.location_ids;
}

function pendingOpLocationIds(
  payload: CreateSchedulePendingOpInput["payload"],
): readonly string[] | undefined {
  return typeof payload.location_id === "string" && payload.location_id
    ? [payload.location_id]
    : undefined;
}

function removeUndefinedFields(input: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function importantDateTouchesRange(
  importantDate: {
    readonly starts_on: string;
    readonly ends_on: string;
    readonly recurrence?: string | null;
  },
  start: string,
  end: string,
): boolean {
  if (importantDate.recurrence === "annual") {
    return datesInRange(start, end).some((date) =>
      annualDateCoversDate(
        importantDate.starts_on,
        importantDate.ends_on,
        date,
      ),
    );
  }
  return importantDate.starts_on <= end && start <= importantDate.ends_on;
}

function annualDateCoversDate(
  start: string,
  end: string,
  date: string,
): boolean {
  const target = monthDayNumber(date);
  const startMonthDay = monthDayNumber(start);
  const endMonthDay = monthDayNumber(end);
  if (startMonthDay <= endMonthDay) {
    return startMonthDay <= target && target <= endMonthDay;
  }
  return target >= startMonthDay || target <= endMonthDay;
}

function monthDayNumber(iso: string): number {
  return Number(iso.slice(5, 7)) * 100 + Number(iso.slice(8, 10));
}

function datesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00.000Z`);
  const last = new Date(`${end}T12:00:00.000Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
