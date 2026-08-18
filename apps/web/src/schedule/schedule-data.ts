import {
  scheduleDraftListSchema,
  scheduleDraftSummarySchema,
  scheduleEditAcquireResultSchema,
  scheduleEditSessionSchema,
  scheduleAutoFillApplyResultSchema,
  scheduleAutoFillPreviewSchema,
  scheduleExportPresetListSchema,
  scheduleExportPresetSchema,
  scheduleExportPreviewSchema,
  scheduleTemplateApplyResultSchema,
  scheduleTemplateDetailSchema,
  scheduleTemplateListSchema,
  schedulePublicationPreviewSchema,
  schedulePublishResultSchema,
  scheduleReadModelSchema,
  scheduleUnpublishPreviewSchema,
  scheduleUnpublishResultSchema,
  type ScheduleDraftList,
  type ScheduleDraftSummary,
  type ScheduleEditAcquireResult,
  type ScheduleEditSession,
  type ScheduleAutoFillApplyResult,
  type ScheduleAutoFillAssignment,
  type ScheduleAutoFillPreview,
  type ScheduleExportPreset,
  type ScheduleExportPreview,
  type ScheduleExportRequest,
  type ScheduleExportSettings,
  type ScheduleTemplateApplyResult,
  type ScheduleTemplateDetail,
  type ScheduleTemplateList,
  type ScheduleEditSource,
  type SchedulePublicationOverrideInput,
  type SchedulePublicationPreview,
  type SchedulePublishResult,
  type ScheduleReadModel,
  type ScheduleShiftMutationInput,
  type ScheduleView,
  type ScheduleUnpublishPreview,
  type ScheduleUnpublishResult,
} from "@newfork/shared";
import { supabaseClient } from "../lib/supabase";

export async function getScheduleReadModel(
  workspaceId: string,
  date: string,
  view: ScheduleView,
): Promise<ScheduleReadModel> {
  const query = new URLSearchParams({ date, view });
  return scheduleReadModelSchema.parse(
    await scheduleRequest(workspaceId, `/schedule?${query}`),
  );
}

export async function listScheduleDrafts(
  workspaceId: string,
  weekStart: string,
): Promise<ScheduleDraftList> {
  const query = new URLSearchParams({ week_start: weekStart });
  return scheduleDraftListSchema.parse(
    await scheduleRequest(workspaceId, `/schedule/drafts?${query}`),
  );
}

export async function acquireScheduleEditSession(
  workspaceId: string,
  weekStart: string,
  sourceKind: ScheduleEditSource,
  sourceDraftId: string | null = null,
): Promise<ScheduleEditAcquireResult> {
  return scheduleEditAcquireResultSchema.parse(
    await scheduleRequest(workspaceId, "/schedule/edit-sessions", {
      method: "POST",
      body: JSON.stringify({
        week_start: weekStart,
        source_kind: sourceKind,
        source_draft_id: sourceDraftId,
      }),
    }),
  );
}

export async function heartbeatScheduleEditSession(
  workspaceId: string,
  sessionId: string,
): Promise<ScheduleEditSession> {
  return scheduleEditSessionSchema.parse(
    await scheduleRequest(
      workspaceId,
      `/schedule/edit-sessions/${sessionId}/heartbeat`,
      { method: "PATCH" },
    ),
  );
}

export async function createScheduleShift(
  workspaceId: string,
  session: ScheduleEditSession,
  shift: ScheduleShiftMutationInput,
): Promise<ScheduleEditSession> {
  return scheduleEditSessionSchema.parse(
    await scheduleRequest(
      workspaceId,
      `/schedule/edit-sessions/${session.id}/shifts`,
      {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          expected_session_revision: session.revision,
          shift,
        }),
      },
    ),
  );
}

export async function updateScheduleShift(
  workspaceId: string,
  session: ScheduleEditSession,
  shiftId: string,
  expectedShiftRevision: number,
  shift: ScheduleShiftMutationInput,
): Promise<ScheduleEditSession> {
  return scheduleEditSessionSchema.parse(
    await scheduleRequest(
      workspaceId,
      `/schedule/edit-sessions/${session.id}/shifts/${shiftId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          expected_session_revision: session.revision,
          expected_shift_revision: expectedShiftRevision,
          shift,
        }),
      },
    ),
  );
}

export async function deleteScheduleShift(
  workspaceId: string,
  session: ScheduleEditSession,
  shiftId: string,
  expectedShiftRevision: number,
): Promise<ScheduleEditSession> {
  return scheduleEditSessionSchema.parse(
    await scheduleRequest(
      workspaceId,
      `/schedule/edit-sessions/${session.id}/shifts/${shiftId}`,
      {
        method: "DELETE",
        body: JSON.stringify({
          expected_session_revision: session.revision,
          expected_shift_revision: expectedShiftRevision,
        }),
      },
    ),
  );
}

export async function saveScheduleDraft(
  workspaceId: string,
  session: ScheduleEditSession,
  name: string,
  draft: ScheduleDraftSummary | null,
): Promise<ScheduleDraftSummary> {
  return scheduleDraftSummarySchema.parse(
    await scheduleRequest(
      workspaceId,
      `/schedule/edit-sessions/${session.id}/save`,
      {
        method: "POST",
        body: JSON.stringify({
          expected_session_revision: session.revision,
          name,
          draft_id: draft?.id ?? null,
          expected_draft_revision: draft?.revision ?? null,
        }),
      },
    ),
  );
}

export async function discardScheduleEditSession(
  workspaceId: string,
  sessionId: string,
): Promise<void> {
  await scheduleRequest(workspaceId, `/schedule/edit-sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function previewSchedulePublication(
  workspaceId: string,
  draftId: string,
  locationIds: string[],
): Promise<SchedulePublicationPreview> {
  return schedulePublicationPreviewSchema.parse(
    await scheduleRequest(workspaceId, "/schedule/publication-preview", {
      method: "POST",
      body: JSON.stringify({ draft_id: draftId, location_ids: locationIds }),
    }),
  );
}

export async function publishScheduleDraft(
  workspaceId: string,
  preview: SchedulePublicationPreview,
  overrides: SchedulePublicationOverrideInput[],
): Promise<SchedulePublishResult> {
  return schedulePublishResultSchema.parse(
    await scheduleRequest(workspaceId, "/schedule/publications", {
      method: "POST",
      body: JSON.stringify({
        draft_id: preview.draft_id,
        location_ids: preview.locations.map((location) => location.location_id),
        expected_draft_revision: preview.draft_revision,
        fingerprint: preview.fingerprint,
        overrides,
      }),
    }),
  );
}

export async function previewScheduleUnpublish(
  workspaceId: string,
  weekStart: string,
  locationIds: string[],
): Promise<ScheduleUnpublishPreview> {
  return scheduleUnpublishPreviewSchema.parse(
    await scheduleRequest(workspaceId, "/schedule/unpublish-preview", {
      method: "POST",
      body: JSON.stringify({
        week_start: weekStart,
        location_ids: locationIds,
      }),
    }),
  );
}

export async function unpublishSchedule(
  workspaceId: string,
  preview: ScheduleUnpublishPreview,
): Promise<ScheduleUnpublishResult> {
  return scheduleUnpublishResultSchema.parse(
    await scheduleRequest(workspaceId, "/schedule/unpublications", {
      method: "POST",
      body: JSON.stringify({
        week_start: preview.week_start,
        location_ids: preview.locations.map((location) => location.location_id),
        fingerprint: preview.fingerprint,
      }),
    }),
  );
}

export async function listScheduleTemplates(
  workspaceId: string,
): Promise<ScheduleTemplateList> {
  return scheduleTemplateListSchema.parse(
    await scheduleRequest(workspaceId, "/schedule/templates"),
  );
}

export async function createScheduleTemplate(
  workspaceId: string,
  draftId: string,
  name: string,
  stripAssignments: boolean,
): Promise<ScheduleTemplateDetail> {
  return scheduleTemplateDetailSchema.parse(
    await scheduleRequest(workspaceId, "/schedule/templates", {
      method: "POST",
      body: JSON.stringify({
        draft_id: draftId,
        name,
        strip_assignments: stripAssignments,
      }),
    }),
  );
}

export async function renameScheduleTemplate(
  workspaceId: string,
  templateId: string,
  name: string,
  expectedRevision: number,
): Promise<ScheduleTemplateDetail> {
  return scheduleTemplateDetailSchema.parse(
    await scheduleRequest(workspaceId, `/schedule/templates/${templateId}`, {
      method: "PATCH",
      body: JSON.stringify({ name, expected_revision: expectedRevision }),
    }),
  );
}

export async function deleteScheduleTemplate(
  workspaceId: string,
  templateId: string,
  expectedRevision: number,
): Promise<void> {
  await scheduleRequest(workspaceId, `/schedule/templates/${templateId}`, {
    method: "DELETE",
    body: JSON.stringify({ expected_revision: expectedRevision }),
  });
}

export async function applyScheduleTemplate(
  workspaceId: string,
  session: ScheduleEditSession,
  templateId: string,
  mode: "merge" | "overwrite",
): Promise<ScheduleTemplateApplyResult> {
  return scheduleTemplateApplyResultSchema.parse(
    await scheduleRequest(
      workspaceId,
      `/schedule/edit-sessions/${session.id}/apply-template`,
      {
        method: "POST",
        body: JSON.stringify({
          template_id: templateId,
          mode,
          expected_session_revision: session.revision,
        }),
      },
    ),
  );
}

export async function previewScheduleAutoFill(
  workspaceId: string,
  sessionId: string,
): Promise<ScheduleAutoFillPreview> {
  return scheduleAutoFillPreviewSchema.parse(
    await scheduleRequest(
      workspaceId,
      `/schedule/edit-sessions/${sessionId}/auto-fill-preview`,
      { method: "POST" },
    ),
  );
}

export async function applyScheduleAutoFill(
  workspaceId: string,
  session: ScheduleEditSession,
  preview: ScheduleAutoFillPreview,
  assignments: ScheduleAutoFillAssignment[],
): Promise<ScheduleAutoFillApplyResult> {
  return scheduleAutoFillApplyResultSchema.parse(
    await scheduleRequest(
      workspaceId,
      `/schedule/edit-sessions/${session.id}/auto-fill-apply`,
      {
        method: "POST",
        body: JSON.stringify({
          expected_session_revision: session.revision,
          fingerprint: preview.fingerprint,
          assignments,
        }),
      },
    ),
  );
}

export async function previewScheduleExport(
  workspaceId: string,
  request: ScheduleExportRequest,
): Promise<ScheduleExportPreview> {
  return scheduleExportPreviewSchema.parse(
    await scheduleRequest(workspaceId, "/schedule/export-preview", {
      method: "POST",
      body: JSON.stringify(request),
    }),
  );
}

export async function downloadScheduleExport(
  workspaceId: string,
  request: ScheduleExportRequest,
): Promise<Blob> {
  return scheduleDownload(workspaceId, "/schedule/exports", request);
}

export async function listScheduleExportPresets(
  workspaceId: string,
): Promise<{ presets: ScheduleExportPreset[] }> {
  return scheduleExportPresetListSchema.parse(
    await scheduleRequest(workspaceId, "/schedule/export-presets"),
  );
}

export async function createScheduleExportPreset(
  workspaceId: string,
  name: string,
  settings: ScheduleExportSettings,
): Promise<ScheduleExportPreset> {
  return scheduleExportPresetSchema.parse(
    await scheduleRequest(workspaceId, "/schedule/export-presets", {
      method: "POST",
      body: JSON.stringify({ name, settings }),
    }),
  );
}

export async function deleteScheduleExportPreset(
  workspaceId: string,
  presetId: string,
): Promise<void> {
  await scheduleRequest(workspaceId, `/schedule/export-presets/${presetId}`, {
    method: "DELETE",
  });
}

async function scheduleDownload(
  workspaceId: string,
  path: string,
  body: ScheduleExportRequest,
): Promise<Blob> {
  if (!supabaseClient) throw new Error("Schedule storage is not configured");
  const session = await supabaseClient.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("A current session is required for Schedule");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4000"}/v1/workspaces/${workspaceId}${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(result?.error ?? "Schedule export failed");
  }
  return response.blob();
}

async function scheduleRequest(
  workspaceId: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  if (!supabaseClient) throw new Error("Schedule storage is not configured");
  const session = await supabaseClient.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("A current session is required for Schedule");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? "http://127.0.0.1:4000"}/v1/workspaces/${workspaceId}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    },
  );
  if (response.status === 204) return undefined;
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : "Schedule operation failed";
    throw new Error(message);
  }
  return body;
}
