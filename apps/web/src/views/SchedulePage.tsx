import type {
  ScheduleDraftList,
  ScheduleDraftSummary,
  ScheduleAutoFillPreview,
  ScheduleEditableShift,
  ScheduleEditSession,
  SchedulePublicationStatus,
  SchedulePendingOp,
  ScheduleShift,
  ScheduleShiftMutationInput,
  ScheduleView,
  ScheduleTemplateSummary,
} from "@newfork/shared/schedule";
import { Button, useToast } from "@newfork/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ClipboardPaste,
  Eye,
  EyeOff,
  Save,
  Send,
  Trash2,
  Undo2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { noAccessHomePath } from "../auth/resolveLanding";
import { isNoAccess } from "../lib/no-access";
import { requestErrorText, ScreenError } from "../lib/request-error";
import { NoAccessState } from "../shell/NoAccessState";
import { ListOutline, LoadError, RefreshError } from "../shell/LoadState";
import { Tooltip } from "../shell/Tooltip";
import { EmployeeDrawer } from "../employees/EmployeeDrawer";
import { ScheduleFilterCommandStrip } from "../schedule/components/ScheduleFilterCommandStrip";
import { ScheduleSearchEmpty } from "../schedule/components/ScheduleSearch";
import { scheduleSearchTerm, searchScheduleModel } from "../schedule/lib/scheduleSearch";
import {
  ScheduleCellContextMenu,
  ScheduleContextMenu,
  type CellContextMenuTarget,
  type ShiftContextMenuTarget,
} from "../schedule/components/ScheduleContextMenu";
import { ScheduleGrid } from "../schedule/components/ScheduleGrid";
import { ScheduleTopBar, ScheduleViewModeControls } from "../schedule/components/ScheduleTopBar";
import { ShiftQuickEditor } from "../schedule/components/ShiftQuickEditor";
import { resolveTimeInputFormat } from "../schedule/timeInput";
import type { PresetCreateTarget } from "../schedule/components/SchedulePresetRows";
import {
  applyScheduleAutoFill,
  applyScheduleTemplate,
  previewScheduleTemplateApply,
  bulkDeleteShifts,
  createScheduleTemplate,
  createScheduleShift,
  createScheduleShifts,
  deleteScheduleShift,
  deleteScheduleDraft,
  discardScheduleEditSession,
  undoScheduleEditSessionStep,
  isEditSessionStale,
  isNothingToUndo,
  undoRefusedText,
  deleteScheduleTemplate,
  isEditLeaseExpired,
  isEditSessionClosed,
  draftsKey,
  listScheduleDrafts,
  listScheduleTemplates,
  fetchSchedulePublicationStatus,
  previewScheduleAutoFill,
  previewSchedulePublication,
  previewScheduleUnpublish,
  publishScheduleDraft,
  restoreScheduleShift,
  saveScheduleDraft,
  ScheduleRequestError,
  renameScheduleTemplate,
  updateScheduleShift,
  unpublishSchedule,
} from "../schedule/schedule-data";
import { AutoFillReviewOverlay } from "../schedule/components/AutoFillReviewOverlay";
import { DefaultHoursReviewDialog } from "../schedule/components/DefaultHoursReviewDialog";
import { NewScheduleWindow, type NewScheduleTab, type NewScheduleWindowProps } from "../schedule/components/NewScheduleWindow";
import { templateMutationError, type NewScheduleTemplatesStep, type TemplateUseTarget } from "../schedule/components/NewScheduleTemplates";
import {
  SCHEDULE_CONFLICT_QUESTION,
  ScheduleConflictSheet,
} from "../schedule/components/ScheduleConflictSheet";
import { ScheduleEditLockedDialog as ScheduleEditLockedDialogComponent } from "../schedule/components/ScheduleEditLockedDialog";
import { ScheduleEditTimeoutDialog as ScheduleEditTimeoutDialogComponent } from "../schedule/components/ScheduleEditTimeoutDialog";
import { ExportController } from "../schedule/export-v2/ExportController";
import { createScheduleExportSnapshot, type SnapshotResult } from "../schedule/export-v2/snapshot";
import { usePreviewSource } from "../schedule/export-v2/usePreviewSource";
import { ScheduleSaveRecoverySheet } from "../schedule/components/ScheduleSaveRecoverySheet";
import { ExchangeScheduleRecovery } from "../employee-hub/shift-exchanges/ExchangeScheduleRecovery";
import { countLabel } from "../schedule/components/PublishPreflightPanel";
import { PublishScheduleDialog, type SchedulePublicationChoices } from "../schedule/components/PublishScheduleDialog";
import { preflightReturnSearch, preflightReturnShift } from "../schedule/lib/schedulePreflightReturn";
import { usePreflightShiftFocus } from "../schedule/hooks/usePreflightShiftFocus";
import { useScheduleDropReview } from "../schedule/hooks/useScheduleDropReview";
import { useScheduleAssignNotice } from "../schedule/hooks/useScheduleAssignNotice";
import { SaveDraftMenu } from "../schedule/components/SaveDraftMenu";
import { SaveDraftDialog } from "../schedule/components/SaveDraftDialog";
import { UnpublishScheduleDialog } from "../schedule/components/UnpublishScheduleDialog";
import {
  ScheduleLogoUploadDialog,
  type ScheduleLogoSaveDraft,
} from "../schedule/components/ScheduleLogoUploadDialog";
import { RetroactiveEditDialog } from "../schedule/components/RetroactiveEditDialog";
import {
  EDIT_IDLE_TIMEOUT_MS,
  EDIT_IDLE_WARNING_MS,
} from "../schedule/hooks/useEditIdleTimer";
import { EDIT_ENDED_AWAY, EDIT_NOT_RECONNECTED, useScheduleEditSession } from "../schedule/hooks/useScheduleEditSession";
import { useScheduleLeaveGuard } from "../schedule/hooks/useScheduleLeaveGuard";
import { useEffectiveShifts } from "../schedule/hooks/useEffectiveShifts";
import { createOptimisticPendingOp } from "../schedule/hooks/optimisticScheduleCache";
import { PresetTimePicker, presetPickCellAt, type PresetPickCell } from "../schedule/components/PresetTimePicker";
import { presetDropInput, presetPickName, presetPickWhere, presetTimeOptions, withPresetHours, type PresetHours } from "../schedule/lib/presetTimes";
import { useRetroactiveEditPrompt } from "../schedule/hooks/useRetroactiveEditPrompt";
import { usePendingOpsQuery } from "../schedule/hooks/usePendingOpsQuery";
import { useScheduleDrafts } from "../schedule/hooks/useScheduleDrafts";
import { useScheduleMode } from "../schedule/hooks/useScheduleMode";
import { useScheduleQuery, useScheduleToday } from "../schedule/hooks/useScheduleQuery";
import { useScheduleRealtime } from "../schedule/hooks/useScheduleRealtime";
import { useScheduleViewerPresence } from "../schedule/hooks/useScheduleViewerPresence";
import { saveScheduleLogo } from "../settings/organization-data";
import {
  evaluateScheduleShiftConflicts,
  formatScheduleConflictMessage,
  scheduleConflictSeverity,
  type ScheduleConflictReason,
} from "../schedule/schedule-conflicts";
import {
  cacheSavedDraftResult,
  clearPendingOpsCachesForDraft,
  getSaveDraftFailureMessage,
  invalidateScheduleCommitCaches,
  parseSaveDraftNameConflict,
  removeDraft,
  type DraftsCacheSnapshot,
} from "../schedule/lib/draftSaveFlow";
import { isSameEditSession } from "../schedule/lib/scheduleMutationContext";
import { useCloseOnEscape } from "../schedule/lib/useCloseOnEscape";
import { followUpAfterUnpublish } from "../schedule/lib/scheduleUnpublishFollowUp";
import { SCHEDULE_ACTION_BUTTON_CLASS } from "../schedule/lib/scheduleActionButton";
import { formatSchedulePasteConflictContext } from "../schedule/lib/scheduleCatalogNames";
import { templateAppliedDescription } from "../schedule/lib/templateApplyMessage";
import { autoFillRejectedText } from "../schedule/lib/autoFillText";
import { viewSwitchDate } from "../schedule/lib/scheduleViewSwitch";
import {
  asksForReload,
  autoFillApplyError,
  scheduleEditErrorText,
  staleEditAsScreenError,
  UNDO_SESSION_STALE_TEXT,
} from "../schedule/lib/scheduleEditErrorText";
import { ScheduleDeleteSelectionDialog } from "../schedule/components/ScheduleDeleteSelectionDialog";
import { resolveScheduleShiftSelectionIds } from "../schedule/lib/scheduleShiftSelection";
import {
  applyShiftClipboardSnapshot,
  createShiftClipboardSnapshot,
  type ShiftClipboardSnapshot,
} from "../schedule/lib/shiftClipboard";
import type { ScheduleShiftEditorState } from "../schedule/lib/shiftEditorState";
import {
  createSortedScheduleModel,
  type ScheduleEmployeeSortMode,
} from "../schedule/lib/scheduleEmployeeSort";
import {
  usePersistentScheduleEmployeeSortMode,
  usePersistentScheduleUiBoolean,
} from "../schedule/store/scheduleUiStore";
import { can } from "../auth/can";
import { useScheduleCalendarPosts } from "../schedule/hooks/useScheduleCalendarPosts";
import {
  createLocationPublicationChipStatuses,
  createScheduleCalendarMarkers,
  createScheduleFilterChips,
  filterScheduleModel,
  getSchedulePublicationActionTone,
  validDate,
  validIds,
} from "../schedule/lib/scheduleFilterModel";
import {
  canUnpublishSchedule,
  scheduleGates,
} from "../schedule/lib/scheduleGates";
import {
  addDays,
  currentWeekStart,
  formatPeriod,
  formatTime,
  formatWeekdayDate,
} from "../schedule/lib/scheduleDateTime";
import {
  buildCellPresetMenuItems,
  formatPresetCreateContext,
  validatePresetCreateTarget,
} from "../schedule/lib/schedulePresetTargets";
import { resolveScheduleDeleteShiftIds } from "../schedule/lib/scheduleDeleteSelection";
import { scheduleClosureCoversDate } from "../schedule/lib/scheduleClosures";
import { parseRetroactiveEditError } from "../schedule/lib/retroactiveEditRecovery";
import { publicationStateForShift, withoutReplacedRemovedShifts } from "../schedule/lib/scheduleShiftMetadata";
import { toScheduleShiftMutation } from "../schedule/lib/scheduleShiftMutation";
import {
  SCHEDULE_WINDOW_SELECTOR,
  isTopActionOutsidePress,
  isBlankScheduleDismissTarget,
  isMatchingScheduleLocationHeaderTarget,
  isScheduleEditFocusedShiftBlankDismissTarget,
  isScheduleGridCellActivationTarget,
  isScheduleInteractionSurface,
  isScheduleLayerTarget,
  isSchedulePreviewFocusedShiftBlankDismissTarget,
  isScheduleSurfaceTarget,
  isSuppressedScheduleClickTarget,
  isTextEditingTarget,
} from "../schedule/lib/scheduleInteractionTargets";
import {
  clearFocusedShiftSearchFilters,
  dismissNextScheduleSearchLayer,
  newestScheduleFilterKey,
  withScheduleSearchValue,
} from "../schedule/lib/scheduleDismissal";
import { useConfirmDialog } from "../shell/ConfirmDialog";

type SaveRecoveryIntent =
  | {
      readonly kind: "save";
      readonly name: string;
      readonly force: boolean;
      readonly targetDraftId: string | null | undefined;
    }
  | {
      readonly kind: "save-and-publish";
      readonly name: string;
      readonly force: boolean;
      readonly targetDraftId: string | null | undefined;
    };

type SaveRecoveryState = {
  readonly intent: SaveRecoveryIntent;
  readonly retrying: boolean;
} | null;

const NO_DRAFTS: readonly ScheduleDraftSummary[] = [];

const SCHEDULE_FILTER_QUERY_PARAMS = [
  "locations",
  "shiftTypes",
  "jobs",
  "employees",
  "hideUnscheduled",
  "layout",
  "q",
] as const;

type DraftsAsk = {
  readonly source: "blank" | "edit";
  readonly draftId: string | null;
  readonly weekStart: string;
};

export function SchedulePage({
  scheduleBasePath = "/app/schedule",
}: {
  readonly scheduleBasePath?: string;
} = {}) {
  const { account, context, refresh } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const { activeDraftId, isEditMode, setMode: setScheduleMode } = useScheduleMode();
  const today = useScheduleToday(context?.workspace.id ?? null);
  const selectedDate = validDate(search.get("date")) ?? today;
  const view: ScheduleView = search.get("view") === "day" ? "day" : "week";
  const layout = search.get("layout") === "unified" ? "unified" : "separate";
  const hideUnscheduled = search.get("hideUnscheduled") === "true";
  const query = useScheduleQuery(
    context?.workspace.id ?? null,
    selectedDate,
    view,
  );
  const gates = scheduleGates(context);
  const calendarPosts = useScheduleCalendarPosts(
    context?.workspace.id ?? null,
    can(context, "announcement.read"),
  );
  const canExportSchedules = gates.export;
  const {
    session,
    setSession,
    mutationContext,
    currentMutationContext,
    conflict,
    setConflict,
    acquire: acquireEditSession,
    recoverLease,
    runWithLease,
    endClosedEdit,
    discardOnLeave: discardEditOnLeave,
    setAside: setAsideEditSession,
    idleSeconds,
    keepEditing,
  } = useScheduleEditSession({
    userId: context?.userId,
    workspaceId: context?.workspace.id,
    onError: (message) => setOperationError(message),
    onEnded: () => {
      setScheduleMode("preview", null);
      updateSelectedIds([]);
    },
    // S1: the idle edit became an "Auto-save" draft; the person finds it in the draft menu.
    onAutoSaved: (draftName) => {
      if (context) {
        void queryClient.invalidateQueries({ queryKey: ["schedule-drafts", context.workspace.id] });
      }
      toast.info("Your changes were saved as a draft", {
        dedupeKey: "schedule-autosaved",
        description: draftName,
      });
    },
    // D-O9 (KK-162): a lapsed edit's unsaved work became its own draft; one line, no notification.
    onRecovered: (draftName) => {
      if (context) {
        void queryClient.invalidateQueries({ queryKey: ["schedule-drafts", context.workspace.id] });
      }
      toast.info("Unsaved changes were saved as a separate draft", {
        dedupeKey: "schedule-recovered",
        description: draftName,
      });
    },
  });
  const [defaultHoursOpen, setDefaultHoursOpen] = useState(false);
  useEffect(() => setDefaultHoursOpen(false), [context?.workspace.id, session?.id]);
  const [editor, setEditor] = useState<ScheduleShiftEditorState | null>(null);
  // The time list a preset drop opened (PRESET-SAAT, S-183); null while none is open.
  const [presetPick, setPresetPick] = useState<{ readonly target: PresetCreateTarget; readonly cell: PresetPickCell } | null>(null);
  const closePresetPick = useCallback(() => setPresetPick(null), []);
  const [, setEditorDirty] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  // An edit asked for while the drafts list could not be read: "Try again"
  // repeats that ask (blank, or the published or draft schedule it named).
  // The ask keeps its week, so a read that fails after the week changed never
  // shows on, or edits, the new week.
  const [draftsUnread, setDraftsUnread] = useState<DraftsAsk | null>(null);
  const [draftsRetrying, setDraftsRetrying] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [focusedShiftId, setFocusedShiftId] = useState<string | null>(null);
  // The job and type filters a badge click set; the outline lives as long as they do (QA 43).
  const focusFiltersRef = useRef<{ jobs: string | null; shiftTypes: string | null; seen: boolean } | null>(null);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const selectedIdsRef = useRef<readonly string[]>([]);
  const [deleteSelectionConfirmOpen, setDeleteSelectionConfirmOpen] =
    useState(false);
  const [deleteSelectionIds, setDeleteSelectionIds] = useState<
    readonly string[]
  >([]);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [clipboard, setClipboard] = useState<ShiftClipboardSnapshot | null>(
    null,
  );
  const [pasteArmed, setPasteArmed] = useState(false);
  const [pasteModeNotice, setPasteModeNotice] = useState<string | null>(null);
  const [pasteBlockedReason, setPasteBlockedReason] = useState<string | null>(
    null,
  );
  const [shiftConflictMessages, setShiftConflictMessages] = useState<
    readonly ScheduleConflictReason[]
  >([]);
  const [pasteConflictContext, setPasteConflictContext] = useState<
    string | null
  >(null);
  const [saveRecovery, setSaveRecovery] = useState<SaveRecoveryState>(null);
  const [exchangeRecoveryBlocked, setExchangeRecoveryBlocked] = useState(false);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);
  const updateSelectedIds = useCallback(
    (
      next:
        readonly string[] | ((current: readonly string[]) => readonly string[]),
    ) => {
      setSelectedIds((_current) => {
        const resolved =
          typeof next === "function" ? next(selectedIdsRef.current) : next;
        selectedIdsRef.current = resolved;
        return resolved;
      });
    },
    [],
  );
  const {
    state: retroactiveEditState,
    prompt: promptRetroactiveEdit,
    onConfirm: confirmRetroactiveEdit,
    onOpenChange: setRetroactiveEditOpen,
  } = useRetroactiveEditPrompt();
  useEffect(() => {
    setSaveBusy(false);
    setSaveOpen(false);
    setSaveRecovery(null);
    setRetroactiveEditOpen(false);
  }, [mutationContext, setRetroactiveEditOpen]);
  const pasteModeNoticeTimerRef = useRef<number | null>(null);
  const previousPasteArmedRef = useRef(false);
  const showPasteModeNotice = useCallback((message: string, durationMs = 0) => {
    if (pasteModeNoticeTimerRef.current !== null) {
      window.clearTimeout(pasteModeNoticeTimerRef.current);
      pasteModeNoticeTimerRef.current = null;
    }
    setPasteModeNotice(message);
    if (durationMs > 0) {
      pasteModeNoticeTimerRef.current = window.setTimeout(() => {
        setPasteModeNotice(null);
        pasteModeNoticeTimerRef.current = null;
      }, durationMs);
    }
  }, []);
  const [shiftMenu, setShiftMenu] = useState<ShiftContextMenuTarget | null>(
    null,
  );
  const [cellMenu, setCellMenu] = useState<CellContextMenuTarget | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishChoices, setPublishChoices] = useState<SchedulePublicationChoices | null>(null);
  const [preflightShiftId, setPreflightShiftId] = useState<string | null>(null);
  const [publishDraftOverride, setPublishDraftOverride] =
    useState<ScheduleDraftSummary | null>(null);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [publicationStatus, setPublicationStatus] =
    useState<SchedulePublicationStatus | null>(null);
  // Settings → Scheduling → Publish by, kept while an edit hides the status.
  const [publishDeadlineDay, setPublishDeadlineDay] =
    useState<SchedulePublicationStatus["schedule_deadline_day"]>();
  const [pendingOps, setPendingOps] = useState<readonly SchedulePendingOp[]>(
    [],
  );
  const [templates, setTemplates] = useState<
    readonly ScheduleTemplateSummary[]
  >([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesLoadError, setTemplatesLoadError] = useState(false);
  const [templatesStep, setTemplatesStep] = useState<NewScheduleTemplatesStep>({ kind: "list" });
  const [templatesSaving, setTemplatesSaving] = useState(false);
  // "Use" with no edit open: the picked schedule opens for editing, then the window comes back at this template.
  const [templateUseAfterEdit, setTemplateUseAfterEdit] = useState<string | null>(null);
  const [autoFill, setAutoFill] = useState<ScheduleAutoFillPreview | null>(
    null,
  );
  const newScheduleDeepLinkConsumed = useRef<NewScheduleTab | null>(null);
  // The New Schedule window: Schedules, Templates and Export are its tabs (Mert, 2026-10-12).
  const [newScheduleMenuOpen, setNewScheduleMenuOpen] = useState(false);
  const [newScheduleTab, setNewScheduleTab] = useState<NewScheduleTab>("schedules");
  const exportOpen = newScheduleMenuOpen && newScheduleTab === "export" && gates.export;
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const [publishMenuDismissSignal, setPublishMenuDismissSignal] = useState(0);
  const topActionBlockedClickTargetRef = useRef<Element | null>(null);
  const closeTopActionSurfaces = useCallback(
    (keep: "newSchedule" | "publish" | null = null) => {
      if (
        keep !== "newSchedule" &&
        (location.pathname === `${scheduleBasePath}/export` ||
          location.pathname === `${scheduleBasePath}/templates`)
      ) {
        navigate({ pathname: scheduleBasePath, search: location.search });
      }
      if (keep !== "publish") {
        setPublishOpen(false);
        setPublishDraftOverride(null);
      }
      if (keep !== "newSchedule") setNewScheduleMenuOpen(false);
      if (keep !== "publish") {
        setPublishMenuOpen(false);
        setPublishMenuDismissSignal((current) => current + 1);
      }
    },
    [location.pathname, location.search, navigate, scheduleBasePath],
  );
  const topActionSurfaceOpen =
    publishOpen ||
    newScheduleMenuOpen ||
    publishMenuOpen;
  useEffect(() => {
    if (!topActionSurfaceOpen) return;
    const closeFromOutsideTopAction = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!isTopActionOutsidePress(target)) return;
      closeTopActionSurfaces();
      topActionBlockedClickTargetRef.current = target;
      suppressedScheduleClickTargetRef.current = target;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    document.addEventListener("pointerdown", closeFromOutsideTopAction, true);
    return () =>
      document.removeEventListener(
        "pointerdown",
        closeFromOutsideTopAction,
        true,
      );
  }, [closeTopActionSurfaces, topActionSurfaceOpen]);
  useEffect(() => {
    const blockOutsideTopActionClick = (event: globalThis.MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(SCHEDULE_WINDOW_SELECTOR)) {
        topActionBlockedClickTargetRef.current = null;
        return;
      }
      if (
        (event.ctrlKey || event.metaKey || event.shiftKey) &&
        target.closest("[data-shift-badge='true']")
      ) {
        topActionBlockedClickTargetRef.current = null;
        return;
      }
      const blockedTarget = topActionBlockedClickTargetRef.current;
      topActionBlockedClickTargetRef.current = null;
      if (!isSuppressedScheduleClickTarget(blockedTarget, target)) return;
      // This click never reaches the page's own capture handler, which would
      // spend the same press; spend it here, or the next click is eaten too.
      suppressedScheduleClickTargetRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    document.addEventListener("click", blockOutsideTopActionClick, true);
    return () =>
      document.removeEventListener("click", blockOutsideTopActionClick, true);
  }, []);
  const [isDiscardingEditSession, setIsDiscardingEditSession] = useState(false);
  // New Schedule stays open saying "Starting…" until the edit is held.
  const [isStartingEdit, setIsStartingEdit] = useState(false);
  const [showShiftType, setShowShiftType] = usePersistentScheduleUiBoolean(
    "showShiftType",
    true,
  );
  const [showShiftLabels, setShowShiftLabels] = usePersistentScheduleUiBoolean(
    "showShiftLabels",
    true,
  );
  const [showClockTimes, setShowClockTimes] = usePersistentScheduleUiBoolean(
    "showClockTimes",
    true,
  );
  const [showTotalHours, setShowTotalHours] = usePersistentScheduleUiBoolean(
    "showTotalHours",
    false,
  );
  const [showRoleSeparators, setShowRoleSeparators] =
    usePersistentScheduleUiBoolean("showRoleSeparators", true);
  const [showPresetShiftBadges, setShowPresetShiftBadges] =
    usePersistentScheduleUiBoolean("showPresetShiftBadges", true);
  // Hides the orange marks only; approved time off, the rule box and Pre-flight stay (M10, S1).
  const [showAvailability, setShowAvailability] =
    usePersistentScheduleUiBoolean("showAvailability", true);
  const [showUnassignedShifts, setShowUnassignedShifts] = useState(true);
  const [employeeCardId, setEmployeeCardId] = useState<string | null>(null);
  const [employeeCardSection, setEmployeeCardSection] = useState<
    | "profile"
    | "employment"
    | "availability"
    | "documents"
    | "access"
    | "history"
  >("profile");
  const [documentReviewVersion, setDocumentReviewVersion] = useState(0);
  const [logoOpen, setLogoOpen] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [savingLogo, setSavingLogo] = useState(false);
  const [unassignedFrozen, setUnassignedFrozen] = useState(true);
  const [topbarDropdownOpen, setTopbarDropdownOpen] = useState(false);
  const [topbarDismissSignal, setTopbarDismissSignal] = useState(0);
  const [employeeSortMode, setEmployeeSortMode] =
    usePersistentScheduleEmployeeSortMode();
  const handleEmployeeSortModeChange = useCallback(
    (mode: ScheduleEmployeeSortMode) => {
      setEmployeeSortMode(mode);
      if (mode === "byJob") {
        setShowPresetShiftBadges(true);
        setShowRoleSeparators(true);
      }
    },
    [setEmployeeSortMode, setShowPresetShiftBadges, setShowRoleSeparators],
  );
  const lastPresetDefaultSessionIdRef = useRef<string | null>(null);
  const dismissOneScheduleLayerRef = useRef<() => boolean>(() => false);
  const suppressedScheduleClickTargetRef = useRef<Element | null>(null);
  const pendingOpsCount = pendingOps.length;
  const currentWeek = currentWeekStart(
    today,
    query.data?.week_start_day ?? "monday",
  );
  const pastWeek = Boolean(query.data && query.data.week_start < currentWeek);
  const gridEditSession =
    session && query.data && session.week_start === query.data.week_start
      ? session
      : null;
  useEffect(() => {
    if (!gridEditSession) setPresetPick(null);
  }, [gridEditSession]);
  const pendingOpsLocationIds = useMemo(() => {
    const data = query.data;
    if (!data) return [];
    const selectedIds = validIds(
      search.get("locations"),
      data.locations.map((item) => item.id),
    );
    return selectedIds.length
      ? selectedIds
      : data.locations.map((item) => item.id);
  }, [query.data, search]);
  useScheduleRealtime({
    workspaceId: context?.workspace.id ?? null,
    weekStart: query.data?.week_start ?? selectedDate,
    locationIds: pendingOpsLocationIds,
  });
  const pendingOpsQuery = usePendingOpsQuery(
    context?.workspace.id ?? null,
    query.data?.week_start ?? selectedDate,
    pendingOpsLocationIds,
    gridEditSession ? "edit" : "preview",
    gridEditSession?.source_draft_id ?? null,
  );
  useEffect(() => {
    if (!session?.id) {
      lastPresetDefaultSessionIdRef.current = null;
      return;
    }
    if (lastPresetDefaultSessionIdRef.current === session.id) return;
    lastPresetDefaultSessionIdRef.current = session.id;
    setShowPresetShiftBadges(true);
  }, [session?.id, setShowPresetShiftBadges]);
  const draftsQuery = useScheduleDrafts(
    context?.workspace.id ?? null,
    query.data?.week_start ?? selectedDate,
    { enabled: Boolean(context && query.data) },
  );
  // BL-313: the cached list is the only copy; every change writes the cache.
  const drafts = draftsQuery.data?.drafts ?? NO_DRAFTS;
  const clearMissingDraftPreview = useCallback(() => {
    setScheduleMode("preview", null);
    setOperationError(null);
  }, [setScheduleMode]);
  const previewSource = usePreviewSource({
    workspaceId: context?.workspace.id ?? null, model: query.data, modelVersion: query.dataUpdatedAt,
    activeDraftId, editSession: gridEditSession ? { id: gridEditSession.id, revision: gridEditSession.revision, sourceDraftId: gridEditSession.source_draft_id } : null,
    // The grid shows the edit as soon as it is held, a render before the mode follows.
    editing: isEditMode || Boolean(gridEditSession),
    loading: query.isFetching || query.isPlaceholderData || Boolean(activeDraftId && draftsQuery.isFetching),
    drafts: draftsQuery.data?.drafts, onMissingDraft: clearMissingDraftPreview,
  });
  const exportOpenRef = useRef(exportOpen);
  exportOpenRef.current = exportOpen;
  useEffect(() => {
    // Export shows what is on the grid; entering or leaving edit changes that, so an open Export closes.
    if (exportOpenRef.current) setNewScheduleMenuOpen(false);
  }, [isEditMode]);
  useEffect(() => {
    setNewScheduleMenuOpen(false); setSaveOpen(false);
  }, [context?.workspace.id, context?.userId]);
  const dropReview = useScheduleDropReview(context?.workspace.id, gridEditSession?.id, gridEditSession?.revision);
  const displayedPendingOps = useMemo(
    () => gridEditSession ? [...pendingOps, ...dropReview.optimisticOps] : [],
    [gridEditSession, pendingOps, dropReview.optimisticOps],
  );
  const projectedShifts = useEffectiveShifts(
    gridEditSession?.shifts ??
      (activeDraftId ? previewSource.shifts ?? [] : (query.data?.shifts ?? [])),
    displayedPendingOps,
  );
  const effectiveShifts = useMemo(() => projectedShifts.map(shift =>
    dropReview.optimisticOps.some(op => op.id === shift.pending_op_id)
      ? { ...shift, saving_state: dropReview.savingState, optimistic: true }
      : shift), [projectedShifts, dropReview.optimisticOps, dropReview.savingState]);
  const visibleSelectableShiftIds = useMemo(() => {
    if (!query.data) return [];
    // A shift the search took off the grid is not on screen to select.
    const filtered = searchScheduleModel(
      filterScheduleModel({ ...query.data, shifts: effectiveShifts }, search),
      scheduleSearchTerm(search),
      { day: view === "day" ? selectedDate : null },
    ).model;
    // A removal hidden behind its replacement is not on screen to select.
    return withoutReplacedRemovedShifts(filtered.shifts)
      .filter(
        (shift) => view === "week" || shift.scheduled_date === selectedDate,
      )
      .map((shift) => shift.id);
  }, [effectiveShifts, query.data, search, selectedDate, view]);
  usePreflightShiftFocus(preflightShiftId, Boolean(gridEditSession && preflightShiftId && visibleSelectableShiftIds.includes(preflightShiftId)), setPreflightShiftId);
  const updateDraftCache = useCallback(
    (next: ScheduleDraftList) => {
      if (!context || !query.data) return;
      queryClient.setQueryData(draftsKey(context.workspace.id, query.data.week_start), next);
    },
    [context, query.data, queryClient],
  );
  const invalidateScheduleCaches = useCallback(
    (draftId = session?.source_draft_id ?? null) => {
      if (!context || !query.data) return;
      invalidateScheduleCommitCaches({
        queryClient,
        workspaceId: context.workspace.id,
        weekStart: query.data.week_start,
      });
      clearPendingOpsCachesForDraft(
        queryClient,
        context.workspace.id,
        query.data.week_start,
        draftId,
      );
    },
    [
      context,
      query.data,
      queryClient,
      session?.source_draft_id,
    ],
  );
  // D-D3: presence follows every shown location, not just the first.
  const scheduleViewers = useScheduleViewerPresence({
    workspaceId: context?.workspace.id ?? null,
    weekStart: query.data?.week_start ?? selectedDate,
    locationIds: pendingOpsLocationIds,
    editLocationIds: gridEditSession?.location_ids,
    authUserId: account?.userId ?? context?.userId ?? null,
    mode: gridEditSession ? "edit" : "preview",
  });
  const otherScheduleViewers = useMemo(
    () =>
      scheduleViewers.filter(
        (viewer) => viewer.userId !== (account?.userId ?? context?.userId),
      ),
    [account?.userId, context?.userId, scheduleViewers],
  );
  const hasUnsavedChanges = Boolean(session?.dirty || pendingOpsCount > 0);

  useEffect(
    () => () => {
      if (pasteModeNoticeTimerRef.current !== null) {
        window.clearTimeout(pasteModeNoticeTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (pasteArmed) {
      previousPasteArmedRef.current = true;
      return;
    }
    if (!previousPasteArmedRef.current) return;
    previousPasteArmedRef.current = false;
    if (pasteModeNotice === "Paste mode off") return;
    showPasteModeNotice("Paste mode off", 500);
  }, [pasteArmed, pasteModeNotice, showPasteModeNotice]);

  useEffect(() => {
    if (!editor) {
      setEditorDirty(false);
    }
  }, [editor]);

  // Leaving the page with unsaved work asks first; closing the tab keeps the
  // browser's own warning (useScheduleLeaveGuard).
  const leaveGuard = useScheduleLeaveGuard(hasUnsavedChanges);
  // The page the person chose, held while the Save draft window is open.
  const leaveAfterSaveRef = useRef<(() => void) | null>(null);
  const [departureAfterSave, setDepartureAfterSave] = useState<(() => void) | null>(null);
  // Runs once the window has closed: a link clicked under an open window is not followed.
  useEffect(() => {
    if (!departureAfterSave || saveOpen) return;
    setDepartureAfterSave(null);
    departureAfterSave();
  }, [departureAfterSave, saveOpen]);

  const changePeriod = (days: number) => {
    const next = new URLSearchParams(search);
    next.set("date", addDays(selectedDate, days));
    next.set("view", view);
    setSearch(next);
  };
  const jumpToCurrentPeriod = () => {
    const next = new URLSearchParams(search);
    next.set("date", today);
    next.set("view", view);
    setSearch(next);
  };
  const selectScheduleDay = (
    date: string,
    locationIds: readonly string[] = [],
  ) => {
    if (view === "day") {
      if (layout === "unified") return;
      setFocusedShiftId(null);
      setQueryIds("locations", locationIds);
      return;
    }
    const next = withScheduleSearchValue(
      search,
      "locations",
      locationIds.join(",") || null,
    );
    next.set("date", date);
    next.set("view", "day");
    setSearch(next);
  };
  const setLayout = (value: "separate" | "unified") => {
    const next = new URLSearchParams(search);
    if (value === "separate") next.delete("layout");
    else next.set("layout", value);
    setSearch(next);
  };
  const toggleHideUnscheduled = () => {
    setSearch(
      withScheduleSearchValue(
        search,
        "hideUnscheduled",
        hideUnscheduled ? null : "true",
      ),
    );
  };
  const setQueryIds = (param: string, ids: readonly string[]) => {
    setSearch(withScheduleSearchValue(search, param, ids.join(",") || null));
  };
  const focusShiftBadge = (shift: ScheduleShift) => {
    // The focus is the newest filter, so Esc takes it off first.
    const next = withScheduleSearchValue(
      withScheduleSearchValue(search, "shiftTypes", shift.shift_type_id),
      "jobs",
      shift.job_id,
    );
    next.delete("employees");
    setSearch(next);
    focusFiltersRef.current = { jobs: shift.job_id, shiftTypes: shift.shift_type_id, seen: false };
    setFocusedShiftId(shift.id);
    updateSelectedIds([]);
    setPasteArmed(false);
    setShiftMenu(null);
    setCellMenu(null);
  };
  const clearPreviewFocusedShift = useCallback(() => {
    setFocusedShiftId(null);
    const nextSearch = clearFocusedShiftSearchFilters(search);
    if (nextSearch) setSearch(nextSearch);
  }, [search, setSearch]);
  const clearEditFocusedShiftSelection = useCallback(() => {
    setFocusedShiftId(null);
    updateSelectedIds([]);
    setShiftMenu(null);
    setCellMenu(null);
    const nextSearch = clearFocusedShiftSearchFilters(search);
    if (nextSearch) setSearch(nextSearch);
  }, [search, setSearch, updateSelectedIds]);

  useEffect(() => {
    const filters = focusFiltersRef.current;
    if (!focusedShiftId || !filters) return;
    const holds = (key: string, id: string | null) =>
      !id || (search.get(key)?.split(",") ?? []).includes(id);
    // The address catches up after the click; only a filter that was there and left counts.
    if (holds("jobs", filters.jobs) && holds("shiftTypes", filters.shiftTypes)) {
      filters.seen = true;
      return;
    }
    if (!filters.seen) return;
    focusFiltersRef.current = null;
    setFocusedShiftId(null);
  }, [focusedShiftId, search]);

  useEffect(() => {
    if (gridEditSession || !focusedShiftId) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!isSchedulePreviewFocusedShiftBlankDismissTarget(event.target)) {
        return;
      }
      clearPreviewFocusedShift();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [clearPreviewFocusedShift, focusedShiftId, gridEditSession]);

  useEffect(() => {
    if (!gridEditSession || (!focusedShiftId && !selectedIds.length)) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!isScheduleEditFocusedShiftBlankDismissTarget(event.target)) {
        return;
      }
      clearEditFocusedShiftSelection();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [
    clearEditFocusedShiftSelection,
    focusedShiftId,
    gridEditSession,
    selectedIds.length,
  ]);

  const refreshDrafts = async () => {
    if (!context || !query.data) return [];
    const result = await listScheduleDrafts(
      context.workspace.id,
      query.data.week_start,
    );
    updateDraftCache(result);
    return result.drafts;
  };

  // BL-394: editing starts from a fresh drafts list; if it cannot load, say so
  // plainly and stop, with the reason in the console.
  const refreshDraftsBeforeEdit = async (
    ask: Omit<DraftsAsk, "weekStart">,
  ): Promise<boolean> => {
    if (!query.data) return false;
    const weekStart = query.data.week_start;
    try {
      await refreshDrafts();
      setDraftsUnread(null);
      return true;
    } catch (error) {
      console.error(error);
      setNewScheduleMenuOpen(false);
      if (isNoAccess(error)) {
        setDraftsUnread(null);
        setOperationError("You don't have access to edit this schedule.");
      } else {
        setDraftsUnread({ ...ask, weekStart });
      }
      return false;
    }
  };

  const whileStarting = async <T,>(start: () => Promise<T>) => {
    setIsStartingEdit(true);
    try {
      return await start();
    } finally {
      setIsStartingEdit(false);
    }
  };

  const startBlankDraftFromMenu = () =>
    whileStarting(async () => {
      if (!(await refreshDraftsBeforeEdit({ source: "blank", draftId: null }))) return;
      return acquire("blank");
    });

  const previewDraftFromMenu = async (draftId: string | null) => {
    if (!context || !query.data) return;
    setOperationError(null);
    setDraftsUnread(null);
    // One cancellable source read feeds both grid and export.
    setScheduleMode("preview", draftId);
  };

  const editDraftFromMenu = (draftId: string | null) =>
    whileStarting(async () => {
      if (!(await refreshDraftsBeforeEdit({ source: "edit", draftId }))) return;
      return acquire(draftId ? "draft" : "published", draftId);
    });

  const draftsUnreadHere =
    draftsUnread && draftsUnread.weekStart === query.data?.week_start ? draftsUnread : null;

  const retryDraftsUnread = async () => {
    if (!draftsUnreadHere) return;
    setDraftsRetrying(true);
    try {
      await (draftsUnreadHere.source === "blank"
        ? startBlankDraftFromMenu()
        : editDraftFromMenu(draftsUnreadHere.draftId));
    } finally {
      setDraftsRetrying(false);
    }
  };

  // "Use" with no edit open: the picked schedule opens for editing, then the
  // window comes back at the template's Add or Replace step.
  const applyTemplateInto = async (templateId: string, target: TemplateUseTarget) => {
    setTemplateUseAfterEdit(templateId);
    const opened =
      target.kind === "blank" ? await startBlankDraftFromMenu()
        : await editDraftFromMenu(target.kind === "draft" ? target.draftId : null);
    if (!opened) setTemplateUseAfterEdit(null);
  };
  useEffect(() => {
    if (!templateUseAfterEdit || !gridEditSession) return;
    setTemplatesStep({ kind: "use", templateId: templateUseAfterEdit });
    setNewScheduleTab("templates");
    setNewScheduleMenuOpen(true);
    setTemplateUseAfterEdit(null);
  }, [gridEditSession, templateUseAfterEdit]);

  const deleteDraftFromMenu = async (draft: ScheduleDraftSummary) => {
    if (!context) return;
    setOperationError(null);
    try {
      await deleteScheduleDraft(context.workspace.id, draft.id);
      if (query.data) {
        queryClient.setQueryData(
          draftsKey(context.workspace.id, query.data.week_start),
          (current: DraftsCacheSnapshot | undefined) =>
            removeDraft(current, draft.id),
        );
      }
      invalidateScheduleCaches(draft.id);
      toast.success("Draft deleted", {
        dedupeKey: `schedule-draft-deleted:${draft.id}`,
        description: draft.name,
      });
    } catch (error) {
      setOperationError(requestErrorText(error));
    }
  };

  const openPublish = async () => {
    if (!context || !query.data) return;
    setOperationError(null);
    closeTopActionSurfaces("publish");
    try {
      setPublishDraftOverride(null);
      const result = await listScheduleDrafts(
        context.workspace.id,
        query.data.week_start,
      );
      updateDraftCache(result);
      void refreshPublicationStatus();
      if (!result.drafts.length) {
        setOperationError("Save a named draft before publishing this week.");
        return;
      }
      setPublishOpen(true);
    } catch (error) {
      setOperationError(requestErrorText(error));
    }
  };

  // Only the newest request may set the status: an older week answering late
  // must not replace the week on screen (BL-278).
  const publicationRequestIdRef = useRef(0);
  const refreshPublicationStatus = useCallback(async () => {
    const requestId = ++publicationRequestIdRef.current;
    if (!context || !query.data) {
      setPublicationStatus(null);
      return;
    }
    try {
      const status = await fetchSchedulePublicationStatus(
        context.workspace.id,
        query.data.week_start,
      );
      if (requestId === publicationRequestIdRef.current) {
        setPublicationStatus(status);
        setPublishDeadlineDay(status.schedule_deadline_day);
      }
    } catch (error) {
      if (requestId === publicationRequestIdRef.current)
        setPublicationStatus(null);
      // BL-391: a status read that fails leaves no unhandled rejection; the reason goes to the console.
      console.error(error);
    }
  }, [context, query.data]);

  // The templates list loads each time the window opens; the tab shows what is there meanwhile.
  const loadTemplates = async () => {
    if (!context || !gates.templatesRead) return;
    setTemplatesLoading(true);
    setTemplatesLoadError(false);
    try {
      setTemplates((await listScheduleTemplates(context.workspace.id)).templates);
    } catch (error) {
      // The tab says it, with Try again; an empty list would read as "No templates yet".
      console.error(error);
      setTemplatesLoadError(true);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const openNewScheduleWindow = (tab: NewScheduleTab = newScheduleTab) => {
    if (!context || !query.data) return;
    setOperationError(null);
    setTopbarDropdownOpen(false);
    setTopbarDismissSignal((current) => current + 1);
    closeTopActionSurfaces("newSchedule");
    setNewScheduleTab(tab);
    setTemplatesStep({ kind: "list" });
    setTemplatesSaving(false);
    setNewScheduleMenuOpen(true);
    // A background refresh: the window keeps the cached list, the reason goes to the console.
    void refreshDrafts().catch((error: unknown) => console.error(error));
    void loadTemplates();
  };

  const closeNewScheduleWindow = () => {
    setNewScheduleMenuOpen(false);
    setTemplatesSaving(false);
    leaveScheduleDeepLink();
  };

  const openAutoFill = async () => {
    const workspaceId = context?.workspace.id ?? query.data?.workspace_id;
    if (!workspaceId || !session) {
      setOperationError("Start editing this schedule before auto-fill.");
      return;
    }
    setOperationError(null);
    try {
      // BL-975: a lock that lapsed (the laptop slept) is picked back up first.
      setAutoFill(await runWithLease(() => previewScheduleAutoFill(workspaceId, session.id)));
    } catch (error) {
      setOperationError(scheduleEditErrorText(error));
    }
  };

  useEffect(() => {
    if (!context || !query.data || gridEditSession) {
      publicationRequestIdRef.current += 1;
      setPublicationStatus(null);
      return;
    }
    void refreshPublicationStatus();
  }, [context, gridEditSession, query.data, refreshPublicationStatus]);

  useEffect(() => {
    setPendingOps(pendingOpsQuery.data?.pending_ops ?? []);
  }, [pendingOpsQuery.data]);

  // /schedule/export and /schedule/templates open the New Schedule window at that tab, once per visit.
  const deepLinkTab: NewScheduleTab | null =
    location.pathname === `${scheduleBasePath}/export` ? "export"
      : location.pathname === `${scheduleBasePath}/templates` ? "templates" : null;
  useEffect(() => {
    if (!deepLinkTab) {
      newScheduleDeepLinkConsumed.current = null;
      return;
    }
    if (!context || !query.data || saveOpen || newScheduleDeepLinkConsumed.current === deepLinkTab) return;
    if (deepLinkTab === "templates" ? !gates.templatesRead : !canExportSchedules) return;
    // The Schedule is closed on phones; Export is a desktop tool.
    if (deepLinkTab === "export" && window.matchMedia && !window.matchMedia("(min-width: 721px)").matches) return;
    newScheduleDeepLinkConsumed.current = deepLinkTab;
    openNewScheduleWindow(deepLinkTab);
    // openNewScheduleWindow changes every render; the link is read once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, canExportSchedules, deepLinkTab, gates.templatesRead, query.data, saveOpen]);

  const leaveScheduleDeepLink = () => {
    if (deepLinkTab) navigate({ pathname: scheduleBasePath, search: location.search });
  };

  const enterEditModeWithResetFilters = useCallback(
    (
      sourceDraftId: string | null,
      preserveFilters = false,
      // An edit that holds only some locations shows only those.
      editLocationIds: readonly string[] | null = null,
    ) => {
      setFocusedShiftId(null);
      updateSelectedIds([]);
      setClipboard(null);
      setPasteArmed(false);
      setPasteModeNotice(null);
      setPasteBlockedReason(null);
      setShiftMenu(null);
      setCellMenu(null);
      setScheduleMode("edit", sourceDraftId);
      setSearch(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("mode", "edit");
          if (sourceDraftId) next.set("draft", sourceDraftId);
          else next.delete("draft");
          if (!preserveFilters) for (const param of SCHEDULE_FILTER_QUERY_PARAMS) next.delete(param);
          if (editLocationIds?.length) next.set("locations", editLocationIds.join(","));
          return next;
        },
        { replace: true },
      );
    },
    [setScheduleMode, setSearch, updateSelectedIds],
  );

  // resume: picking an edit back up (a reload in edit mode). Anything else is a
  // new edit asked for from a menu, which never brings back one that was left.
  const acquire = async (
    source: "blank" | "published" | "draft",
    draftId: string | null = null,
    preserveFilters = false,
    resume = false,
  ) => {
    if (!context || !query.data || pastWeek) return;
    // A new edit of another week closes the one held for its own week (KK-164):
    // its unsaved work is kept as an "Auto-save" draft, as on idle (S1).
    if (!resume && session && session.week_start !== query.data.week_start) {
      try {
        await setAsideEditSession();
      } catch (error) {
        setNewScheduleMenuOpen(false);
        setOperationError(requestErrorText(error));
        return;
      }
    }
    const allLocationIds = query.data.locations.map((item) => item.id);
    const filteredLocationIds = validIds(search.get("locations"), allLocationIds);
    // The filtered locations, or every location the person may edit.
    const editLocationIds = filteredLocationIds.length ? filteredLocationIds : null;
    setOperationError(null);
    const result = await acquireEditSession(
      query.data.week_start,
      source,
      draftId,
      editLocationIds,
      resume,
    );
    setNewScheduleMenuOpen(false);
    if (!result) return;
    if (result.status === "conflict") return;
    enterEditModeWithResetFilters(
      result.session.source_draft_id,
      preserveFilters,
      result.session.location_ids.length < allLocationIds.length
        ? result.session.location_ids
        : null,
    );
    return result.session;
  };

  // D-Y4: a reload (or a shared link) in edit mode picks the person's edit back up;
  // the server resumes their own open edit of this week.
  const resumeAttemptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isEditMode || !context || !query.data) return;
    const attempt = `${context.workspace.id}:${query.data.week_start}:${activeDraftId ?? ""}`;
    // An edit this page already held (then saved or discarded) is never taken again here.
    if (session) resumeAttemptRef.current = attempt;
    if (session || resumeAttemptRef.current === attempt) return;
    resumeAttemptRef.current = attempt;
    if (pastWeek || !gates.edit) {
      setScheduleMode("preview", activeDraftId);
      return;
    }
    void acquire(activeDraftId ? "draft" : "published", activeDraftId, true, true).then((resumed) => {
      if (!resumed) setScheduleMode("preview", activeDraftId);
    });
  });

  // KK-164: while editing, another week opens in view mode and the edit stays
  // open in its own week; coming back picks it up again with the same lock.
  const editWeekStart = session?.week_start;
  const editDraftId = session?.source_draft_id ?? null;
  const shownWeekStart = query.data?.week_start;
  useEffect(() => {
    if (!editWeekStart || !shownWeekStart) return;
    const ownWeek = editWeekStart === shownWeekStart;
    if (!ownWeek && isEditMode) setScheduleMode("preview", null);
    else if (ownWeek && !isEditMode) setScheduleMode("edit", editDraftId);
  }, [editDraftId, editWeekStart, isEditMode, setScheduleMode, shownWeekStart]);

  const discardEditSession = () => {
    if (!context || !session || isDiscardingEditSession) return;
    setDiscardConfirmOpen(false);
    const discardedSession = session;
    setIsDiscardingEditSession(true);
    setSession(null);
    const nextSearch = new URLSearchParams(search);
    nextSearch.set("mode", "preview");
    nextSearch.delete("draft");
    // The edited week stays on screen (QA 42).
    nextSearch.set("view", "week");
    setSearch(nextSearch, { replace: true });
    setPendingOps([]);
    updateSelectedIds([]);
    setClipboard(null);
    setPasteArmed(false);
    setPasteModeNotice(null);
    setPasteBlockedReason(null);
    void discardScheduleEditSession(context.workspace.id, discardedSession.id)
      .then(() => {
        invalidateScheduleCaches(discardedSession.source_draft_id);
        void query.refetch();
      })
      .catch((error: unknown) => {
        setOperationError(
          requestErrorText(error, "Discard cleanup failed. Refresh before editing this schedule again."),
        );
      })
      .finally(() => setIsDiscardingEditSession(false));
  };
  const requestDiscardEditSession = () => {
    if (!context || !session || isDiscardingEditSession) return;
    // Nothing to lose (no saved or in-flight change): leave edit mode without asking.
    const dropInFlight =
      dropReview.pending || dropReview.optimisticOps.length > 0;
    if (!hasUnsavedChanges && !dropInFlight) {
      discardEditSession();
      return;
    }
    setDiscardConfirmOpen(true);
  };

  // Leaving the page: the work goes, the edit closes, the chosen page opens.
  const leaveWithoutSaving = () => {
    const departure = leaveGuard.take();
    const leftDraftId = session?.source_draft_id ?? null;
    discardEditOnLeave();
    invalidateScheduleCaches(leftDraftId);
    departure?.();
  };
  // Leaving the page: the Save draft window opens on the edit's own week; once
  // the draft is saved the chosen page opens. Closing the window stays here.
  const saveBeforeLeaving = () => {
    if (!session) return;
    leaveAfterSaveRef.current = leaveGuard.take();
    if (query.data?.week_start !== session.week_start) {
      setSearch((current) => {
        const next = new URLSearchParams(current);
        next.set("date", session.week_start);
        return next;
      }, { replace: true });
    }
    setSaveOpen(true);
  };

  const saveDraftFromMenu = async (
    name: string,
    force: boolean,
    targetDraftId: string | null | undefined,
    recoveryKind: "save" | "save-and-publish" = "save",
  ) => {
    if (!context || !session) return null;
    const savingContext = currentMutationContext.current;
    const target =
      force && targetDraftId
        ? (drafts.find((item) => item.id === targetDraftId) ?? null)
        : null;
    try {
      const saved = await saveDraftWithRetroactivePrompt(name, target);
      if (!saved || currentMutationContext.current !== savingContext) return null;
      cacheSavedDraftResult({
        queryClient,
        workspaceId: context.workspace.id,
        weekStart: saved.week_start,
        previousDraftId: session.source_draft_id ?? null,
        draft: saved,
      });
      setSession(null);
      setScheduleMode("preview", saved.id);
      setPendingOps([]);
      updateSelectedIds([]);
      invalidateScheduleCaches(saved.id);
      void query.refetch();
      return saved;
    } catch (error) {
      if (currentMutationContext.current !== savingContext) return null;
      const nameConflict =
        error instanceof ScheduleRequestError
          ? parseSaveDraftNameConflict(error.body)
          : null;
      if (nameConflict) {
        const conflictTarget = nameConflict.draftId
          ? (drafts.find((item) => item.id === nameConflict.draftId) ?? null)
          : null;
        if (
          conflictTarget &&
          (await confirm({
            title: `Overwrite "${name}"?`,
            description: `This draft belongs to ${nameConflict.ownerName}. Saving replaces their version with yours.`,
            confirmLabel: "Overwrite",
            destructive: true,
          }))
        ) {
          return saveDraftFromMenu(name, true, conflictTarget.id, recoveryKind);
        }
        setOperationError(
          `"${name}" is owned by ${nameConflict.ownerName}. Choose another name or overwrite the draft from the saved drafts list.`,
        );
        return null;
      }
      // BL-1052: another tab moved the edit on; a retry would send the same old
      // revision, so the page is reloaded instead (the reload picks the edit up).
      // The Save draft window and a retry sheet left by an earlier failure close
      // too, so the banner's Reload is in reach.
      if (isEditSessionStale(error)) {
        setSaveRecovery(null);
        setOperationError(scheduleEditErrorText(error));
        setPublishMenuDismissSignal((value) => value + 1);
        setSaveOpen(false);
        leaveScheduleDeepLink();
        return null;
      }
      // BL-395: the save's own sentences for a refusal; a plain one for anything else.
      const message =
        error instanceof ScheduleRequestError && error.status > 0 && error.status < 500
          ? (getSaveDraftFailureMessage(error.body, error.message) ?? requestErrorText(error))
          : requestErrorText(error);
      setOperationError(message);
      setPublishMenuDismissSignal((value) => value + 1);
      setSaveRecovery({
        intent: { kind: recoveryKind, name, force, targetDraftId },
        retrying: false,
      });
      return null;
    }
  };

  async function saveDraftWithRetroactivePrompt(
    name: string,
    target: ScheduleDraftSummary | null,
    acknowledgePastEdits = false,
    editSession = session,
    leaseRecovered = false,
  ): Promise<ScheduleDraftSummary | null> {
    if (!context || !editSession) return null;
    const savingContext = currentMutationContext.current;
    try {
      return await saveScheduleDraft(
        context.workspace.id,
        editSession,
        name,
        target,
        acknowledgePastEdits,
      );
    } catch (error) {
      if (currentMutationContext.current !== savingContext) return null;
      // D-Y3: the lock lapsed (sleep, lost network); pick the same edit back up and save once more.
      // EKRAN-01 B3: an edit closed elsewhere ends here; opening it again would
      // set the other edit aside in turn, and saving it again cannot succeed.
      if (isEditSessionClosed(error)) {
        setOperationError(EDIT_ENDED_AWAY);
        endClosedEdit();
        return null;
      }
      if (isEditLeaseExpired(error)) {
        const live = leaseRecovered ? null : await recoverLease();
        if (!live) throw new ScreenError(EDIT_NOT_RECONNECTED);
        return saveDraftWithRetroactivePrompt(name, target, acknowledgePastEdits, live, true);
      }
      const retroactiveError = parseRetroactiveEditError(error);
      if (!retroactiveError) throw error;
      const confirmed = await promptRetroactiveEdit(
        retroactiveError.mode,
        retroactiveError.findings,
        retroactiveError.messages,
      );
      if (!confirmed || retroactiveError.mode === "blocked" || currentMutationContext.current !== savingContext) return null;
      return saveDraftWithRetroactivePrompt(name, target, true, editSession, leaseRecovered);
    }
  }

  const retrySaveRecovery = async () => {
    const intent = saveRecovery?.intent;
    if (!intent) return;
    const savingContext = currentMutationContext.current;
    setSaveRecovery((current) =>
      current ? { ...current, retrying: true } : current,
    );
    try {
      const result = await saveDraftFromMenu(
        intent.name,
        intent.force,
        intent.targetDraftId,
        intent.kind,
      );
      if (result) {
        setSaveRecovery(null);
        if (intent.kind === "save-and-publish") {
          setPublishDraftOverride(result);
          setPublishOpen(true);
        }
      }
    } finally {
      if (currentMutationContext.current === savingContext) {
        setSaveRecovery((current) =>
          current ? { ...current, retrying: false } : current,
        );
      }
    }
  };

  const keepEditingAfterSaveFailure = () => {
    setSaveRecovery(null);
  };

  const discardAfterSaveFailure = () => {
    setSaveRecovery(null); setSaveOpen(false);
    discardEditSession();
  };

  const saveDraftAndOpenPublish = async (
    name: string,
    force: boolean,
    targetDraftId: string | null | undefined,
  ) => {
    const savingContext = currentMutationContext.current;
    const saved = await saveDraftFromMenu(
      name,
      force,
      targetDraftId,
      "save-and-publish",
    );
    if (saved) {
      setSaveRecovery(null);
      setPublishDraftOverride(saved);
      setPublishOpen(true);
    } else if (currentMutationContext.current === savingContext) {
      setSaveRecovery((current) =>
        current
          ? {
              ...current,
              intent: { kind: "save-and-publish", name, force, targetDraftId },
            }
          : current,
      );
    }
    return saved;
  };

  const mutate = async (
    action: () => Promise<ScheduleEditSession>,
    onError?: (error: Error) => void,
    throwOnError = false,
  ) => {
    setOperationError(null);
    try {
      const next = await runWithLease(action);
      if (throwOnError && mutationContext !== currentMutationContext.current) return null;
      if (!isSameEditSession(mutationContext, currentMutationContext.current)) return null;
      setSession(next);
      return next;
    } catch (error) {
      if (throwOnError && mutationContext !== currentMutationContext.current) return null;
      if (!isSameEditSession(mutationContext, currentMutationContext.current)) return null;
      if (throwOnError) throw error;
      onError?.(error as Error);
      const text = scheduleEditErrorText(error);
      setOperationError(text);
      toast.error("Schedule change could not be saved", {
        dedupeKey: "schedule-change-save-failed",
        description: formatScheduleConflictMessage(text),
      });
      return null;
    }
  };

  const resolveDeleteShiftIds = (
    currentSelectedIds: readonly string[] = selectedIdsRef.current,
  ) => {
    if (!session) return [];
    return resolveScheduleDeleteShiftIds({
      selectedIds: currentSelectedIds,
      focusedShiftId,
      editableShiftIds: session.shifts.map((shift) => shift.id),
    });
  };

  const requestDeleteSelected = (
    currentSelectedIds: readonly string[] = selectedIdsRef.current,
  ) => {
    const targetShiftIds = resolveDeleteShiftIds(currentSelectedIds);
    if (!targetShiftIds.length) return false;
    setDeleteSelectionIds(targetShiftIds);
    setDeleteSelectionConfirmOpen(true);
    return true;
  };

  const removeSelected = async () => {
    if (!context || !session) return;
    setDeleteSelectionConfirmOpen(false);
    const selectedShiftIds = (
      deleteSelectionIds.length ? deleteSelectionIds : resolveDeleteShiftIds()
    ).filter((id) => session.shifts.some((shift) => shift.id === id));
    setDeleteSelectionIds([]);
    if (selectedShiftIds.length === 0) {
      updateSelectedIds([]);
      return;
    }
    const bulkResult = await mutate(async () => {
      const result = await bulkDeleteShifts(
        context.workspace.id,
        selectedShiftIds,
      );
      if (result.session) return result.session;
      let nextSession = session;
      for (const id of selectedShiftIds) {
        const shift = nextSession.shifts.find((item) => item.id === id);
        if (!shift) continue;
        nextSession = await deleteScheduleShift(
          context.workspace.id,
          nextSession,
          shift.id,
          shift.revision,
        );
      }
      return nextSession;
    });
    if (!bulkResult) return;
    updateSelectedIds((current) =>
      current.filter((id) => !selectedShiftIds.includes(id)),
    );
    if (focusedShiftId && selectedShiftIds.includes(focusedShiftId)) {
      setFocusedShiftId(null);
    }
  };

  const findEditableShift = (id: string, source = session?.shifts) =>
    source?.find((item) => item.id === id && "revision" in item) as
      ScheduleEditableShift | undefined;

  const clearPasteModeWithNotice = () => {
    setPasteArmed(false);
    showPasteModeNotice("Paste mode off", 500);
  };

  const copyShift = (
    shift: ScheduleEditableShift,
    options: { readonly armPaste?: boolean } = {},
  ) => {
    setClipboard(createShiftClipboardSnapshot(shift));
    setPasteArmed(Boolean(options.armPaste));
    setPasteBlockedReason(null);
    showPasteModeNotice(
      options.armPaste ? "Paste mode on" : "Shift copied",
      800,
    );
    toast.success("Shift copied", {
      dedupeKey: "schedule-shift-copied",
      description: options.armPaste ? "Paste mode is ready." : "Use paste mode to place it again.",
    });
  };

  const copySelectedShifts = (
    currentSelectedIds: readonly string[],
    options: { readonly armPaste?: boolean } = {},
  ) => {
    if (currentSelectedIds.length > 1) {
      toast.info("Select one shift to copy", { dedupeKey: "schedule-single-shift-copy" });
      return true;
    }
    const shift = currentSelectedIds[0] ? findEditableShift(currentSelectedIds[0]) : undefined;
    if (!shift) return false;
    copyShift(shift, options);
    return true;
  };

  const togglePasteMode = () => {
    if (!clipboard) {
      toast.warning("Copy a shift first", {
        dedupeKey: "schedule-paste-empty-clipboard",
        description: "Paste mode needs a copied shift before it can start.",
      });
      return;
    }
    const next = !pasteArmed;
    setPasteArmed(next);
    if (next) setPasteBlockedReason(null);
    showPasteModeNotice(
      next ? "Paste mode on" : "Paste mode off",
      next ? 0 : 500,
    );
    toast.info(next ? "Paste mode on" : "Paste mode off", {
      dedupeKey: "schedule-paste-mode",
      description: next
        ? "Click a schedule cell to paste the copied shift."
        : "Paste shortcuts are paused.",
    });
  };

  // S2 (KK-171): Undo takes the last step back on the server; steps saved with
  // Save draft are not undone (the save closes the edit).
  const canUndo = (gridEditSession?.undo_depth ?? 0) > 0;
  // One Undo at a time: a held Ctrl+Z would otherwise send the same revision twice.
  const undoInFlightRef = useRef(false);
  const undoLastEdit = async () => {
    if (!context || !session || !canUndo || undoInFlightRef.current) return;
    undoInFlightRef.current = true;
    try {
      const next = await mutate(
        () => undoScheduleEditSessionStep(context.workspace.id, session),
        undefined,
        true,
      );
      if (!next) return;
      // BL-998: the step could not come back and left the list; nothing changed on the grid.
      if (next.undo_refused) {
        toast.warning("Last edit can't come back", {
          dedupeKey: "schedule-undo-refused",
          description: undoRefusedText(next.undo_refused.reason),
        });
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: ["schedule-pending-ops", context.workspace.id, next.week_start],
      });
      toast.success("Last edit undone", {
        dedupeKey: "schedule-undo-last-edit",
        description: "The draft returned to the previous edit state.",
      });
    } catch (error) {
      // Nothing left on the server: the button simply fades.
      if (isNothingToUndo(error)) {
        setSession((current) => (current ? { ...current, undo_depth: 0 } : current));
        return;
      }
      // The server refused the step (a rule that applies now, or the edit moved on):
      // nothing changed, and the person reads one plain sentence.
      // BL-1000: another tab moved the edit on; the step itself is fine.
      const message = isEditSessionStale(error)
        ? UNDO_SESSION_STALE_TEXT
        : error instanceof ScheduleRequestError && error.status >= 400 && error.status < 500
          ? "This step can no longer be undone."
          : requestErrorText(error);
      setOperationError(message);
      toast.error("Last edit could not be undone", {
        dedupeKey: "schedule-undo-failed",
        description: message,
      });
    } finally {
      undoInFlightRef.current = false;
    }
  };

  // A shift on a preference or under a manager's note: one short notice with Undo.
  const announceAssignment = useScheduleAssignNotice(query.data, session?.revision, () => undoLastEdit());

  const deleteShiftById = async (id: string) => {
    if (!context || !session) return;
    const shift = findEditableShift(id);
    if (!shift) return;
    await mutate(() =>
      deleteScheduleShift(
        context.workspace.id,
        session,
        shift.id,
        shift.revision,
      ),
    );
    updateSelectedIds((current) => current.filter((item) => item !== id));
  };

  const restoreShiftById = async (id: string) => {
    if (!context || !session) return;
    const shift = findEditableShift(id);
    if (!shift) {
      toast.error("Shift could not be restored", {
        dedupeKey: `schedule-shift-restore-missing:${id}`,
        description: "The staged shift was not found.",
      });
      return;
    }
    const next = await mutate(() =>
      restoreScheduleShift(
        context.workspace.id,
        session,
        shift.id,
        shift.revision,
      ),
    );
    if (next) {
      toast.success("Shift restored", {
        dedupeKey: `schedule-shift-restored:${id}`,
        description: "The shift is back in the draft.",
      });
    }
  };

  const openShiftContextMenu = (
    shift: ScheduleEditableShift,
    event: MouseEvent<HTMLElement>,
  ) => {
    if (!gridEditSession) return;
    event.preventDefault();
    event.stopPropagation();
    updateSelectedIds((current) =>
      current.includes(shift.id) ? current : [shift.id],
    );
    setCellMenu(null);
    setShiftMenu({
      shiftId: shift.id,
      x: event.clientX,
      y: event.clientY,
      publicationState: publicationStateForShift(shift),
    });
  };

  const openCellContextMenu = (
    target: Omit<CellContextMenuTarget, "x" | "y">,
    event: MouseEvent<HTMLElement>,
  ) => {
    if (!gridEditSession) return;
    event.preventDefault();
    event.stopPropagation();
    setShiftMenu(null);
    setCellMenu({ ...target, x: event.clientX, y: event.clientY });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const currentSelectedIds = selectedIdsRef.current;
      if (isTextEditingTarget(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        dismissOneScheduleLayerRef.current();
        return;
      }
      // BL-1003: while the shift window or another window is open, the grid's
      // shortcuts wait; Ctrl+Z there must not undo an edit behind it.
      if (editor || isScheduleLayerTarget(event.target)) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "a" &&
        isScheduleSurfaceTarget(event.target)
      ) {
        event.preventDefault();
        event.stopPropagation();
        window.getSelection?.()?.removeAllRanges();
        if (gridEditSession && visibleSelectableShiftIds.length) {
          updateSelectedIds(visibleSelectableShiftIds);
        }
        return;
      }
      if (event.key === "Delete") {
        if (!gridEditSession) return;
        if (!requestDeleteSelected(currentSelectedIds)) return;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        canUndo
      ) {
        if (!gridEditSession) return;
        event.preventDefault();
        event.stopPropagation();
        void undoLastEdit();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        if (!gridEditSession) return;
        event.preventDefault();
        event.stopPropagation();
        togglePasteMode();
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "c" &&
        currentSelectedIds.length
      ) {
        if (!copySelectedShifts(currentSelectedIds, { armPaste: true })) return;
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handleCopy = (event: ClipboardEvent) => {
      if (!gridEditSession || editor || isScheduleLayerTarget(event.target)) return;
      const currentSelectedIds = selectedIdsRef.current;
      if (isTextEditingTarget(event.target) || !currentSelectedIds.length)
        return;
      if (!copySelectedShifts(currentSelectedIds, { armPaste: true })) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const handlePaste = (event: ClipboardEvent) => {
      if (!gridEditSession || editor || isScheduleLayerTarget(event.target)) return;
      if (isTextEditingTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      togglePasteMode();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("copy", handleCopy);
    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("copy", handleCopy);
      window.removeEventListener("paste", handlePaste);
    };
  }, [
    clipboard,
    copySelectedShifts,
    editor,
    findEditableShift,
    removeSelected,
    requestDeleteSelected,
    selectedIds,
    gridEditSession,
    togglePasteMode,
    undoLastEdit,
    canUndo,
    visibleSelectableShiftIds,
  ]);

  useEffect(() => {
    if (!selectedIds.length && !pasteArmed && !shiftMenu && !cellMenu) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".schedule-page")) return;
      if (pasteArmed && target.closest("[data-drop-cell='true']")) return;
      if (isScheduleInteractionSurface(target)) return;
      updateSelectedIds([]);
      if (pasteArmed) clearPasteModeWithNotice();
      setShiftMenu(null);
      setCellMenu(null);
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [cellMenu, pasteArmed, selectedIds.length, shiftMenu]);

  const requestCloseEditor = useCallback(() => {
    blurScheduleEditorActivationTarget();
    setEditorDirty(false);
    setEditor(null);
  }, []);
  const dismissEditorFromBlankSurface = useCallback(
    (target?: Element) => {
      if (target && isScheduleSurfaceTarget(target)) {
        suppressedScheduleClickTargetRef.current = target;
      }
      requestCloseEditor();
    },
    [requestCloseEditor],
  );
  const activeEditorTarget = editor
    ? editor.mode === "edit"
      ? {
          locationId: editor.shift.location_id,
          employeeId: editor.shift.employee_id,
          date: editor.shift.scheduled_date,
          shiftId: editor.shift.id,
        }
      : {
          locationId: editor.locationId,
          employeeId: editor.employeeId,
          date: editor.date,
          shiftId: null,
        }
    : null;

  const exportSnapshot = useMemo<SnapshotResult>(() => {
    if (!exportOpen) return { status: "blocked", reason: "source" };
    if (!query.data || !context) return { status: "blocked", reason: "loading" };
    return createScheduleExportSnapshot({
      // The edit's saved-but-unpublished steps (pending ops) are part of the grid and go into the export.
      // Only a step still on its way to the server (a drop being saved) is not there yet; Export waits for that.
      loading: previewSource.loading || dropReview.optimisticOps.length > 0,
      requestedSourceKey: previewSource.requestedKey, resolvedSourceKey: previewSource.resolvedKey,
      // An open edit exports its own rows, as the server holds and checks them. Its pending
      // steps are those same rows listed again, so they are not laid over them a second time.
      source: previewSource.source, model: { ...query.data, shifts: gridEditSession?.shifts ?? effectiveShifts },
      workspaceName: context.workspace.name, selectedDate, view, search, focusedShiftId,
      display: { layout, employeeSortMode, hideUnscheduled, showShiftType, showShiftLabels, showClockTimes,
        showUnassignedShifts, showRoleSeparators, showTotalHours },
    });
  }, [exportOpen, query.data, context, previewSource.loading, previewSource.source, dropReview.optimisticOps.length, previewSource.requestedKey,
    previewSource.resolvedKey, gridEditSession?.shifts, effectiveShifts, selectedDate, view, search, focusedShiftId, layout,
    employeeSortMode, hideUnscheduled, showShiftType, showShiftLabels, showClockTimes,
    showUnassignedShifts, showRoleSeparators, showTotalHours]);

  // BL-193: the reason a read failed goes to the console, never onto the screen.
  useEffect(() => {
    if (query.error && !isNoAccess(query.error)) console.error(query.error);
  }, [query.error]);

  // Loading and error in the "B" look (Mert 2026-10-14): never the server's sentence.
  if (query.isPending)
    return (
      <section className="schedule-page" aria-label="Schedule">
        <ScheduleGridOutline />
      </section>
    );
  if (query.isError && (!query.data || isNoAccess(query.error)))
    return isNoAccess(query.error) ? (
      <NoAccessState
        homeHref={noAccessHomePath(context, scheduleBasePath)}
      />
    ) : (
      // BL-392: a week that cannot be read keeps its way out. The navigation
      // works from the date in the address; nothing here needs the failed read.
      <section className="schedule-page" aria-label="Schedule">
        <header className="schedule-topbar" data-schedule-top-bar>
          <div className="schedule-command-group">
            <ScheduleViewModeControls
              viewModeLabel={view === "day" ? "Daily view" : "Weekly view"}
              viewModeTitle={view === "day" ? "Jump to today" : "Jump to this week"}
              // The week's first day and the "not this week" cue use the
              // page's own default start day while the settings are unread
              // (BL-451, BL-457).
              periodLabel={
                view === "day"
                  ? formatPeriod(selectedDate, selectedDate, "day")
                  : `Week of ${new Date(`${currentWeekStart(selectedDate, "monday")}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`
              }
              returnCue={
                view === "day"
                  ? selectedDate !== today
                  : currentWeekStart(selectedDate, "monday") !== currentWeek
              }
              onToggleViewMode={jumpToCurrentPeriod}
              onPrevious={() => changePeriod(view === "day" ? -1 : -7)}
              onNext={() => changePeriod(view === "day" ? 1 : 7)}
            />
          </div>
        </header>
        <LoadError
          title="We couldn't load Schedule"
          detail="This week's shifts didn't load. Nothing was changed."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      </section>
    );

  const model = { ...query.data, shifts: effectiveShifts };
  const draftUnread = Boolean(activeDraftId && !gridEditSession && previewSource.error);
  const draftLoading = Boolean(activeDraftId && !gridEditSession && !previewSource.error && previewSource.shifts === null);
  // The rule box after a drop names the rules that ask; the employee's own mark
  // and a manager's note never do (KARARLAR "Müsaitlik tercih" 3, M12).
  const dropReviewMessages = dropReview.review
    ? [...new Set(dropReview.review.assessments.flatMap((assessment) => (assessment?.reasons ?? [])
      .filter((reason) => reason.code !== "availability" && reason.code !== "note")
      .map((reason) => formatScheduleConflictMessage(reason.message))))]
    : [];
  const sortedModel = createSortedScheduleModel(model, employeeSortMode);
  const publishDrafts = publishDraftOverride
    ? [
        ...drafts.filter((draft) => draft.id !== publishDraftOverride.id),
        publishDraftOverride,
      ]
    : drafts;
  const openPasteEditor = (
    locationId: string,
    employeeId: string | null,
    date: string,
    _point?: { readonly x: number; readonly y: number },
  ) => {
    if (!clipboard || dropReview.pending || dropReview.review) return;
    const clipboardSnapshots = [clipboard];
    const pasteInputs = [applyShiftClipboardSnapshot(clipboard, {
      locationId,
      employeeId,
      date,
    })];
    const validationShifts: ScheduleShift[] = [...model.shifts];
    const conflictEntry = pasteInputs
      .map((pasteInput, index) => {
        const conflictReasons = evaluateScheduleShiftConflicts(
          model,
          validationShifts,
          pasteInput,
          null,
        ).filter(reason => scheduleConflictSeverity(reason) === "block");
        validationShifts.push(
          scheduleShiftFromPasteInput(
            pasteInput,
            clipboardSnapshots[index]?.id ?? `clipboard-${index}`,
          ),
        );
        return {
          conflictReasons,
          snapshot: clipboardSnapshots[index],
        };
      })
      .find((entry) => entry.conflictReasons.length > 0);
    if (conflictEntry) {
      const firstReason = conflictEntry.conflictReasons[0];
      const firstMessage = firstReason
        ? formatScheduleConflictMessage(firstReason)
        : "Scheduling policy blocks this assignment.";
      setPasteBlockedReason(firstMessage);
      setShiftConflictMessages(conflictEntry.conflictReasons);
      setPasteConflictContext(
        formatSchedulePasteConflictContext(model, {
          snapshot: conflictEntry.snapshot,
          employeeId,
          locationId,
          date,
        }),
      );
      toast.error("Paste blocked", {
        dedupeKey: "schedule-paste-blocked-conflict",
        description:
          "This shift was not pasted. Review the conflict before scheduling it.",
      });
      return;
    }
    setPasteBlockedReason(null);
    setShiftConflictMessages([]);
    setPasteConflictContext(null);
    if (!context || !session) return;
    const idempotencyKey = crypto.randomUUID();
    dropReview.startBatch({
      inputs: pasteInputs,
      save: async inputs => {
        const next = await mutate(() => createScheduleShifts(context.workspace.id, session, inputs, idempotencyKey));
        if (next && !announceAssignment(inputs, "add", next)) {
          toast.success(inputs.length === 1 ? "Shift pasted" : "Shifts pasted", {
            dedupeKey: "schedule-shifts-pasted",
            description:
              inputs.length === 1
                ? "The copied shift was added to the draft."
                : `${inputs.length} copied shifts were added to the draft.`,
          });
        }
        return Boolean(next);
      },
    });
  };
  // "Tue, Oct 20, 2026" fits the date button's fixed width (S-228).
  const periodLabel =
    view === "day"
      ? `${formatWeekdayDate(selectedDate)}, ${selectedDate.slice(0, 4)}`
      : formatPeriod(selectedDate, model.week_start, view);
  const isCurrentViewPeriod =
    view === "day" ? selectedDate === today : model.week_start === currentWeek;
  const selectedLocationIds = validIds(
    search.get("locations"),
    model.locations.map((item) => item.id),
  );
  const selectedShiftTypeIds = validIds(
    search.get("shiftTypes"),
    model.shift_types.map((item) => item.id),
  );
  const selectedJobIds = validIds(
    search.get("jobs"),
    model.jobs.map((item) => item.id),
  );
  const selectedEmployeeIds = validIds(
    search.get("employees"),
    sortedModel.employees.map((item) => item.id),
  );
  const filterChips = createScheduleFilterChips({
    locations: model.locations,
    shiftTypes: model.shift_types,
    jobs: model.jobs,
    employees: sortedModel.employees,
    selectedLocationIds,
    selectedShiftTypeIds,
    selectedJobIds,
    selectedEmployeeIds,
    setQueryIds,
  });
  const publicationChipStatuses = createLocationPublicationChipStatuses(
    model.locations,
    gridEditSession?.shifts ?? model.shifts,
    publicationStatus,
  );
  const hasPublishedSchedule = publicationChipStatuses.some(
    (item) => item.status === "published",
  );
  const canPublishSchedule =
    gates.publish && !pastWeek;
  const publishDisabledInBlankPreview =
    canPublishSchedule &&
    !gridEditSession &&
    !activeDraftId &&
    !hasPublishedSchedule;
  const publishActionTone = getSchedulePublicationActionTone(
    publicationChipStatuses,
  );
  const publishedScheduleSummary = publicationStatus?.locations.find(
    (item) => item.status === "published" && item.published_at,
  );
  const calendarMarkers = createScheduleCalendarMarkers(
    calendarPosts,
    selectedLocationIds.length
      ? selectedLocationIds
      : model.locations.map((item) => item.id),
  );
  const changeView = (nextView: "day" | "week") => {
    if (nextView === view) return;
    const next = new URLSearchParams(search);
    next.set(
      "date",
      viewSwitchDate({
        to: nextView,
        selectedDate,
        weekStart: model.week_start,
        currentWeek,
        today,
      }),
    );
    next.set("view", nextView);
    setSearch(next);
  };
  // S-228 (3): the search narrows the grid (ScheduleGrid); here it says when
  // no one is left, and whether someone is behind a filter.
  const searchTerm = scheduleSearchTerm(search);
  const searchDay = view === "day" ? selectedDate : null;
  const searchFindsNoOne = Boolean(searchTerm) &&
    searchScheduleModel(filterScheduleModel(sortedModel, search), searchTerm, { day: searchDay })
      .model.employees.length === 0;
  const searchMatchesOutsideFilters = searchFindsNoOne &&
    searchScheduleModel(filterScheduleModel(sortedModel, new URLSearchParams()), searchTerm, { day: searchDay })
      .model.employees.length > 0;
  const setSearchQuery = (value: string) => {
    setSearch(
      (current) => withScheduleSearchValue(current, "q", value.trim() ? value : null),
      { replace: true },
    );
  };
  const showAllFilters = () => {
    const next = new URLSearchParams(search);
    for (const param of ["locations", "shiftTypes", "jobs", "employees"]) next.delete(param);
    setSearch(next);
  };
  const dismissOpenTopbarDropdown = (): boolean => {
    if (!topbarDropdownOpen) return false;
    setTopbarDropdownOpen(false);
    setTopbarDismissSignal((current) => current + 1);
    return true;
  };
  const dismissOneScheduleLayer = (
    preserveMatchingLocationHeader = false,
    preserveSearchFilters = false,
  ): boolean => {
    if (dismissOpenTopbarDropdown()) {
      return true;
    }
    if (topActionSurfaceOpen) {
      closeTopActionSurfaces();
      return true;
    }
    // Read from the router, not window.location: this function is reassigned
    // every render, so these params are always the current ones.
    const liveSearch = new URLSearchParams(search);
    if (conflict) {
      setConflict(null);
      return true;
    }
    if (publishOpen) {
      setPublishOpen(false);
      return true;
    }
    if (unpublishOpen) {
      if (!isUnpublishing) setUnpublishOpen(false);
      return true;
    }
    if (autoFill) {
      setAutoFill(null);
      return true;
    }
    if (saveOpen) {
      if (saveBusy) return true;
      setSaveOpen(false);
      return true;
    }
    if (logoOpen) {
      setLogoOpen(false);
      return true;
    }
    if (employeeCardId) {
      setEmployeeCardId(null);
      return true;
    }
    if (editor) {
      blurScheduleEditorActivationTarget();
      setEditorDirty(false);
      setEditor(null);
      setShiftMenu(null);
      setCellMenu(null);
      return true;
    }
    if (shiftMenu || cellMenu) {
      setShiftMenu(null);
      setCellMenu(null);
      return true;
    }
    if (pasteArmed || selectedIdsRef.current.length) {
      if (pasteArmed) clearPasteModeWithNotice();
      updateSelectedIds([]);
      return true;
    }
    if (
      preserveMatchingLocationHeader &&
      newestScheduleFilterKey(liveSearch) === "locations"
    ) {
      return false;
    }
    if (preserveSearchFilters) return false;
    const dismissal = dismissNextScheduleSearchLayer({
      search: liveSearch,
      modelWeekStart: model.week_start,
      currentWeekStart: currentWeek,
      today,
      focusedShift: Boolean(focusedShiftId),
    });
    if (!dismissal) return false;
    setSearch(dismissal.search);
    if (dismissal.clearFocusedShift) setFocusedShiftId(null);
    return true;
  };
  dismissOneScheduleLayerRef.current = dismissOneScheduleLayer;
  const dismissFromBlankScheduleSurface = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest("[data-schedule-export-v2]")) return;
    if (
      topActionSurfaceOpen &&
      isTopActionOutsidePress(target)
    ) {
      closeTopActionSurfaces();
      suppressedScheduleClickTargetRef.current = target;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      return;
    }
    if (
      (event.ctrlKey || event.metaKey || event.shiftKey) &&
      target.closest("[data-shift-badge='true']")
    ) {
      return;
    }
    if (pasteArmed && isScheduleGridCellActivationTarget(target)) return;
    if (!isBlankScheduleDismissTarget(target)) return;
    const preserveMatchingLocationHeader =
      isMatchingScheduleLocationHeaderTarget(target, selectedLocationIds);
    const preserveSearchFilters = isScheduleGridCellActivationTarget(target);
    if (
      !dismissOneScheduleLayer(
        preserveMatchingLocationHeader,
        preserveSearchFilters,
      )
    ) {
      return;
    }
    suppressedScheduleClickTargetRef.current = target;
    event.preventDefault();
    event.stopPropagation();
  };
  const consumeDismissedScheduleClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(`${SCHEDULE_WINDOW_SELECTOR}, [data-schedule-export-v2]`)) {
      suppressedScheduleClickTargetRef.current = null;
      return;
    }
    if (
      (event.ctrlKey || event.metaKey || event.shiftKey) &&
      target.closest("[data-shift-badge='true']")
    ) {
      suppressedScheduleClickTargetRef.current = null;
      return;
    }
    const suppressedTarget = suppressedScheduleClickTargetRef.current;
    suppressedScheduleClickTargetRef.current = null;
    if (!isSuppressedScheduleClickTarget(suppressedTarget, target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
  };
  const dismissOpenSurfaceBeforeGridActivation = (): boolean => {
    if (topActionSurfaceOpen) {
      closeTopActionSurfaces();
      return true;
    }
    return false;
  };
  const cellPresetItems =
    gridEditSession &&
    employeeSortMode === "byJob" &&
    showRoleSeparators &&
    showPresetShiftBadges
      ? buildCellPresetMenuItems(model, cellMenu)
      : [];
  // PRESET-SAAT (KARARLAR S-183, variant A): a preset writes one of its shift
  // type's saved times and the card shows it. One time: placed at once.
  // Several: a small list beside the cell; the picked time is written.
  const placePresetShift = (target: PresetCreateTarget, hours: PresetHours): void => {
    // Checked with the hours being written, not the type's primary ones.
    const validation = validatePresetCreateTarget(model, withPresetHours(target, hours));
    if (!validation.allowed) {
      toast.error("Preset shift is unavailable", {
        dedupeKey: "schedule-preset-shift-unavailable",
        description: validation.reason,
      });
      toast.info("Preset shift context", {
        dedupeKey: "schedule-preset-shift-context",
        description: formatPresetCreateContext(model, target),
      });
      return;
    }
    if (!context || !gridEditSession) return;
    const input = presetDropInput(model, target, hours);
    dropReview.start({
      input,
      // The card shows the moment it lands; the save follows, as a copied shift's does.
      optimisticOp: createOptimisticPendingOp({ locationId: target.locationId, weekStart: gridEditSession.week_start, opType: "create", targetShiftId: null,
        draftId: gridEditSession.source_draft_id, payload: input, actorUserId: gridEditSession.holder_user_id }),
      save: async (next) => {
        const saved = await mutate(() => createScheduleShift(context.workspace.id, gridEditSession, next), undefined, true);
        announceAssignment([next], "add", saved);
        return Boolean(saved);
      },
    });
  };
  const openPresetCreateTarget = (target: PresetCreateTarget): void => {
    const options = presetTimeOptions(model, target);
    if (!context || !gridEditSession || !options.length) {
      setEditor({
        mode: "create",
        locationId: target.locationId,
        employeeId: target.employeeId,
        date: target.date,
        preset: target.preset,
        x: target.point?.x,
        y: target.point?.y,
      });
      return;
    }
    if (options.length === 1) {
      placePresetShift(target, options[0]!);
      return;
    }
    setPresetPick({ target, cell: presetPickCellAt(target.point) });
  };
  const templatesTab: NewScheduleWindowProps["templates"] = gates.templatesRead && context ? {
    templates,
    loading: templatesLoading,
    loadError: templatesLoadError,
    onRetry: () => void loadTemplates(),
    canManage: gates.templates,
    drafts,
    session: gridEditSession ?? null,
    departments: model.departments,
    saving: templatesSaving,
    onSavingChange: setTemplatesSaving,
    draftOnScreen: activeDraftId,
    step: templatesStep,
    onStepChange: setTemplatesStep,
    canStartEdit: gates.edit && !pastWeek && !gridEditSession && !isDiscardingEditSession,
    onUseInto: (templateId, target) => void applyTemplateInto(templateId, target),
    onCreate: (draftId, name, stripAssignments) =>
      createScheduleTemplate(context.workspace.id, draftId, name, stripAssignments).then((result) => {
        toast.success("Template saved", { dedupeKey: "schedule-template-saved", description: name });
        setTemplates((items) => [...items, result.template]);
      }),
    onRename: (template, name) =>
      renameScheduleTemplate(context.workspace.id, template.id, name, template.revision).then((result) => {
        toast.success("Template renamed", { dedupeKey: `schedule-template-renamed:${template.id}`, description: name });
        setTemplates((items) => items.map((item) => (item.id === template.id ? result.template : item)));
      }),
    onDelete: (template) =>
      deleteScheduleTemplate(context.workspace.id, template.id, template.revision)
        .then(() => {
          toast.success("Template deleted", { dedupeKey: `schedule-template-deleted:${template.id}`, description: template.name });
          setTemplates((items) => items.filter((item) => item.id !== template.id));
        })
        .catch((error: unknown) => {
          toast.error("Template could not be deleted", {
            dedupeKey: `schedule-template-delete-failed:${template.id}`,
            description: templateMutationError(error, "delete"),
          });
          throw error;
        }),
    onPreviewReplace: (templateId, departmentKeys) =>
      gridEditSession
        ? previewScheduleTemplateApply(context.workspace.id, gridEditSession.id, templateId, departmentKeys)
            .then((preview) => preview.removed_shift_count)
        : Promise.reject(new Error("No edit is open")),
    onApply: (templateId, mode, departmentKeys) =>
      gridEditSession
        ? runWithLease(() => applyScheduleTemplate(context.workspace.id, gridEditSession, templateId, mode, departmentKeys))
            .then((result) => {
              const templateName = templates.find((item) => item.id === templateId)?.name ?? "Template";
              // Archived labels left off: same toast, warning tone (BL-197).
              (result.skipped.length ? toast.warning : toast.success)("Template applied", {
                dedupeKey: `schedule-template-applied:${templateId}`,
                description: templateAppliedDescription(templateName, result),
              });
              setSession(result.session);
              setTemplatesStep({ kind: "list" });
              closeNewScheduleWindow();
            })
            .catch((error: unknown) => {
              toast.error("Template could not be applied", {
                dedupeKey: `schedule-template-apply-failed:${templateId}`,
                description: "Refresh the draft, then try again.",
              });
              throw staleEditAsScreenError(error);
            })
        : Promise.resolve(),
  } : null;
  const topBarActions = (
    <>
      {gates.edit || gates.templatesRead || canExportSchedules ? (
        <NewScheduleWindow
          open={newScheduleMenuOpen}
          tab={newScheduleTab}
          onOpenChange={(open) => (open ? openNewScheduleWindow() : closeNewScheduleWindow())}
          onTabChange={(tab) => {
            setNewScheduleTab(tab);
            setTemplatesSaving(false);
          }}
          tabs={{ schedules: gates.edit, templates: gates.templatesRead, export: canExportSchedules && !isDiscardingEditSession }}
          triggerLabel={drafts.find((draft) => draft.id === activeDraftId)?.name ?? "New Schedule"}
          topActionId="new-schedule"
          weekStart={model.week_start}
          drafts={drafts}
          publishedFacts={draftsQuery.data?.published ?? null}
          publishedSchedule={
            publishedScheduleSummary?.published_at
              ? {
                  published_at: publishedScheduleSummary.published_at,
                  published_by_name: publishedScheduleSummary.published_by_name,
                  source_draft_id: publishedScheduleSummary.source_draft_id,
                  source_draft_name: publishedScheduleSummary.source_draft_name,
                }
              : null
          }
          activeDraftId={activeDraftId}
          editing={Boolean(gridEditSession)}
          editingName={
            gridEditSession
              ? (drafts.find((draft) => draft.id === gridEditSession.source_draft_id)?.name ??
                (gridEditSession.source_kind === "published" ? "the live schedule" : null))
              : null
          }
          canEditPublishedSchedule={
            !pastWeek &&
            model.locations.some((location) => location.publication_status === "published")
          }
          canManageDrafts={!pastWeek && !gridEditSession}
          canStartDraft={!pastWeek && !gridEditSession && !isDiscardingEditSession}
          isStartingDraft={isStartingEdit}
          readOnlyNote={pastWeek ? "Past week: you can view it, not edit it." : null}
          disableDeleteDraftId={gridEditSession?.source_draft_id ?? null}
          onPreviewDraft={(draftId) => void previewDraftFromMenu(draftId)}
          onEditDraft={(draftId) => void editDraftFromMenu(draftId)}
          onStartBlankDraft={() => void startBlankDraftFromMenu()}
          onEditPublishedSchedule={() => void editDraftFromMenu(null)}
          onDeleteDraft={(draft) => void deleteDraftFromMenu(draft)}
          onUnpublishSchedule={
            canUnpublishSchedule(canPublishSchedule, hasPublishedSchedule)
              ? () => setUnpublishOpen(true)
              : undefined
          }
          templates={templatesTab}
          exportPane={
            exportOpen && context ? (
              <ExportController key={`${context.userId}:${context.workspace.id}`} userId={context.userId}
                workspaceId={context.workspace.id} result={exportSnapshot}
                canManageLocations={gates.manageLocations} sourceError={previewSource.error} />
            ) : null
          }
        />
      ) : null}
      {gridEditSession && !isDiscardingEditSession ? (
        <SaveDraftMenu
          drafts={drafts}
          activeDraftId={gridEditSession.source_draft_id}
          activeDraftName={
            drafts.find((item) => item.id === gridEditSession.source_draft_id)
              ?.name ?? null
          }
          publishedSchedule={
            publishedScheduleSummary?.published_at
              ? {
                  published_at: publishedScheduleSummary.published_at,
                  published_by_name: publishedScheduleSummary.published_by_name,
                  source_draft_id: publishedScheduleSummary.source_draft_id,
                  source_draft_name: publishedScheduleSummary.source_draft_name,
                }
              : null
          }
          isWorkingCopy={gridEditSession.source_kind === "published"}
          trigger={
            <button
              type="button"
              className={`schedule-publish-action ${SCHEDULE_ACTION_BUTTON_CLASS}`}
              data-schedule-top-action-trigger={
                canPublishSchedule ? "publish" : "save-draft"
              }
              data-publication-tone={publishActionTone}
              aria-expanded={publishMenuOpen}
            >
              {canPublishSchedule ? (
                <>
                  <Send size={15} aria-hidden /> Publish
                </>
              ) : (
                <>
                  <Save size={15} aria-hidden /> Save draft
                </>
              )}
            </button>
          }
          onBeforeOpen={() => closeTopActionSurfaces("publish")}
          onOpenChange={setPublishMenuOpen}
          dismissSignal={publishMenuDismissSignal}
          onSaveDraft={saveDraftFromMenu}
          onSaveAndPublish={saveDraftAndOpenPublish}
        />
      ) : null}
      {!gridEditSession && !isDiscardingEditSession && canPublishSchedule ? (
        hasPublishedSchedule ? (
          <div className="schedule-action-menu">
            <button
              className={`schedule-published-indicator ${SCHEDULE_ACTION_BUTTON_CLASS}`}
              data-schedule-top-action-trigger="published"
              data-publication-tone={publishActionTone}
              type="button"
              aria-expanded={publishMenuOpen}
              onClick={() => {
                const nextOpen = !publishMenuOpen;
                closeTopActionSurfaces();
                setPublishMenuOpen(nextOpen);
              }}
            >
              <Check size={15} aria-hidden /> Published
            </button>
            {publishMenuOpen ? (
              <div className="schedule-action-menu-panel schedule-published-menu-panel">
                <button
                  type="button"
                  onClick={() => {
                    setPublishMenuOpen(false);
                    void openPublish();
                  }}
                >
                  <Send size={14} aria-hidden /> Publish another draft
                </button>
                <button
                  type="button"
                  data-tone="danger"
                  onClick={() => {
                    setPublishMenuOpen(false);
                    setUnpublishOpen(true);
                  }}
                >
                  <Undo2 size={14} aria-hidden /> Unpublish schedule
                </button>
              </div>
            ) : null}
          </div>
        ) : publishDisabledInBlankPreview ? (
          // BL-308: no draft open and nothing live. The button stays reachable
          // and says what to do first instead of going silent.
          <Tooltip
            unstyled
            label="Publish"
            content={
              drafts.length
                ? "Open a saved draft from New Schedule before publishing this week."
                : "Save a named draft before publishing this week."
            }
            className={`schedule-publish-action ${SCHEDULE_ACTION_BUTTON_CLASS}`}
            aria-disabled="true"
            data-schedule-top-action-trigger="publish"
            data-publication-tone={publishActionTone}
          >
            <Send size={15} aria-hidden /> Publish
          </Tooltip>
        ) : (
          <button
            className={`schedule-publish-action ${SCHEDULE_ACTION_BUTTON_CLASS}`}
            data-schedule-top-action-trigger="publish"
            data-publication-tone={publishActionTone}
            type="button"
            onClick={() => void openPublish()}
          >
            <Send size={15} aria-hidden /> Publish
          </button>
        )
      ) : null}
    </>
  );
  const submitLogo = async (draft: ScheduleLogoSaveDraft): Promise<void> => {
    if (!context) return;
    setSavingLogo(true);
    setLogoError(null);
    try {
      await saveScheduleLogo(context.workspace.id, draft);
      await refresh();
      setLogoOpen(false);
    } catch (error) {
      setLogoError(scheduleLogoErrorText(error));
    } finally {
      setSavingLogo(false);
    }
  };
  return (
    <section
      className="schedule-page"
      aria-labelledby="schedule-title"
      onPointerDownCapture={dismissFromBlankScheduleSurface}
      onPointerCancelCapture={() => {
        suppressedScheduleClickTargetRef.current = null;
      }}
      onClickCapture={consumeDismissedScheduleClick}
    >
      <ScheduleTopBar
        weekLabel={periodLabel}
        selectedDate={selectedDate}
        view={view}
        weekStartDate={model.week_start}
        weekStartDay={model.week_start_day}
        today={today}
        calendarMarkers={calendarMarkers}
        layout={layout}
        onLayoutChange={setLayout}
        onPreviousViewPeriod={() => changePeriod(view === "day" ? -1 : -7)}
        onNextViewPeriod={() => changePeriod(view === "day" ? 1 : 7)}
        onCurrentViewPeriodClick={jumpToCurrentPeriod}
        isCurrentViewPeriod={isCurrentViewPeriod}
        onViewChange={changeView}
        onDayPick={(date) => {
          const next = new URLSearchParams(search);
          next.set("date", date);
          next.set("view", "day");
          setSearch(next);
        }}
        onWeekJump={(date) => {
          const next = new URLSearchParams(search);
          next.set("date", date);
          next.set("view", "week");
          setSearch(next);
        }}
        hideUnscheduled={hideUnscheduled}
        onToggleHideUnscheduled={toggleHideUnscheduled}
        showUnassignedShifts={showUnassignedShifts}
        onToggleUnassignedShifts={() =>
          setShowUnassignedShifts((current) => !current)
        }
        unassignedFrozen={unassignedFrozen}
        onToggleUnassignedFrozen={() =>
          setUnassignedFrozen((current) => !current)
        }
        unassignedRowSettingsDisabled={!isEditMode && !gridEditSession}
        dropdownDismissSignal={topbarDismissSignal}
        onDropdownOpenChange={setTopbarDropdownOpen}
        showShiftType={showShiftType}
        onToggleShiftType={() => setShowShiftType((current) => !current)}
        showShiftLabels={showShiftLabels}
        onToggleShiftLabels={() => setShowShiftLabels((current) => !current)}
        showClockTimes={showClockTimes}
        onToggleClockTimes={() => setShowClockTimes((current) => !current)}
        showTotalHours={showTotalHours}
        onToggleTotalHours={() => setShowTotalHours((current) => !current)}
        showRoleSeparators={showRoleSeparators}
        onToggleRoleSeparators={() =>
          setShowRoleSeparators((current) => !current)
        }
        showPresetShiftBadges={showPresetShiftBadges}
        onTogglePresetShiftBadges={() =>
          setShowPresetShiftBadges((current) => !current)
        }
        showAvailability={showAvailability}
        onToggleAvailability={() => setShowAvailability((current) => !current)}
        employeeSortMode={employeeSortMode}
        onEmployeeSortModeChange={handleEmployeeSortModeChange}
        locations={model.locations}
        selectedLocationIds={selectedLocationIds}
        onLocationFilterChange={(ids) => setQueryIds("locations", ids)}
        shiftTypes={model.shift_types}
        selectedShiftTypeIds={selectedShiftTypeIds}
        onShiftTypeFilterChange={(ids) => setQueryIds("shiftTypes", ids)}
        jobs={model.jobs}
        departments={model.departments}
        selectedJobIds={selectedJobIds}
        onJobFilterChange={(ids) => setQueryIds("jobs", ids)}
        employees={sortedModel.employees}
        selectedEmployeeIds={selectedEmployeeIds}
        onEmployeeFilterChange={(ids) => setQueryIds("employees", ids)}
        actions={topBarActions}
        search={{ value: search.get("q") ?? "", onChange: setSearchQuery }}
      />
      <ScheduleFilterCommandStrip chips={filterChips} />
      {searchFindsNoOne ? (
        <ScheduleSearchEmpty
          term={searchTerm}
          matchesOutsideFilters={searchMatchesOutsideFilters}
          onClear={() => setSearchQuery("")}
          onShowAllFilters={showAllFilters}
        />
      ) : null}
      {query.isError ? (
        <RefreshError
          message="This week's schedule didn't refresh. These are the last shifts that loaded."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {/* Once an edit of this week is open, "editing didn't start" no longer holds. */}
      {draftsUnreadHere && !gridEditSession ? (
        <RefreshError
          message="The drafts didn't load, so editing didn't start. Nothing was changed."
          retrying={draftsRetrying}
          onRetry={() => void retryDraftsUnread()}
        />
      ) : null}
      {operationError ? (
        <div className="schedule-operation-error" role="alert">
          {operationError}
          {asksForReload(operationError) ? (
            <Button
              className="schedule-operation-retry"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          ) : null}
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setOperationError(null)}
          >
            <X size={15} />
          </button>
        </div>
      ) : null}
      {otherScheduleViewers.length ? (
        <div className="schedule-viewer-presence" role="status">
          <span aria-hidden />
          <strong>
            {otherScheduleViewers.length} other{" "}
            {otherScheduleViewers.length === 1 ? "viewer" : "viewers"}
          </strong>
          <small>
            {otherScheduleViewers.some((viewer) => viewer.mode === "edit")
              ? "Someone is editing this schedule"
              : "Viewing this schedule"}
          </small>
        </div>
      ) : null}
      {gridEditSession ? (
        <div className="schedule-edit-banner" role="toolbar">
          {gridEditSession && selectedIds.length ? (
            <button
              type="button"
              className="danger"
              onClick={() => void requestDeleteSelected(selectedIds)}
            >
              <Trash2 size={15} /> Delete {selectedIds.length}
            </button>
          ) : null}
          {gridEditSession ? (
            <button type="button" disabled={!canUndo} onClick={() => void undoLastEdit()}>
              Undo
            </button>
          ) : null}
          {gridEditSession && clipboard ? (
            <button
              type="button"
              aria-pressed={pasteArmed}
              onClick={togglePasteMode}
            >
              <ClipboardPaste size={15} />{" "}
              {pasteArmed ? "Paste mode on" : "Paste mode off"}
            </button>
          ) : null}
          {gridEditSession ? (
            <button
              type="button"
              aria-pressed={showAvailability}
              onClick={() => setShowAvailability((current) => !current)}
            >
              {showAvailability ? <Eye size={15} /> : <EyeOff size={15} />}{" "}
              {showAvailability ? "Availability on" : "Availability off"}
            </button>
          ) : null}
          {gridEditSession ? (
            <button type="button" onClick={() => void openAutoFill()}>
              <WandSparkles size={15} /> Auto-fill
            </button>
          ) : null}
          {gates.edit ? (
            <button type="button" onClick={() => setDefaultHoursOpen(true)}>
              Review default hours
            </button>
          ) : null}
          <button
            type="button"
            disabled={isDiscardingEditSession}
            onClick={requestDiscardEditSession}
          >
            <X size={15} /> Discard
          </button>
        </div>
      ) : null}
      {/* A draft whose shifts haven't loaded is not an empty draft. */}
      {draftUnread ? (
        <LoadError
          title="We couldn't load this draft"
          detail="This draft's shifts didn't load. Nothing was changed."
          onRetry={previewSource.retry}
        />
      ) : draftLoading ? (
        <ScheduleGridOutline />
      ) : (
      <ScheduleGrid
        model={sortedModel}
        timeFormat={resolveTimeInputFormat(account?.timeFormat, model.settings.time_format)}
        publishWarnings={canPublishSchedule}
        publishDeadlineDay={publishDeadlineDay}
        search={search}
        selectedDate={selectedDate}
        view={view}
        layout={layout}
        hideUnscheduled={hideUnscheduled}
        showShiftType={showShiftType}
        showShiftLabels={showShiftLabels}
        showClockTimes={showClockTimes}
        showTotalHours={showTotalHours}
        showUnassignedShifts={showUnassignedShifts}
        unassignedFrozen={unassignedFrozen}
        showJobColorDot={false}
        showRoleSeparators={showRoleSeparators}
        showPresetShiftBadges={showPresetShiftBadges}
        showAvailability={showAvailability}
        employeeSortMode={employeeSortMode}
        session={gridEditSession}
        dragDisabled={dropReview.pending || Boolean(dropReview.review)}
        activeEditorTarget={activeEditorTarget}
        focusedShiftId={focusedShiftId}
        selectedIds={gridEditSession ? selectedIds : []}
        clipboard={gridEditSession ? clipboard : null}
        pasteArmed={gridEditSession ? pasteArmed : false}
        organizationName={context?.workspace.name ?? "Workspace"}
        organizationLogoUrl={context?.workspace.logo_url ?? null}
        organizationLogoPlacement={
          context?.workspace.schedule_logo_placement ?? null
        }
        onManageLogo={
          gates.manageLogo
            ? () => setLogoOpen(true)
            : undefined
        }
        onOpenPost={(announcementId) =>
          navigate(`/app/announcements/${announcementId}`)
        }
        onOpenEmployeeCard={(employeeId) => {
          if (!gates.openEmployee) return;
          if (dismissOpenSurfaceBeforeGridActivation()) return;
          setEditor(null);
          setShiftMenu(null);
          setCellMenu(null);
          setEmployeeCardSection("profile");
          setEmployeeCardId(employeeId);
        }}
        onSelect={(id, additive) => {
          if (dismissOpenSurfaceBeforeGridActivation()) return;
          updateSelectedIds((current) =>
            resolveScheduleShiftSelectionIds({
              currentIds: current,
              focusedShiftId,
              shiftId: id,
              additive,
            }),
          );
        }}
        onFocusShift={(shift) => {
          if (dismissOpenSurfaceBeforeGridActivation()) return;
          if (focusedShiftId === shift.id) {
            if (gridEditSession) clearEditFocusedShiftSelection();
            else clearPreviewFocusedShift();
            return;
          }
          focusShiftBadge(shift);
        }}
        onEdit={(shift, point) => {
          if (dismissOpenSurfaceBeforeGridActivation()) return;
          setEditor({ mode: "edit", shift, x: point?.x, y: point?.y });
        }}
        onCreate={(locationId, employeeId, date, point) => {
          if (dismissOpenSurfaceBeforeGridActivation()) return;
          setEditor({
            mode: "create",
            locationId,
            employeeId,
            date,
            x: point?.x,
            y: point?.y,
          });
        }}
        onPresetCreate={(target) => {
          if (dismissOpenSurfaceBeforeGridActivation()) return;
          openPresetCreateTarget(target);
        }}
        onCopy={(shift) => {
          if (dismissOpenSurfaceBeforeGridActivation()) return;
          if (
            selectedIdsRef.current.length > 1
          ) {
            copySelectedShifts(selectedIdsRef.current, { armPaste: true });
            return;
          }
          copyShift(shift, { armPaste: true });
        }}
        onClearSelection={() => {
          if (dismissOpenSurfaceBeforeGridActivation()) return;
          if (!gridEditSession) {
            clearPreviewFocusedShift();
            return;
          }
          updateSelectedIds([]);
        }}
        onShiftContextMenu={(shift, event) => {
          if (dismissOpenSurfaceBeforeGridActivation()) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          openShiftContextMenu(shift, event);
        }}
        onCellContextMenu={(target, event) => {
          if (dismissOpenSurfaceBeforeGridActivation()) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          openCellContextMenu(target, event);
        }}
        onPaste={(locationId, employeeId, date, point) => {
          if (dismissOpenSurfaceBeforeGridActivation()) return;
          openPasteEditor(locationId, employeeId, date, point);
        }}
        onMove={(shift, locationId, employeeId, date) => {
          if (!context || !gridEditSession) return;
          const input = toScheduleShiftMutation(shift, { location_id: locationId, employee_id: employeeId, scheduled_date: date });
          dropReview.start({
            shiftId: shift.id,
            input,
            optimisticOp: createOptimisticPendingOp({ locationId, weekStart: gridEditSession.week_start, opType: "update", targetShiftId: shift.id,
              draftId: gridEditSession.source_draft_id, payload: input, actorUserId: gridEditSession.holder_user_id }),
            save: async input => {
              const next = await mutate(() => updateScheduleShift(context.workspace.id, gridEditSession, shift.id, shift.revision, input), undefined, true);
              announceAssignment([input], "move", next);
              return Boolean(next);
            },
          });
        }}
        onCopyMove={(shift, locationId, employeeId, date) => {
          if (!context || !gridEditSession) return;
          const input = toScheduleShiftMutation(shift, { location_id: locationId, employee_id: employeeId, scheduled_date: date });
          dropReview.start({
            input,
            optimisticOp: createOptimisticPendingOp({ locationId, weekStart: gridEditSession.week_start, opType: "create", targetShiftId: null,
              draftId: gridEditSession.source_draft_id, payload: input, actorUserId: gridEditSession.holder_user_id }),
            save: async input => {
              const next = await mutate(() => createScheduleShift(context.workspace.id, gridEditSession, input), undefined, true);
              announceAssignment([input], "add", next);
              return Boolean(next);
            },
          });
        }}
        onDayHeaderClick={(date, locationIds) => {
          if (dismissOpenSurfaceBeforeGridActivation()) return;
          selectScheduleDay(date, locationIds);
        }}
        onLocationHeaderClick={(locationIds) => {
          if (dismissOpenSurfaceBeforeGridActivation()) return;
          setFocusedShiftId(null);
          setQueryIds("locations", locationIds);
        }}
      />
      )}
      {gridEditSession &&
      (pasteArmed || pasteBlockedReason || pasteModeNotice) ? (
        <div
          className="schedule-paste-status"
          role="status"
          aria-label="Paste status"
          data-blocked={pasteBlockedReason ? "true" : "false"}
        >
          {pasteBlockedReason ?? pasteModeNotice ?? "Paste mode on"}
        </div>
      ) : null}
      <ScheduleContextMenu
        target={gridEditSession ? shiftMenu : null}
        shifts={gridEditSession?.shifts ?? []}
        onEdit={(shift) => {
          setShiftMenu(null);
          setEditor({ mode: "edit", shift, x: shiftMenu?.x, y: shiftMenu?.y });
        }}
        onCopy={(shift) => {
          setShiftMenu(null);
          copyShift(shift, { armPaste: true });
        }}
        onDelete={(shiftId) => {
          setShiftMenu(null);
          void deleteShiftById(shiftId);
        }}
        onUnpublish={(shiftId) => {
          setShiftMenu(null);
          void deleteShiftById(shiftId);
        }}
        onRestore={(shiftId) => {
          setShiftMenu(null);
          void restoreShiftById(shiftId);
        }}
        onDismiss={() => setShiftMenu(null)}
        publicationStateForShift={publicationStateForShift}
      />
      {context ? (
        <ScheduleLogoUploadDialog
          open={logoOpen}
          organizationName={context.workspace.name}
          logoUrl={context.workspace.logo_url}
          logoPlacement={context.workspace.schedule_logo_placement}
          logoFileName={context.workspace.logo_file_name}
          logoUpdatedAt={context.workspace.logo_updated_at}
          error={logoError}
          saving={savingLogo}
          onOpenChange={setLogoOpen}
          onSave={(draft) => void submitLogo(draft)}
        />
      ) : null}
      <ScheduleCellContextMenu
        target={gridEditSession ? cellMenu : null}
        canPaste={Boolean(gridEditSession && clipboard)}
        presetItems={cellPresetItems}
        onPresetSelect={(target, shiftTypeId) => {
          setCellMenu(null);
          const shiftType = model.shift_types.find(
            (item) => item.id === shiftTypeId,
          );
          if (!target.jobId || !shiftType) {
            toast.error("Preset shift type not found", {
              dedupeKey: "schedule-preset-shift-type-missing",
              description: "Refresh the schedule, then try this preset again.",
            });
            return;
          }
          openPresetCreateTarget({
            locationId: target.locationId,
            employeeId: target.employeeId,
            date: target.date,
            point: { x: target.x, y: target.y },
            preset: {
              jobId: target.jobId,
              shiftTypeId: shiftType.id,
              startTime: shiftType.default_start_time,
              endTime: shiftType.default_end_time,
            },
          });
        }}
        onPaste={(target) => {
          setCellMenu(null);
          openPasteEditor(target.locationId, target.employeeId, target.date, {
            x: target.x,
            y: target.y,
          });
        }}
        onDismiss={() => setCellMenu(null)}
      />
      {conflict ? (
        <ScheduleEditLockedDialogComponent
          open
          holderName={conflict.holderName}
          draftName={
            drafts.find((draft) => draft.id === conflict.draftId)?.name ?? null
          }
          lastHeartbeat={conflict.lastHeartbeat}
          onViewSchedule={() => setConflict(null)}
          onTryAgain={() => {
            setConflict(null);
            void acquire(conflict.source, conflict.draftId);
          }}
        />
      ) : null}
      {idleSeconds !== null ? (
        <ScheduleEditTimeoutDialogComponent
          open={idleSeconds !== null}
          secondsRemaining={idleSeconds}
          idleMinutes={EDIT_IDLE_WARNING_MS / 60_000}
          countdownSeconds={(EDIT_IDLE_TIMEOUT_MS - EDIT_IDLE_WARNING_MS) / 1000}
          isSaving={false}
          error={null}
          onSaveDraft={() => {
            keepEditing();
            setSaveOpen(true);
          }}
          onContinue={keepEditing}
        />
      ) : null}
      {presetPick && gridEditSession ? (
        <PresetTimePicker
          key={`${presetPick.target.employeeId}|${presetPick.target.date}|${presetPick.target.preset.shiftTypeId}`}
          name={presetPickName(model, presetPick.target)}
          color={model.shift_types.find((type) => type.id === presetPick.target.preset.shiftTypeId)?.color ?? "var(--theme-muted)"}
          where={presetPickWhere(model, presetPick.target)}
          options={presetTimeOptions(model, presetPick.target)}
          cell={presetPick.cell}
          onPick={(hours) => {
            const { target } = presetPick;
            setPresetPick(null);
            placePresetShift(target, hours);
          }}
          onCancel={closePresetPick}
        />
      ) : null}
      {editor && gridEditSession && context ? (
        <ShiftQuickEditor
          model={model}
          sessionId={gridEditSession.id}
          state={editor}
          timeFormat={resolveTimeInputFormat(account?.timeFormat, model.settings.time_format)}
          formatTime={formatTime}
          addDays={addDays}
          scheduleClosureCoversDate={scheduleClosureCoversDate}
          onClose={requestCloseEditor}
          onDismiss={dismissEditorFromBlankSurface}
          shouldSuppressDismissPointerDown={isScheduleSurfaceTarget}
          onDirtyChange={setEditorDirty}
          onReload={() => {
            blurScheduleEditorActivationTarget();
            setEditorDirty(false);
            setEditor(null);
            void query.refetch();
          }}
          onBlockedSubmit={(messages) => {
            if (editor.mode === "create" && editor.copy) {
              setPasteBlockedReason(messages.join(" "));
            }
          }}
          onDelete={async (shiftId) => {
            let stale = false;
            const shift = findEditableShift(shiftId);
            if (!shift) {
              blurScheduleEditorActivationTarget();
              setEditorDirty(false);
              setEditor(null);
              return "saved";
            }
            const next = await mutate(
              () =>
                deleteScheduleShift(
                  context.workspace.id,
                  gridEditSession,
                  shift.id,
                  shift.revision,
                ),
              (error) => {
                stale = isScheduleStaleError(error);
              },
            );
            if (stale) return "stale";
            if (next) {
              updateSelectedIds((current) =>
                current.filter((item) => item !== shiftId),
              );
              blurScheduleEditorActivationTarget();
              setEditorDirty(false);
              setEditor(null);
              return "saved";
            }
            return null;
          }}
          onSubmit={async (shift, count) => {
            const run = async () => {
              if (editor.mode === "edit") {
                return updateScheduleShift(
                  context.workspace.id,
                  gridEditSession,
                  editor.shift.id,
                  editor.shift.revision,
                  shift,
                );
              }
              if (count === 1) return createScheduleShift(context.workspace.id, gridEditSession, shift);
              return createScheduleShifts(context.workspace.id, gridEditSession,
                Array.from({ length: count }, () => shift), crypto.randomUUID());
            };
            let stale = false;
            const next = await mutate(run, (error) => {
              stale = isScheduleStaleError(error);
            });
            if (stale) return "stale";
            if (next) {
              announceAssignment(Array.from({ length: count }, () => shift), editor.mode === "edit" ? "save" : "add", next);
              if (editor.mode === "create" && editor.copy) {
                setPasteBlockedReason(null);
              }
              blurScheduleEditorActivationTarget();
              setEditorDirty(false);
              setEditor(null);
              return "saved";
            }
            return null;
          }}
        />
      ) : null}
      <ScheduleConflictSheet
        open={shiftConflictMessages.length > 0}
        messages={shiftConflictMessages}
        description={
          pasteConflictContext
            ? "This paste was not applied. Review the reason before scheduling the shift."
            : undefined
        }
        contextLabel={pasteConflictContext ?? undefined}
        onDismiss={() => {
          setShiftConflictMessages([]);
          setPasteConflictContext(null);
        }}
      />
      {dropReview.review ? <ScheduleConflictSheet
        open
        messages={dropReviewMessages}
        description={dropReview.review.blocked ? "Resolve this conflict before changing the shift." : SCHEDULE_CONFLICT_QUESTION}
        tone={dropReview.review.blocked ? "blocker" : "warning"}
        submitLabel={dropReview.review.blocked ? undefined : "Place shift"}
        onSubmit={dropReview.review.blocked ? undefined : dropReview.confirm}
        submitDisabled={dropReview.pending}
        onDismiss={dropReview.dismiss}
      /> : null}
      <ScheduleSaveRecoverySheet
        open={Boolean(saveRecovery)}
        isRetrying={saveRecovery?.retrying ?? false}
        canDiscard={Boolean(session)}
        canRetry={!exchangeRecoveryBlocked}
        onRetry={() => void retrySaveRecovery()}
        onKeepEditing={keepEditingAfterSaveFailure}
        onDiscard={discardAfterSaveFailure}
      >
        {saveRecovery && session && context && (
          <ExchangeScheduleRecovery
            workspaceId={context.workspace.id}
            session={session}
            onBlockingChange={setExchangeRecoveryBlocked}
            onRestored={(next) => {
              setSession(next);
              setPendingOps([]);
              invalidateScheduleCaches(next.source_draft_id);
              setSaveRecovery(null);
              setOperationError(null);
              toast.success("Approved assignments restored", {
                dedupeKey: "schedule-approved-assignments-restored",
                description: "Your notes and other edits are preserved. Review the draft, then save when ready.",
              });
            }}
          />
        )}
      </ScheduleSaveRecoverySheet>
      <ScheduleDeleteSelectionDialog
        open={deleteSelectionConfirmOpen && deleteSelectionIds.length > 0}
        count={deleteSelectionIds.length}
        onCancel={() => {
          setDeleteSelectionConfirmOpen(false);
          setDeleteSelectionIds([]);
        }}
        onConfirm={() => void removeSelected()}
      />
      {confirmDialog}
      <ScheduleEditExitDialog
        open={discardConfirmOpen && Boolean(session)}
        busy={isDiscardingEditSession}
        onCancel={() => setDiscardConfirmOpen(false)}
        onDiscard={discardEditSession}
      />
      <ScheduleEditExitDialog
        open={leaveGuard.open && Boolean(session)}
        leaving
        busy={leaveGuard.restoringHistory}
        onCancel={leaveGuard.stay}
        onDiscard={leaveWithoutSaving}
        onSave={saveBeforeLeaving}
      />
      <RetroactiveEditDialog
        open={retroactiveEditState.open}
        mode={retroactiveEditState.mode}
        findings={retroactiveEditState.findings}
        messages={retroactiveEditState.messages}
        onConfirm={confirmRetroactiveEdit}
        onOpenChange={setRetroactiveEditOpen}
      />
      {saveOpen && gridEditSession && context ? (
        <SaveDraftDialog
          drafts={drafts}
          initialDraft={
            drafts.find(
              (item) => item.id === gridEditSession.source_draft_id,
            ) ?? null
          }
          busy={saveBusy}
          onClose={() => { if (!saveBusy) { leaveAfterSaveRef.current = null; setSaveOpen(false); leaveScheduleDeepLink(); } }}
          onSave={(name, draft) => {
            if (saveBusy) return;
            const savingContext = currentMutationContext.current;
            setSaveBusy(true);
            void saveDraftFromMenu(name, Boolean(draft), draft?.id, "save")
              .then(saved => {
                if (!saved) return;
                setSaveOpen(false);
                const departure = leaveAfterSaveRef.current;
                leaveAfterSaveRef.current = null;
                if (departure) setDepartureAfterSave(() => departure);
              }).finally(() => {
                if (currentMutationContext.current === savingContext) setSaveBusy(false);
              });
          }}
        />
      ) : null}
      {publishOpen && context ? (
        <PublishScheduleDialog
          drafts={publishDrafts}
          activeDraftId={publishDraftOverride?.id ?? activeDraftId}
          locations={model.locations}
          departments={model.departments}
          employees={sortedModel.employees}
          initialLocationIds={pendingOpsLocationIds}
          initialChoices={publishChoices}
          documentReviewVersion={documentReviewVersion}
          onClose={() => {
            setPublishOpen(false);
            setPublishDraftOverride(null);
            setPublishChoices(null);
          }}
          onPreview={(draftId, locationIds, departmentScope) =>
            previewSchedulePublication(
              context.workspace.id,
              draftId,
              locationIds,
              departmentScope,
            )
          }
          onPublish={(
            preview,
            overrides,
            preflightAck,
            departmentScope,
          ) =>
            publishScheduleDraft(
              context.workspace.id,
              preview,
              overrides,
              preflightAck,
              departmentScope,
            ).then((result) => {
              if (result.status !== "published") {
                throw new ScheduleRequestError(
                  "Schedule publish requires review",
                  409,
                  result,
                );
              }
              // BL-614: "changes" are what the preview showed added, updated or
              // removed at the published locations, not every published shift.
              const changeCount = preview.locations
                .filter((location) => result.location_ids.includes(location.location_id))
                .reduce((sum, location) => sum + location.added + location.updated + location.removed, 0);
              toast.success("Schedule published", {
                dedupeKey: "schedule-published",
                description: `${countLabel(result.location_ids.length, "location", "locations")} and ${countLabel(changeCount, "change", "changes")} published.`,
              });
              setPublishOpen(false);
              setPublishChoices(null);
              setScheduleMode("preview", null);
              invalidateScheduleCaches(preview.draft_id);
              void refreshPublicationStatus();
              void query.refetch();
            })
          }
          onReviewDocumentConflict={(conflict) => {
            if (!gates.openEmployee) return;
            setEmployeeCardId(conflict.employee_id);
            setEmployeeCardSection("documents");
          }}
          onReviewShift={async (finding, choices) => {
            if (session && session.source_draft_id !== choices.draftId) {
              throw new ScreenError("Save or close your current draft before opening another draft.");
            }
            const editing = session ?? await acquire("draft", choices.draftId, true);
            if (!editing) throw new ScreenError("This draft could not be opened for editing. Check the edit lock and try again.");
            const shift = preflightReturnShift(editing, choices.draftId, finding.shift_ids);
            setPublishChoices(choices);
            setPublishOpen(false);
            setEditor(null);
            setEditorDirty(false);
            setShiftMenu(null);
            setCellMenu(null);
            setPasteArmed(false);
            setSearch((current) => preflightReturnSearch(current, shift, choices.draftId), { replace: true });
            focusFiltersRef.current = null;
            setFocusedShiftId(shift.id);
            setPreflightShiftId(shift.id);
          }}
        />
      ) : null}
      {unpublishOpen && context ? (
        <UnpublishScheduleDialog
          open={unpublishOpen}
          weekLabel={formatPeriod(selectedDate, model.week_start, "week")}
          locations={model.locations}
          statuses={publicationChipStatuses}
          isUnpublishing={isUnpublishing}
          onOpenChange={setUnpublishOpen}
          onConfirm={async (locationIds) => {
            setIsUnpublishing(true);
            try {
              const preview = await previewScheduleUnpublish(
                context.workspace.id,
                model.week_start,
                locationIds,
              );
              if (preview.status !== "unpublish_ready") {
                throw new ScreenError("Past schedule weeks cannot be unpublished.");
              }
              const result = await unpublishSchedule(
                context.workspace.id,
                preview,
              );
              toast.success(
                "Schedule unpublished",
                {
                  dedupeKey: "schedule-unpublished",
                  description: `${countLabel(result.location_ids.length, "location", "locations")} unpublished.`,
                },
              );
              setUnpublishOpen(false);
              invalidateScheduleCaches(null);
              await followUpAfterUnpublish({
                activeDraftId,
                refreshDrafts,
                previewDraft: previewDraftFromMenu,
                showPublished: () => setScheduleMode("preview", null),
                onError: (error) => {
                  console.error(error);
                  setOperationError(
                    "Schedule unpublished, but this page could not refresh. Reload to see the latest schedule.",
                  );
                },
              });
              void refreshPublicationStatus();
              void query.refetch();
            } finally {
              setIsUnpublishing(false);
            }
          }}
        />
      ) : null}
      {employeeCardId && gates.openEmployee ? (
        <EmployeeDrawer
          employeeId={employeeCardId}
          creating={false}
          section={employeeCardSection}
          onSectionChange={setEmployeeCardSection}
          onClose={() => setEmployeeCardId(null)}
          onCreated={(employeeId) => setEmployeeCardId(employeeId)}
          onOnboardingReviewSuccess={() =>
            setDocumentReviewVersion((version) => version + 1)
          }
        />
      ) : null}
      {defaultHoursOpen && context && gridEditSession ? <DefaultHoursReviewDialog key={`${context.workspace.id}:${gridEditSession.id}`} workspaceId={context.workspace.id} session={gridEditSession} model={model} initialSelectedIds={selectedIds}
        onClose={() => setDefaultHoursOpen(false)} onApplied={result => setSession(result)} /> : null}
      {autoFill && context && gridEditSession ? (
        <AutoFillReviewOverlay
          preview={autoFill}
          onClose={() => setAutoFill(null)}
          onApply={(assignments) =>
            runWithLease(() => applyScheduleAutoFill(
              context.workspace.id,
              gridEditSession,
              autoFill,
              assignments,
            )).then((result) => {
              setSession(result.session);
              if (result.rejected.length)
                setOperationError(autoFillRejectedText(result.rejected.length));
              return result;
            }, (error: unknown) => {
              throw autoFillApplyError(error);
            })
          }
        />
      ) : null}
    </section>
  );
}

function scheduleLogoErrorText(error: unknown): string {
  return requestErrorText(error, "Logo could not be saved.");
}

function scheduleShiftFromPasteInput(
  input: ScheduleShiftMutationInput,
  sourceId: string,
): ScheduleShift {
  return {
    id: `clipboard-${sourceId}`,
    location_id: input.location_id,
    employee_id: input.employee_id,
    job_id: input.job_id,
    shift_type_id: input.shift_type_id,
    scheduled_date: input.scheduled_date,
    start_time: input.start_time,
    end_time: input.end_time,
    crosses_midnight: input.end_time <= input.start_time,
    unpaid_break_minutes: input.unpaid_break_minutes ?? 0,
    hide_time_on_badge: input.hide_time_on_badge ?? false,
    time_basis: input.time_basis,
    time_snapshot: input.time_snapshot,
    time_timezone: input.time_timezone,
    label_ids: input.label_ids ?? [],
    label_names: input.label_names ?? [],
    note: input.note,
    warning_codes: [],
  };
}

// The Schedule edit's way out: Discard on the edit strip, and leaving the page
// with unsaved work (Mert 2026-10-12), which also offers Save draft.
function ScheduleEditExitDialog({
  open,
  leaving = false,
  busy,
  onCancel,
  onDiscard,
  onSave,
}: {
  readonly open: boolean;
  /** Asked on the way to another page: the question names the departure and offers Save draft. */
  readonly leaving?: boolean;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onDiscard: () => void;
  readonly onSave?: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  // Escape is Keep editing; the page's own Escape would close another layer.
  useCloseOnEscape(open ? (busy && !leaving ? () => {} : onCancel) : null);
  return open ? (
    <div className="schedule-discard-layer" role="presentation">
      <button
        type="button"
        className="schedule-discard-backdrop"
        aria-label="Keep editing"
        onClick={onCancel}
      />
      <section
        className="schedule-discard-dialog"
        data-schedule-discard-edit-dialog={leaving ? undefined : "true"}
        data-schedule-leave-edit-dialog={leaving ? "true" : undefined}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header>
          <h2 id={titleId}>
            {leaving ? "Save changes before leaving?" : "Discard unsaved changes?"}
          </h2>
          <p id={descriptionId}>
            {leaving
              ? "You have unsaved schedule changes. Save them as a draft, or discard them and leave."
              : "This closes the edit session and returns to the live weekly schedule. Unsaved schedule changes will be removed."}
          </p>
        </header>
        <footer>
          {leaving ? (
            <button type="button" className="leave" onClick={onDiscard} disabled={busy}>
              Discard and leave
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            disabled={busy && !leaving}
            autoFocus
          >
            Keep editing
          </button>
          {leaving ? (
            onSave ? (
              <button type="button" className="save" onClick={onSave} disabled={busy}>
                Save draft
              </button>
            ) : null
          ) : (
            <button type="button" className="danger" onClick={onDiscard} disabled={busy}>
              {busy ? "Discarding..." : "Discard"}
            </button>
          )}
        </footer>
      </section>
    </div>
  ) : null;
}

function isScheduleStaleError(error: Error): boolean {
  return /stale|conflict|expired|review the current availability assessment/i.test(error.message);
}

function blurScheduleEditorActivationTarget(): void {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (
    active.closest(
      "[data-schedule-add-shift-control='true'], [data-shift-quick-editor-content='true']",
    )
  ) {
    active.blur();
  }
}

export default SchedulePage;

/** The week in grey while it loads, where the grid goes. */
function ScheduleGridOutline() {
  return <ListOutline label="Loading Schedule" rows={8} columns={8} />;
}
