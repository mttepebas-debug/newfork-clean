import {
  scheduleDefaultHoursPreviewSchema,
  type ScheduleDefaultHoursInput,
  type ScheduleDefaultHoursApply,
  scheduleDraftListSchema,
  scheduleDraftDeleteResultSchema,
  scheduleBulkDeleteResultSchema,
  scheduleDraftSummarySchema,
  scheduleEditAcquireResultSchema,
  scheduleEditAutosaveResultSchema,
  scheduleEditSessionSchema,
  scheduleAutoFillApplyResultSchema,
  scheduleAutoFillPreviewSchema,
  scheduleExportPresetListSchema,
  scheduleExportPresetSchema,
  scheduleRecentExportEventListSchema,
  scheduleExportScheduleListSchema,
  scheduleExportScheduleSchema,
  scheduleTemplateApplyPreviewSchema,
  scheduleTemplateApplyResultSchema,
  scheduleTemplateDetailSchema,
  scheduleTemplateListSchema,
  schedulePublicationPreviewSchema,
  schedulePublicationStatusSchema,
  schedulePublishResultSchema,
  schedulePendingOpListSchema,
  scheduleReadModelSchema,
  legacyScheduleShiftListSchema,
  scheduleUnpublishPreviewSchema,
  scheduleUnpublishResultSchema,
  type ScheduleDraftList,
  type ScheduleDraftDeleteResult,
  type ScheduleEditAutosaveResult,
  type ScheduleBulkDeleteResult,
  type ScheduleDraftSummary,
  type ScheduleEditAcquireResult,
  type ScheduleEditSession,
  type ScheduleAutoFillApplyResult,
  type ScheduleAutoFillAssignment,
  type ScheduleAutoFillPreview,
  type ScheduleExportPreset,
  type ScheduleExportSchedule,
  type ScheduleExportSettings,
  type ScheduleRecentExportEvent,
  type ScheduleTemplateApplyPreview,
  type ScheduleTemplateApplyResult,
  type ScheduleTemplateDetail,
  type ScheduleTemplateList,
  type ScheduleEditSource,
  type SchedulePublicationOverrideInput,
  type SchedulePublicationPreflightAck,
  type ScheduleOpenShiftChoice,
  type SchedulePublicationPreview,
  type SchedulePublicationStatus,
  type SchedulePublishResult,
  type SchedulePendingOp,
  type ScheduleReadModel,
  type LegacyScheduleShiftList,
  type ScheduleShiftMutationInput,
  type ScheduleView,
  type ScheduleUnpublishPreview,
  type ScheduleUnpublishResult,
  type CreateScheduleExportScheduleInput,
  type UpdateScheduleExportScheduleInput,
} from "@newfork/shared/schedule";
import {
  getTabWorkspaceId,
  supabaseClient,
} from "../lib/supabase";
import { UNREACHABLE, UNREADABLE, ScreenError } from "../lib/request-error";
import { scheduleRefusalReason } from "./lib/scheduleRefusalReason";
import { scheduleExportV2AuthorizationSchema, scheduleExportV2ScopeSchema, type ScheduleExportV2Scope } from "@newfork/shared";

export async function authorizeScheduleExportV2(workspaceId: string, scope: ScheduleExportV2Scope, signal?: AbortSignal): Promise<void> {
  const result = await activeScheduleRequest(`/v1/workspaces/${encodeURIComponent(workspaceId)}/schedule/export-v2/authorize`, {
    method: "POST", cache: "no-store", signal, body: JSON.stringify(scheduleExportV2ScopeSchema.parse(scope)),
  });
  scheduleExportV2AuthorizationSchema.parse(result);
}

export class ScheduleRequestError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ScheduleRequestError";
    this.status = status;
    this.body = body;
  }
}

function requestReason(error: unknown): unknown {
  return error instanceof ScheduleRequestError ? scheduleRefusalReason(error) : undefined;
}

function editConflictCode(error: unknown): unknown {
  return error instanceof ScheduleRequestError && error.status === 409 && typeof error.body === "object" && error.body
    ? (error.body as { code?: unknown }).code
    : undefined;
}

/** S2: the server had no step left to take back. */
export function isNothingToUndo(error: unknown): boolean {
  return requestReason(error) === "schedule.nothing_to_undo";
}

/** BL-998: why the server took the last step off the Undo list instead of putting it back. */
export function undoRefusedText(reason: NonNullable<ScheduleEditSession["undo_refused"]>["reason"]): string {
  const why = {
    availability: "It would put someone on approved time off or a shift-hours rule blocks it.",
    document: "It would put someone on a shift while a required document is missing.",
    conflict_acceptance: "It needs a schedule conflict to be accepted again.",
    rule: "A scheduling rule blocks it now.",
  }[reason];
  return `${why} It is off the Undo list; press Undo again for the edit before it.`;
}

/** DB-1a: the authorization core said no (scope shrank, or the target is unknown). */
export function isScheduleAccessRefused(error: unknown): boolean {
  const reason = requestReason(error);
  return error instanceof ScheduleRequestError && error.status === 403 &&
    typeof reason === "string" && reason.startsWith("authz.");
}

/** The edit lock lapsed (sleep, lost network): the same person may pick the edit back up. */
export function isEditLeaseExpired(error: unknown): boolean {
  return editConflictCode(error) === "edit_lease_expired";
}

/** The edit was closed elsewhere (saved, discarded, or set aside by another opening): it is not picked up again. */
export function isEditSessionClosed(error: unknown): boolean {
  return editConflictCode(error) === "edit_session_closed";
}

/** The edit moved on under this screen (another save landed first); reload before the next change. */
export function isEditSessionStale(error: unknown): boolean {
  return editConflictCode(error) === "edit_session_stale";
}


export function pendingOpsKey(
  workspaceId: string | null,
  weekStart: string,
  locationId: string | null = null,
  draftId: string | null = null,
) {
  return [
    "schedule-pending-ops",
    workspaceId,
    weekStart,
    locationId,
    draftId,
  ] as const;
}

export function draftsKey(workspaceId: string | null, weekStart: string) {
  return ["schedule-drafts", workspaceId, weekStart] as const;
}

export function scheduleReadKey(
  workspaceId: string | null,
  date: string,
  _view: ScheduleView,
) {
  return ["schedule-read", workspaceId, date] as const;
}

// Every cached day of a workspace's Schedule. The read is cached per date but
// one change can move any day of the week, so invalidation uses this prefix.
export function scheduleReadScopeKey(workspaceId: string | null) {
  return ["schedule-read", workspaceId] as const;
}

export interface PastEditFinding {
  readonly op_type: "create" | "update" | "delete";
  readonly shift_id: string | null;
  readonly scheduled_date: string;
  readonly location_name: string;
  readonly employee_name: string | null;
  readonly reason: "shift_started" | "past_week";
  readonly severity: "blocked" | "warning";
}

export async function getScheduleReadModel(
  workspaceId: string,
  date: string,
  view: ScheduleView,
): Promise<ScheduleReadModel> {
  const query = new URLSearchParams({ date, view });
  return scheduleReadModelSchema.parse(
    await activeScheduleRequest(`/schedule/reference?${query}`),
  );
}

export async function listScheduleDrafts(
  workspaceId: string,
  weekStart: string,
): Promise<ScheduleDraftList> {
  const query = new URLSearchParams({ week_start: weekStart });
  return scheduleDraftListSchema.parse(
    await activeScheduleRequest(`/schedule/drafts?${query}`),
  );
}

export async function fetchScheduleDraftShifts(
  _workspaceId: string,
  weekStart: string,
  draftId: string,
  locationIds: readonly string[] = [],
): Promise<LegacyScheduleShiftList> {
  const query = new URLSearchParams({
    week_start: weekStart,
    draft_id: draftId,
  });
  for (const locationId of locationIds)
    query.append("location_ids", locationId);
  return legacyScheduleShiftListSchema.parse(
    await activeScheduleRequest(`/schedule/shifts?${query}`),
  );
}

export async function fetchSchedulePublicationStatus(
  _workspaceId: string,
  weekStart: string,
): Promise<SchedulePublicationStatus> {
  const query = new URLSearchParams({ week_start: weekStart });
  return schedulePublicationStatusSchema.parse(
    await activeScheduleRequest(`/schedule/publication-status?${query}`),
  );
}

export async function fetchPendingOps(
  _workspaceId: string,
  scope: {
    week_start: string;
    location_id?: string | null;
    location_ids?: readonly string[];
    draft_id?: string | null;
  },
): Promise<{ pending_ops: SchedulePendingOp[] }> {
  const query = new URLSearchParams({ week_start: scope.week_start });
  if (scope.location_id) query.set("location_id", scope.location_id);
  for (const locationId of scope.location_ids ?? []) {
    query.append("location_ids", locationId);
  }
  if (scope.draft_id) query.set("draft_id", scope.draft_id);
  return schedulePendingOpListSchema.parse(
    await activeScheduleRequest(`/schedule/pending-ops?${query}`),
  );
}

export async function acquireScheduleEditSession(
  workspaceId: string,
  weekStart: string,
  sourceKind: ScheduleEditSource,
  sourceDraftId: string | null = null,
  // The locations to edit; null asks for every location the person may edit.
  locationIds: readonly string[] | null = null,
  // False for a new edit asked for from a menu: an edit of the person's that
  // was left open is set aside as an "Auto-save" draft, never brought back.
  resume = true,
): Promise<ScheduleEditAcquireResult> {
  return scheduleEditAcquireResultSchema.parse(
    await activeScheduleRequest("/schedule/edit-lock/acquire", {
      method: "POST",
      body: JSON.stringify({
        week_start: weekStart,
        source_kind: sourceKind,
        source_draft_id: sourceDraftId,
        location_ids: locationIds?.length ? locationIds : null,
        resume,
      }),
    }),
  );
}

export async function heartbeatScheduleEditSession(
  workspaceId: string,
  sessionId: string,
): Promise<ScheduleEditSession> {
  return scheduleEditSessionSchema.parse(
    await activeScheduleRequest("/schedule/edit-lock/heartbeat", {
      method: "PATCH",
      body: JSON.stringify({ session_id: sessionId }),
    }),
  );
}

export async function createScheduleShift(
  workspaceId: string,
  session: ScheduleEditSession,
  shift: ScheduleShiftMutationInput,
): Promise<ScheduleEditSession> {
  return scheduleEditSessionSchema.parse(
    await activeScheduleRequest("/shifts", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        session_id: session.id,
        expected_session_revision: session.revision,
        shift,
      }),
    }),
  );
}

export async function createScheduleShifts(
  workspaceId: string,
  session: ScheduleEditSession,
  shifts: ScheduleShiftMutationInput[],
  idempotencyKey: string,
): Promise<ScheduleEditSession> {
  return scheduleEditSessionSchema.parse(await activeScheduleRequest("/shifts/batch", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ session_id: session.id, expected_session_revision: session.revision, shifts }),
  }));
}

export async function updateScheduleShift(
  workspaceId: string,
  session: ScheduleEditSession,
  shiftId: string,
  expectedShiftRevision: number,
  shift: ScheduleShiftMutationInput,
): Promise<ScheduleEditSession> {
  return scheduleEditSessionSchema.parse(
    await activeScheduleRequest(`/shifts/${shiftId}`, {
      method: "PATCH",
      body: JSON.stringify({
        session_id: session.id,
        expected_session_revision: session.revision,
        expected_shift_revision: expectedShiftRevision,
        shift,
      }),
    }),
  );
}

export async function deleteScheduleShift(
  workspaceId: string,
  session: ScheduleEditSession,
  shiftId: string,
  expectedShiftRevision: number,
): Promise<ScheduleEditSession> {
  return scheduleEditSessionSchema.parse(
    await activeScheduleRequest(`/shifts/${shiftId}`, {
      method: "DELETE",
      body: JSON.stringify({
        session_id: session.id,
        expected_session_revision: session.revision,
        expected_shift_revision: expectedShiftRevision,
      }),
    }),
  );
}

export async function bulkDeleteShifts(
  workspaceId: string,
  shiftIds: readonly string[],
): Promise<ScheduleBulkDeleteResult> {
  return scheduleBulkDeleteResultSchema.parse(
    await activeScheduleRequest("/shifts/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids: shiftIds }),
    }),
  );
}

export async function restoreScheduleShift(
  workspaceId: string,
  session: ScheduleEditSession,
  shiftId: string,
  expectedShiftRevision: number,
): Promise<ScheduleEditSession> {
  return scheduleEditSessionSchema.parse(
    await activeScheduleRequest(`/shifts/${shiftId}/restore`, {
      method: "PATCH",
      body: JSON.stringify({
        session_id: session.id,
        expected_session_revision: session.revision,
        expected_shift_revision: expectedShiftRevision,
      }),
    }),
  );
}

export async function saveScheduleDraft(
  workspaceId: string,
  session: ScheduleEditSession,
  name: string,
  draft: ScheduleDraftSummary | null,
  acknowledgePastEdits = false,
): Promise<ScheduleDraftSummary> {
  return scheduleDraftSummarySchema.parse(
    await activeScheduleRequest("/schedule/drafts/save", {
      method: "POST",
      body: JSON.stringify({
        session_id: session.id,
        expected_session_revision: session.revision,
        name,
        draft_id: draft?.id ?? null,
        expected_draft_revision: draft?.revision ?? null,
        ...(acknowledgePastEdits ? { acknowledge_past_edits: true } : {}),
      }),
    }),
  );
}

export async function deleteScheduleDraft(
  workspaceId: string,
  draftId: string,
): Promise<ScheduleDraftDeleteResult> {
  try {
    return scheduleDraftDeleteResultSchema.parse(
      await activeScheduleRequest(`/schedule/drafts/${draftId}`, {
        method: "DELETE",
      }),
    );
  } catch (error) {
    // D-O6: the server keeps a draft somebody is editing.
    if (requestReason(error) === "schedule.draft_being_edited") {
      throw new ScreenError("Someone is editing this draft. Try again when they finish.");
    }
    throw error;
  }
}

/** S2 (KK-171): takes this edit's last step back on the server. */
export async function undoScheduleEditSessionStep(
  workspaceId: string,
  session: ScheduleEditSession,
): Promise<ScheduleEditSession> {
  return scheduleEditSessionSchema.parse(
    await activeScheduleRequest(`/schedule/edit-sessions/${session.id}/undo`, {
      method: "POST",
      body: JSON.stringify({ expected_session_revision: session.revision }),
    }),
  );
}

/** S1: keeps an idle edit as an "Auto-save" draft and closes it. */
export async function autosaveScheduleEditSession(
  workspaceId: string,
  sessionId: string,
): Promise<ScheduleEditAutosaveResult> {
  return scheduleEditAutosaveResultSchema.parse(
    await activeScheduleRequest("/schedule/edit-lock/autosave", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    }),
  );
}

export async function discardScheduleEditSession(
  workspaceId: string,
  sessionId: string,
): Promise<void> {
  await activeScheduleRequest("/schedule/edit-lock/release", {
    method: "DELETE",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function previewSchedulePublication(
  workspaceId: string,
  draftId: string,
  locationIds: string[],
  departmentScope: {
    readonly departmentIds?: readonly string[];
    readonly includeNoDepartment?: boolean;
  } = {},
): Promise<SchedulePublicationPreview> {
  return schedulePublicationPreviewSchema.parse(
    await activeScheduleRequest("/schedule/publish-preview", {
      method: "POST",
      body: JSON.stringify({
        draft_id: draftId,
        location_ids: locationIds,
        ...(departmentScope.departmentIds
          ? { department_ids: departmentScope.departmentIds }
          : {}),
        ...(departmentScope.includeNoDepartment !== undefined
          ? { include_no_department: departmentScope.includeNoDepartment }
          : {}),
      }),
    }),
  );
}

export async function publishScheduleDraft(
  workspaceId: string,
  preview: SchedulePublicationPreview,
  overrides: SchedulePublicationOverrideInput[],
  preflightAck?: SchedulePublicationPreflightAck,
  departmentScope: {
    readonly departmentIds?: readonly string[];
    readonly includeNoDepartment?: boolean;
  } = {},
  openShifts?: ScheduleOpenShiftChoice,
): Promise<SchedulePublishResult> {
  const ack = preflightAck ?? {
    fingerprint: preview.fingerprint,
    decisions: overrides,
  };
  return schedulePublishResultSchema.parse(
    await activeScheduleRequest("/schedule/publish", {
      method: "POST",
      body: JSON.stringify({
        draft_id: preview.draft_id,
        week_start: preview.week_start,
        location_ids: preview.locations.map((location) => location.location_id),
        expected_draft_revision: preview.draft_revision,
        fingerprint: preview.fingerprint,
        ...(departmentScope.departmentIds
          ? { department_ids: departmentScope.departmentIds }
          : {}),
        ...(departmentScope.includeNoDepartment !== undefined
          ? { include_no_department: departmentScope.includeNoDepartment }
          : {}),
        overrides,
        preflight_ack: ack,
        ...(openShifts ? { open_shifts: openShifts } : {}),
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
    await activeScheduleRequest("/schedule/unpublish-preview", {
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
    await activeScheduleRequest("/schedule/unpublish", {
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
  _workspaceId: string,
): Promise<ScheduleTemplateList> {
  return scheduleTemplateListSchema.parse(
    await activeScheduleRequest("/schedule/templates"),
  );
}

export async function createScheduleTemplate(
  workspaceId: string,
  draftId: string,
  name: string,
  stripAssignments: boolean,
): Promise<ScheduleTemplateDetail> {
  return scheduleTemplateDetailSchema.parse(
    await activeScheduleRequest("/schedule/templates", {
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
    await activeScheduleRequest(`/schedule/templates/${templateId}`, {
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
  await activeScheduleRequest(`/schedule/templates/${templateId}`, {
    method: "DELETE",
    body: JSON.stringify({ expected_revision: expectedRevision }),
  });
}

export async function applyScheduleTemplate(
  workspaceId: string,
  session: ScheduleEditSession,
  templateId: string,
  mode: "merge" | "overwrite",
  departmentKeys: readonly string[] | null = null,
): Promise<ScheduleTemplateApplyResult> {
  return scheduleTemplateApplyResultSchema.parse(
    await activeScheduleRequest(
      `/schedule/edit-sessions/${session.id}/apply-template`,
      {
        method: "POST",
        body: JSON.stringify({
          template_id: templateId,
          mode,
          expected_session_revision: session.revision,
          department_keys: departmentKeys,
        }),
      },
    ),
  );
}

/** KK-162 (BL-694): how many shifts Replace would remove, counted by the database. */
export async function previewScheduleTemplateApply(
  workspaceId: string,
  sessionId: string,
  templateId: string,
  departmentKeys: readonly string[] | null = null,
): Promise<ScheduleTemplateApplyPreview> {
  return scheduleTemplateApplyPreviewSchema.parse(
    await activeScheduleRequest(
      `/schedule/edit-sessions/${sessionId}/template-apply-preview`,
      {
        method: "POST",
        body: JSON.stringify({
          template_id: templateId,
          department_keys: departmentKeys,
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
    await activeScheduleRequest(
      `/schedule/edit-sessions/${sessionId}/auto-fill-preview`,
      { method: "POST" },
    ),
  );
}

export async function previewScheduleDefaultHours(workspaceId: string, sessionId: string, command: ScheduleDefaultHoursInput) {
  return scheduleDefaultHoursPreviewSchema.parse(await activeScheduleRequest(`/v1/workspaces/${workspaceId}/schedule/edit-sessions/${sessionId}/default-hours-preview`, { method: "POST", body: JSON.stringify(command) }));
}
export async function applyScheduleDefaultHours(workspaceId: string, sessionId: string, command: ScheduleDefaultHoursApply) {
  return scheduleEditSessionSchema.parse(await activeScheduleRequest(`/v1/workspaces/${workspaceId}/schedule/edit-sessions/${sessionId}/default-hours-apply`, { method: "POST", body: JSON.stringify(command) }));
}

export async function applyScheduleAutoFill(
  workspaceId: string,
  session: ScheduleEditSession,
  preview: ScheduleAutoFillPreview,
  assignments: ScheduleAutoFillAssignment[],
): Promise<ScheduleAutoFillApplyResult> {
  return scheduleAutoFillApplyResultSchema.parse(
    await activeScheduleRequest(
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

export async function listScheduleExportPresets(
  _workspaceId: string,
): Promise<{ presets: ScheduleExportPreset[] }> {
  return scheduleExportPresetListSchema.parse(
    await activeScheduleRequest("/schedule/export-presets"),
  );
}

export async function createScheduleExportPreset(
  workspaceId: string,
  name: string,
  settings: ScheduleExportSettings,
): Promise<ScheduleExportPreset> {
  return scheduleExportPresetSchema.parse(
    await activeScheduleRequest("/schedule/export-presets", {
      method: "POST",
      body: JSON.stringify({ name, settings }),
    }),
  );
}

export async function updateScheduleExportPreset(
  workspaceId: string,
  presetId: string,
  name: string,
  settings: ScheduleExportSettings,
): Promise<ScheduleExportPreset> {
  return scheduleExportPresetSchema.parse(
    await activeScheduleRequest(`/schedule/export-presets/${presetId}`, {
      method: "PATCH",
      body: JSON.stringify({ name, settings }),
    }),
  );
}

export async function deleteScheduleExportPreset(
  workspaceId: string,
  presetId: string,
): Promise<void> {
  await activeScheduleRequest(`/schedule/export-presets/${presetId}`, {
    method: "DELETE",
  });
}

export async function listScheduleExportSchedules(
  _workspaceId: string,
): Promise<{ schedules: ScheduleExportSchedule[] }> {
  return scheduleExportScheduleListSchema.parse(
    await activeScheduleRequest("/schedule/export-schedules"),
  );
}

export async function createScheduleExportSchedule(
  workspaceId: string,
  input: CreateScheduleExportScheduleInput,
): Promise<ScheduleExportSchedule> {
  return scheduleExportScheduleSchema.parse(
    await activeScheduleRequest("/schedule/export-schedules", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export async function updateScheduleExportSchedule(
  workspaceId: string,
  scheduleId: string,
  input: UpdateScheduleExportScheduleInput,
): Promise<ScheduleExportSchedule> {
  return scheduleExportScheduleSchema.parse(
    await activeScheduleRequest(`/schedule/export-schedules/${scheduleId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteScheduleExportSchedule(
  workspaceId: string,
  scheduleId: string,
): Promise<void> {
  await activeScheduleRequest(`/schedule/export-schedules/${scheduleId}`, {
    method: "DELETE",
  });
}

export async function listScheduleRecentExports(
  _workspaceId: string,
): Promise<{ events: ScheduleRecentExportEvent[] }> {
  return scheduleRecentExportEventListSchema.parse(
    await activeScheduleRequest("/schedule/exports/recent"),
  );
}

async function activeScheduleRequest(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  if (!supabaseClient) throw new Error("Schedule storage is not configured");
  const session = await supabaseClient.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("A current session is required for Schedule");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const tabWorkspaceId = getTabWorkspaceId();
  if (tabWorkspaceId) headers.set("X-Newfork-Workspace-Id", tabWorkspaceId);
  let response: Response;
  try {
    response = await fetch(
      `${import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:9999" : "")}${path}`,
      {
        ...init,
        headers,
      },
    );
  } catch (error) {
    // An abort is the caller's own doing; it keeps its name.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ScheduleRequestError(UNREACHABLE, 0, null);
  }
  if (response.status === 204) return undefined;
  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch {
    // A proxy's HTML error page (502, 504) or a cut-off answer.
    throw new ScheduleRequestError(UNREADABLE, response.status, null);
  }
  if (!response.ok) {
    // BL-395: the API says nothing a person can use above 499 ("Internal server error").
    const message =
      response.status >= 500
        ? UNREADABLE
        : typeof body === "object" && body && "error" in body
          ? String(body.error)
          : "Schedule operation failed";
    throw new ScheduleRequestError(message, response.status, body);
  }
  return body;
}
