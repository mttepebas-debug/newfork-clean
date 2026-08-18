import {
  scheduleDraftListSchema,
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
  scheduleTemplateApplyResultSchema,
  scheduleTemplateDetailSchema,
  scheduleTemplateListSchema,
  type ScheduleDraftList,
  type ScheduleDraftSummary,
  type ScheduleEditAcquireResult,
  type ScheduleEditSession,
  type ScheduleEditSource,
  type SchedulePublicationOverrideInput,
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
  type ScheduleExportSettings,
  type ScheduleTemplateApplyResult,
  type ScheduleTemplateDetail,
  type ScheduleTemplateList,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";

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
  acquireSession(input: {
    actorUserId: string;
    workspaceId: string;
    weekStart: string;
    sourceKind: ScheduleEditSource;
    sourceDraftId: string | null;
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
    operation: "create" | "update" | "delete";
    shiftId: string;
    expectedShiftRevision?: number;
    shift?: ScheduleShiftMutationInput;
    idempotencyKey?: string;
  }): Promise<ScheduleEditSession>;
  saveSession(input: {
    actorUserId: string;
    workspaceId: string;
    sessionId: string;
    expectedSessionRevision: number;
    name: string;
    draftId: string | null;
    expectedDraftRevision: number | null;
  }): Promise<ScheduleDraftSummary>;
  discardSession(
    actorUserId: string,
    workspaceId: string,
    sessionId: string,
  ): Promise<void>;
  previewPublication(input: {
    actorUserId: string;
    workspaceId: string;
    draftId: string;
    locationIds: string[];
  }): Promise<SchedulePublicationPreview>;
  publish(input: {
    actorUserId: string;
    workspaceId: string;
    draftId: string;
    locationIds: string[];
    expectedDraftRevision: number;
    fingerprint: string;
    overrides: SchedulePublicationOverrideInput[];
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
  deleteExportPreset(
    actorUserId: string,
    workspaceId: string,
    presetId: string,
  ): Promise<void>;
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
      if (error) throw new Error(error.message);
      return scheduleReadModelSchema.parse(data);
    },
    async listDrafts(actorUserId, workspaceId, weekStart) {
      const { data, error } = await client.rpc("list_schedule_drafts_service", {
        actor_user_id: actorUserId,
        target_workspace_id: workspaceId,
        target_week_start: weekStart,
      });
      if (error) throw new Error(error.message);
      return scheduleDraftListSchema.parse(data);
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
        },
      );
      if (error) throw new Error(error.message);
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
      if (error) throw new Error(error.message);
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
      if (error) throw new Error(error.message);
      return scheduleEditSessionSchema.parse(data);
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
        },
      );
      if (error) throw new Error(error.message);
      return scheduleDraftSummarySchema.parse(data);
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
      if (error) throw new Error(error.message);
    },
    async previewPublication(input) {
      const { data, error } = await client.rpc(
        "preview_schedule_publication_service",
        {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_draft_id: input.draftId,
          target_location_ids: input.locationIds,
        },
      );
      if (error) throw new Error(error.message);
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
          expected_draft_revision: input.expectedDraftRevision,
          expected_fingerprint: input.fingerprint,
          override_decisions: input.overrides,
        },
      );
      if (error) throw new Error(error.message);
      return schedulePublishResultSchema.parse(data);
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
      if (error) throw new Error(error.message);
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
      if (error) throw new Error(error.message);
      return scheduleUnpublishResultSchema.parse(data);
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
      if (error) throw new Error(error.message);
      return schedulePublicationHistorySchema.parse(data);
    },
    async listTemplates(actorUserId, workspaceId) {
      const { data, error } = await client.rpc(
        "list_schedule_templates_service",
        { actor_user_id: actorUserId, target_workspace_id: workspaceId },
      );
      if (error) throw new Error(error.message);
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
      if (error) throw new Error(error.message);
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
      if (error) throw new Error(error.message);
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
      if (error) throw new Error(error.message);
      return scheduleTemplateDetailSchema.parse(data);
    },
    async deleteTemplate(input) {
      const { error } = await client.rpc("delete_schedule_template_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_template_id: input.templateId,
        expected_revision: input.expectedRevision,
      });
      if (error) throw new Error(error.message);
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
        },
      );
      if (error) throw new Error(error.message);
      return scheduleTemplateApplyResultSchema.parse(data);
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
      if (error) throw new Error(error.message);
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
      if (error) throw new Error(error.message);
      return scheduleAutoFillApplyResultSchema.parse(data);
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
      if (error) throw new Error(error.message);
      return scheduleExportPreviewSchema.parse(data);
    },
    async listExportPresets(actorUserId, workspaceId) {
      const { data, error } = await client.rpc(
        "list_schedule_export_presets_service",
        { actor_user_id: actorUserId, target_workspace_id: workspaceId },
      );
      if (error) throw new Error(error.message);
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
      if (error) throw new Error(error.message);
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
      if (error) throw new Error(error.message);
    },
  };
}
