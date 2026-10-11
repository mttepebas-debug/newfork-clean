export * from "./schedule-default-hours";
export {
  scheduleAutoFillApplyResultSchema,
  scheduleAutoFillAssignmentSchema,
  scheduleBulkDeleteResultSchema,
  scheduleAutoFillPreviewSchema,
  scheduleDraftListSchema,
  scheduleDraftDeleteResultSchema,
  scheduleDraftSummarySchema,
  scheduleEditAcquireResultSchema,
  scheduleEditAutosaveResultSchema,
  scheduleEditableShiftSchema,
  scheduleEditSessionSchema,
  scheduleEditSourceSchema,
  scheduleExportPresetListSchema,
  scheduleExportPresetSchema,
  scheduleExportPreviewSchema,
  scheduleExportRequestSchema,
  scheduleExportScheduleListSchema,
  scheduleExportScheduleSchema,
  scheduleExportSettingsSchema,
  legacyScheduleShiftListSchema,
  scheduleRecentExportEventListSchema,
  scheduleRecentExportEventSchema,
  schedulePublicationStatusSchema,
  schedulePublicationLocationStatusSchema,
  schedulePendingOpSchema,
  schedulePendingOpListSchema,
  schedulePendingOpMutationResultSchema,
  schedulePendingOpPayloadSchema,
  schedulePendingOpTypeSchema,
  schedulePublicationPreflightAckSchema,
  schedulePublicationOverrideInputSchema,
  schedulePublicationPreviewSchema,
  schedulePublicationPreflightBlockReasonSchema,
  schedulePublishConflictShiftSummarySchema,
  schedulePublishConflictSummarySchema,
  schedulePublishPreflightResultSchema,
  schedulePublishPublishedResultSchema,
  schedulePublishResultSchema,
  schedulePublishScheduleConflictsResultSchema,
  schedulePublishStaleBaselineResultSchema,
  scheduleReadModelSchema,
  scheduleRequestsReadModelSchema,
  scheduleShiftMutationInputSchema,
  shiftLabelInputSchema,
  shiftLabelSchema,
  scheduleShiftLabelSchema,
  scheduleShiftSchema,
  scheduleTemplateApplyPreviewSchema,
  scheduleTemplateApplyResultSchema,
  scheduleTemplateDetailSchema,
  scheduleTemplateListSchema,
  scheduleTemplateSummarySchema,
  scheduleUnpublishPreviewSchema,
  scheduleUnpublishResultSchema,
  scheduleViewSchema,
  createScheduleExportScheduleInputSchema,
  createSchedulePendingOpInputSchema,
  updateSchedulePendingOpInputSchema,
  updateScheduleExportScheduleInputSchema,
} from "./index";

export type {
  CreateScheduleExportScheduleInput,
  CreateSchedulePendingOpInput,
  LegacyScheduleShiftList,
  ScheduleBulkDeleteResult,
  ScheduleAutoFillApplyResult,
  ScheduleAutoFillAssignment,
  ScheduleAutoFillPreview,
  ScheduleDraftList,
  ScheduleDraftDeleteResult,
  ScheduleDraftSummary,
  ScheduleEditAcquireResult,
  ScheduleEditAutosaveResult,
  ScheduleEditableShift,
  ScheduleEditSession,
  ScheduleEditSource,
  ScheduleEmployee,
  ScheduleExportPreset,
  ScheduleExportPreview,
  ScheduleExportRequest,
  ScheduleExportSchedule,
  ScheduleExportSettings,
  ScheduleRecentExportEvent,
  ScheduleLocation,
  SchedulePublicationStatus,
  SchedulePublicationPreflightAck,
  SchedulePublicationPreflightBlockReason,
  SchedulePublicationOverrideInput,
  SchedulePublicationPreview,
  SchedulePublishConflictShiftSummary,
  SchedulePublishConflictSummary,
  SchedulePublishPreflightResult,
  SchedulePublishPublishedResult,
  SchedulePublishResult,
  SchedulePublishScheduleConflictsResult,
  SchedulePublishStaleBaselineResult,
  SchedulePendingOp,
  SchedulePendingOpMutationResult,
  SchedulePendingOpPayload,
  SchedulePendingOpType,
  ScheduleReadModel,
  ScheduleRequestsReadModel,
  ScheduleShift,
  ScheduleShiftMutationInput,
  ShiftLabel,
  ShiftLabelInput,
  ScheduleShiftLabel,
  ScheduleTemplateApplyPreview,
  ScheduleTemplateApplyResult,
  ScheduleTemplateDetail,
  ScheduleTemplateList,
  ScheduleTemplateSummary,
  ScheduleUnpublishPreview,
  ScheduleUnpublishResult,
  ScheduleView,
  UpdateSchedulePendingOpInput,
  UpdateScheduleExportScheduleInput,
} from "./index";

// Does an important date fall on this day? The Schedule's day strip, its
// export and the API read it the way public.schedule_closures closes a day
// (KK-92 d): a yearly date from its first year to two years after today, and
// 29 February on 28 February in a year without it.
// ponytail: a yearly range is at most a year long (two years are checked).
export function importantDateCoversDate(
  item: { readonly starts_on: string; readonly ends_on: string; readonly recurrence?: string | null },
  day: string,
  today: string = new Date().toISOString().slice(0, 10),
): boolean {
  if (item.recurrence !== "annual") {
    return item.starts_on <= day && day <= item.ends_on;
  }
  const first = yearOf(item.starts_on);
  const last = Math.max(yearOf(today) + 2, first);
  return [yearOf(day) - 1, yearOf(day)].some((year) =>
    year >= first && year <= last &&
    inYear(item.starts_on, year - first) <= day && day <= inYear(item.ends_on, year - first),
  );
}

function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

function inYear(iso: string, years: number): string {
  const year = yearOf(iso) + years;
  const monthDay = iso.slice(5, 10);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return `${year}-${monthDay === "02-29" && !leap ? "02-28" : monthDay}`;
}
