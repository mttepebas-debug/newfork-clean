import type {
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
  AlertTriangle,
  Check,
  ClipboardPaste,
  Eye,
  EyeOff,
  FileDown,
  LayoutTemplate,
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
import { todayIn } from "../lib/today";
import { NoAccessState } from "../shell/NoAccessState";
import { Tooltip } from "../shell/Tooltip";
import { EmployeeDrawer } from "../employees/EmployeeDrawer";
import { ScheduleFilterCommandStrip } from "../schedule/components/ScheduleFilterCommandStrip";
import {
  ScheduleCellContextMenu,
  ScheduleContextMenu,
  type CellContextMenuTarget,
  type ShiftContextMenuTarget,
} from "../schedule/components/ScheduleContextMenu";
import { ScheduleGrid } from "../schedule/components/ScheduleGrid";
import { ScheduleTopBar, ScheduleViewModeControls } from "../schedule/components/ScheduleTopBar";
import { ScheduleState } from "../schedule/components/ScheduleState";
import { ShiftQuickEditor } from "../schedule/components/ShiftQuickEditor";
import type { PresetCreateTarget } from "../schedule/components/SchedulePresetRows";
import {
  acquireScheduleEditSession,
  applyScheduleAutoFill,
  applyScheduleTemplate,
  bulkDeleteShifts,
  createScheduleTemplate,
  createScheduleShift,
  createScheduleShifts,
  deleteScheduleShift,
  deleteScheduleDraft,
  discardScheduleEditSession,
  deleteScheduleTemplate,
  draftsKey,
  heartbeatScheduleEditSession,
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
import { DraftDropdownMenu } from "../schedule/components/DraftDropdownMenu";
import { EnterEditModeDialog } from "../schedule/components/EnterEditModeDialog";
import { ScheduleConflictSheet } from "../schedule/components/ScheduleConflictSheet";
import { ScheduleNoteConfirm } from "../schedule/components/ScheduleNoteConfirm";
import { scheduleDropReviewAsk } from "../schedule/lib/scheduleDropReviewAsk";
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
import { SaveDraftMenu } from "../schedule/components/SaveDraftMenu";
import { SaveDraftDialog } from "../schedule/components/SaveDraftDialog";
import { UnpublishScheduleDialog } from "../schedule/components/UnpublishScheduleDialog";
import {
  ScheduleLogoUploadDialog,
  type ScheduleLogoSaveDraft,
} from "../schedule/components/ScheduleLogoUploadDialog";
import { ScheduleTemplatesDialog } from "../schedule/components/ScheduleTemplateDialogs";
import { RetroactiveEditDialog } from "../schedule/components/RetroactiveEditDialog";
import {
  EDIT_IDLE_TIMEOUT_MS,
  EDIT_IDLE_WARNING_MS,
  useEditIdleTimer,
} from "../schedule/hooks/useEditIdleTimer";
import { useEffectiveShifts } from "../schedule/hooks/useEffectiveShifts";
import { createOptimisticPendingOp } from "../schedule/hooks/optimisticScheduleCache";
import { useRetroactiveEditPrompt } from "../schedule/hooks/useRetroactiveEditPrompt";
import { usePendingOpsQuery } from "../schedule/hooks/usePendingOpsQuery";
import { useScheduleDrafts } from "../schedule/hooks/useScheduleDrafts";
import { useScheduleMode } from "../schedule/hooks/useScheduleMode";
import { useScheduleQuery } from "../schedule/hooks/useScheduleQuery";
import { useScheduleRealtime } from "../schedule/hooks/useScheduleRealtime";
import { useScheduleViewerPresence } from "../schedule/hooks/useScheduleViewerPresence";
import { saveScheduleLogo } from "../settings/organization-data";
import {
  evaluateScheduleShiftConflicts,
  formatScheduleConflictMessage,
  isAvailabilityReminder,
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
import { followUpAfterUnpublish } from "../schedule/lib/scheduleUnpublishFollowUp";
import { SCHEDULE_ACTION_BUTTON_CLASS } from "../schedule/lib/scheduleActionButton";
import { formatSchedulePasteConflictContext } from "../schedule/lib/scheduleCatalogNames";
import { templateAppliedDescription } from "../schedule/lib/templateApplyMessage";
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
} from "../schedule/lib/scheduleDateTime";
import {
  buildCellPresetMenuItems,
  formatPresetCreateContext,
  validatePresetCreateTarget,
} from "../schedule/lib/schedulePresetTargets";
import { resolveScheduleDeleteShiftIds } from "../schedule/lib/scheduleDeleteSelection";
import { scheduleClosureCoversDate } from "../schedule/lib/scheduleClosures";
import { parseRetroactiveEditError } from "../schedule/lib/retroactiveEditRecovery";
import { publicationStateForShift } from "../schedule/lib/scheduleShiftMetadata";
import { toScheduleShiftMutation } from "../schedule/lib/scheduleShiftMutation";
import {
  SCHEDULE_WINDOW_SELECTOR,
  isBlankScheduleDismissTarget,
  isMatchingScheduleLocationHeaderTarget,
  isScheduleEditFocusedShiftBlankDismissTarget,
  isScheduleGridCellActivationTarget,
  isScheduleInteractionSurface,
  isSchedulePreviewFocusedShiftBlankDismissTarget,
  isScheduleSurfaceTarget,
  isSuppressedScheduleClickTarget,
  isTextEditingTarget,
} from "../schedule/lib/scheduleInteractionTargets";
import {
  clearFocusedShiftSearchFilters,
  dismissNextScheduleSearchLayer,
} from "../schedule/lib/scheduleDismissal";
import { useConfirmDialog } from "../shell/ConfirmDialog";

interface ScheduleLockConflict {
  readonly sessionId?: string;
  readonly holderName: string;
  readonly lastHeartbeat: string;
  readonly expiresAt: string;
  readonly source: "blank" | "published" | "draft";
  readonly draftId: string | null;
}

type SaveRecoveryIntent =
  | {
      readonly kind: "save" | "save-and-export";
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

const SCHEDULE_TOP_ACTION_SURFACE_SELECTOR = [
  "[data-schedule-top-action-trigger]",
  ".schedule-draft-menu",
  ".schedule-save-menu-anchor",
  ".schedule-save-draft-menu",
  ".schedule-action-menu",
  ".schedule-published-menu",
  ".schedule-dialog",
  ".schedule-edit-banner",
  ".schedule-export-panel",
  "[data-schedule-export-v2]",
  "[data-employee-drawer-panel='true']",
].join(",");

const SCHEDULE_FILTER_QUERY_PARAMS = [
  "locations",
  "shiftTypes",
  "jobs",
  "employees",
  "hideUnscheduled",
  "layout",
] as const;

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
  const today = todayIn();
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
  const canExportSchedules = gates.export;
  const [session, setSession] = useState<ScheduleEditSession | null>(null);
  // A context transition must invalidate old saves even if the same session is later resumed.
  const mutationContext = useMemo(() => ({
    userId: context?.userId, workspaceId: context?.workspace.id,
    sessionId: session?.id, revision: session?.revision,
  }), [context?.userId, context?.workspace.id, session?.id, session?.revision]);
  const currentMutationContext = useRef<typeof mutationContext | null>(mutationContext);
  currentMutationContext.current = mutationContext;
  useEffect(() => {
    currentMutationContext.current = mutationContext;
    return () => { currentMutationContext.current = null; };
  }, [mutationContext]);
  const [defaultHoursOpen, setDefaultHoursOpen] = useState(false);
  useEffect(() => setDefaultHoursOpen(false), [context?.workspace.id, session?.id]);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [editor, setEditor] = useState<ScheduleShiftEditorState | null>(null);
  const [, setEditorDirty] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [exportAfterSave, setExportAfterSave] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [conflict, setConflict] = useState<ScheduleLockConflict | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [focusedShiftId, setFocusedShiftId] = useState<string | null>(null);
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
    setExportAfterSave(false);
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
  const [undoSnapshot, setUndoSnapshot] = useState<ScheduleEditSession | null>(
    null,
  );
  const undoSnapshotRef = useRef<ScheduleEditSession | null>(null);
  const undoStackRef = useRef<ScheduleEditSession[]>([]);
  const editAcquireRequestRef = useRef<symbol | null>(null);
  const setUndoSnapshotState = useCallback(
    (next: ScheduleEditSession | null) => {
      undoSnapshotRef.current = next;
      setUndoSnapshot(next);
    },
    [],
  );
  const clearUndoStack = useCallback(() => {
    undoStackRef.current = [];
    setUndoSnapshotState(null);
  }, [setUndoSnapshotState]);
  const rememberUndoSnapshot = useCallback(
    (snapshot: ScheduleEditSession) => {
      undoStackRef.current = [...undoStackRef.current, snapshot].slice(-25);
      setUndoSnapshotState(snapshot);
    },
    [setUndoSnapshotState],
  );
  const popUndoSnapshot = useCallback(() => {
    const snapshot = undoStackRef.current.pop() ?? null;
    setUndoSnapshotState(undoStackRef.current.at(-1) ?? null);
    return snapshot;
  }, [setUndoSnapshotState]);
  const [shiftMenu, setShiftMenu] = useState<ShiftContextMenuTarget | null>(
    null,
  );
  const [cellMenu, setCellMenu] = useState<CellContextMenuTarget | null>(null);
  const lastActivityRef = useRef(Date.now());
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishChoices, setPublishChoices] = useState<SchedulePublicationChoices | null>(null);
  const [preflightShiftId, setPreflightShiftId] = useState<string | null>(null);
  const [publishDraftOverride, setPublishDraftOverride] =
    useState<ScheduleDraftSummary | null>(null);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [publicationStatus, setPublicationStatus] =
    useState<SchedulePublicationStatus | null>(null);
  const [pendingOps, setPendingOps] = useState<readonly SchedulePendingOp[]>(
    [],
  );
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<
    readonly ScheduleTemplateSummary[]
  >([]);
  const [autoFill, setAutoFill] = useState<ScheduleAutoFillPreview | null>(
    null,
  );
  const [exportOpen, setExportOpen] = useState(false);
  const exportDeepLinkConsumed = useRef(false);
  const [newScheduleMenuOpen, setNewScheduleMenuOpen] = useState(false);
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const [newScheduleDismissSignal, setNewScheduleDismissSignal] = useState(0);
  const [publishMenuDismissSignal, setPublishMenuDismissSignal] = useState(0);
  const topActionBlockedClickTargetRef = useRef<Element | null>(null);
  const closeTopActionSurfaces = useCallback(
    (
      keep:
        | "export"
        | "templates"
        | "publish"
        | "source"
        | "newSchedule"
        | null = null,
    ) => {
      if (
        keep !== "export" &&
        keep !== "templates" &&
        (location.pathname === `${scheduleBasePath}/export` ||
          location.pathname === `${scheduleBasePath}/templates`)
      ) {
        navigate({ pathname: scheduleBasePath, search: location.search });
      }
      if (keep !== "templates") setTemplatesOpen(false);
      if (keep !== "publish") {
        setPublishOpen(false);
        setPublishDraftOverride(null);
      }
      if (keep !== "source") setSourceOpen(false);
      if (keep !== "newSchedule") {
        setNewScheduleMenuOpen(false);
        setNewScheduleDismissSignal((current) => current + 1);
      }
      if (keep !== "publish") {
        setPublishMenuOpen(false);
        setPublishMenuDismissSignal((current) => current + 1);
      }
    },
    [location.pathname, location.search, navigate, scheduleBasePath],
  );
  const topActionSurfaceOpen =
    templatesOpen ||
    publishOpen ||
    sourceOpen ||
    newScheduleMenuOpen ||
    publishMenuOpen;
  useEffect(() => {
    if (!topActionSurfaceOpen) return;
    const closeFromOutsideTopAction = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(SCHEDULE_TOP_ACTION_SURFACE_SELECTOR)) return;
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
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    document.addEventListener("click", blockOutsideTopActionClick, true);
    return () =>
      document.removeEventListener("click", blockOutsideTopActionClick, true);
  }, []);
  const [isDiscardingEditSession, setIsDiscardingEditSession] = useState(false);
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
  const [useDefaultTimesForScheduling, setUseDefaultTimesForScheduling] =
    usePersistentScheduleUiBoolean("useDefaultTimesForScheduling", false);
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
    activeDraftId: gridEditSession?.source_draft_id ?? activeDraftId,
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
    activeDraftId, editing: isEditMode || Boolean(gridEditSession),
    loading: query.isFetching || query.isPlaceholderData || Boolean(activeDraftId && draftsQuery.isFetching),
    drafts: draftsQuery.data?.drafts, onMissingDraft: clearMissingDraftPreview,
  });
  useEffect(() => {
    if (isEditMode || gridEditSession || !canExportSchedules) setExportOpen(false);
  }, [isEditMode, gridEditSession, canExportSchedules]);
  useEffect(() => {
    setExportOpen(false); setExportAfterSave(false); setSaveOpen(false);
  }, [context?.workspace.id, context?.userId]);
  const dropReview = useScheduleDropReview(context?.workspace.id, gridEditSession?.id, gridEditSession?.revision,
    query.data?.settings.conflict_rules?.closed_location);
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
    const filtered = filterScheduleModel(
      { ...query.data, shifts: effectiveShifts },
      search,
    );
    return filtered.shifts
      .filter(
        (shift) => view === "week" || shift.scheduled_date === selectedDate,
      )
      .map((shift) => shift.id);
  }, [effectiveShifts, query.data, search, selectedDate, view]);
  usePreflightShiftFocus(preflightShiftId, Boolean(gridEditSession && preflightShiftId && visibleSelectableShiftIds.includes(preflightShiftId)), setPreflightShiftId);
  const updateDraftCache = useCallback(
    (nextDrafts: readonly ScheduleDraftSummary[]) => {
      if (!context || !query.data) return;
      queryClient.setQueryData(
        draftsKey(context.workspace.id, query.data.week_start),
        {
          drafts: nextDrafts,
        },
      );
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
  const presenceLocationId = useMemo(() => {
    const data = query.data;
    if (!data) return null;
    const selectedIds = validIds(
      search.get("locations"),
      data.locations.map((item) => item.id),
    );
    return selectedIds[0] ?? data.locations[0]?.id ?? null;
  }, [query.data, search]);
  const scheduleViewers = useScheduleViewerPresence({
    workspaceId: context?.workspace.id ?? null,
    weekStart: query.data?.week_start ?? selectedDate,
    locationId: presenceLocationId,
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

  useEffect(() => {
    if (!session) return;
    const heartbeat = window.setInterval(() => {
      if (!context) return;
      if (Date.now() - lastActivityRef.current >= 15 * 60 * 1000) return;
      void heartbeatScheduleEditSession(context.workspace.id, session.id)
        .then(setSession)
        .catch((error: Error) => setOperationError(error.message));
    }, 60_000);
    return () => window.clearInterval(heartbeat);
  }, [context, session?.id]);

  const handleIdleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);
  const handleIdleTimeout = useCallback(() => {
    if (!context || !session) return;
    void discardScheduleEditSession(context.workspace.id, session.id).finally(
      () => {
        setSession(null);
        setScheduleMode("preview", null);
        updateSelectedIds([]);
        clearUndoStack();
      },
    );
  }, [clearUndoStack, context, session, setScheduleMode, updateSelectedIds]);
  const { secondsRemaining: idleSeconds, keepAlive: keepEditing } = useEditIdleTimer({
    enabled: Boolean(session),
    onActivity: handleIdleActivity,
    onTimeout: handleIdleTimeout,
  });

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

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
    const next = new URLSearchParams(search);
    next.set("date", date);
    next.set("view", "day");
    if (locationIds.length) next.set("locations", locationIds.join(","));
    else next.delete("locations");
    setSearch(next);
  };
  const setLayout = (value: "separate" | "unified") => {
    const next = new URLSearchParams(search);
    if (value === "separate") next.delete("layout");
    else next.set("layout", value);
    setSearch(next);
  };
  const toggleHideUnscheduled = () => {
    const next = new URLSearchParams(search);
    if (hideUnscheduled) next.delete("hideUnscheduled");
    else next.set("hideUnscheduled", "true");
    setSearch(next);
  };
  const setQueryIds = (param: string, ids: readonly string[]) => {
    const next = new URLSearchParams(search);
    if (ids.length) next.set(param, ids.join(","));
    else next.delete(param);
    setSearch(next);
  };
  const focusShiftBadge = (shift: ScheduleShift) => {
    const next = new URLSearchParams(search);
    if (shift.shift_type_id) next.set("shiftTypes", shift.shift_type_id);
    else next.delete("shiftTypes");
    next.set("jobs", shift.job_id);
    next.delete("employees");
    setSearch(next);
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
    updateDraftCache(result.drafts);
    return result.drafts;
  };

  // BL-394: editing starts from a fresh drafts list; if it cannot load, say so
  // plainly and stop, with the reason in the console.
  const refreshDraftsBeforeEdit = async (): Promise<boolean> => {
    try {
      await refreshDrafts();
      return true;
    } catch (error) {
      console.error(error);
      setOperationError("Drafts could not be loaded. Try again.");
      return false;
    }
  };

  const startBlankDraftFromMenu = async () => {
    if (!(await refreshDraftsBeforeEdit())) return;
    await acquire("blank");
  };

  const previewDraftFromMenu = async (draftId: string | null) => {
    if (!context || !query.data) return;
    setOperationError(null);
    // One cancellable source read feeds both grid and export.
    setScheduleMode("preview", draftId);
  };

  const editDraftFromMenu = async (draftId: string | null) => {
    if (!(await refreshDraftsBeforeEdit())) return;
    await acquire(draftId ? "draft" : "published", draftId);
  };

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
      setOperationError((error as Error).message);
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
      updateDraftCache(result.drafts);
      void refreshPublicationStatus();
      if (!result.drafts.length) {
        setOperationError("Save a named draft before publishing this week.");
        return;
      }
      setPublishOpen(true);
    } catch (error) {
      setOperationError((error as Error).message);
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
      if (requestId === publicationRequestIdRef.current)
        setPublicationStatus(status);
    } catch (error) {
      if (requestId === publicationRequestIdRef.current)
        setPublicationStatus(null);
      throw error;
    }
  }, [context, query.data]);

  const openTemplates = async () => {
    if (!context || !query.data) return;
    setOperationError(null);
    closeTopActionSurfaces("templates");
    try {
      const [templateResult, draftResult] = await Promise.all([
        listScheduleTemplates(context.workspace.id),
        listScheduleDrafts(context.workspace.id, query.data.week_start),
      ]);
      setTemplates(templateResult.templates);
      updateDraftCache(draftResult.drafts);
      setTemplatesOpen(true);
    } catch (error) {
      setOperationError((error as Error).message);
    }
  };

  const openAutoFill = async () => {
    const workspaceId = context?.workspace.id ?? query.data?.workspace_id;
    if (!workspaceId || !session) {
      setOperationError("Start editing this schedule before auto-fill.");
      return;
    }
    setOperationError(null);
    try {
      setAutoFill(await previewScheduleAutoFill(workspaceId, session.id));
    } catch (error) {
      setOperationError((error as Error).message);
    }
  };

  const openExport = async () => {
    if (!context || !query.data) return;
    if (!canExportSchedules) {
      setOperationError("You do not have permission to export schedules.");
      return;
    }
    if (window.matchMedia && !window.matchMedia("(min-width: 721px)").matches) return;
    setOperationError(null);
    setTopbarDropdownOpen(false);
    setTopbarDismissSignal(current => current + 1);
    closeTopActionSurfaces("export");
    if (isEditMode || session) {
      setExportAfterSave(true);
      setSaveOpen(true);
      return;
    }
    setExportOpen(true);
  };

  useEffect(() => {
    if (!context || !query.data || gridEditSession) {
      publicationRequestIdRef.current += 1;
      setPublicationStatus(null);
      return;
    }
    void refreshPublicationStatus().catch(() => undefined);
  }, [context, gridEditSession, query.data, refreshPublicationStatus]);

  useEffect(() => {
    setPendingOps(pendingOpsQuery.data?.pending_ops ?? []);
  }, [pendingOpsQuery.data]);

  useEffect(() => {
    if (location.pathname !== `${scheduleBasePath}/export`) exportDeepLinkConsumed.current = false;
    if (!context || !query.data) return;
    if (location.pathname === `${scheduleBasePath}/templates` && !templatesOpen) {
      void openTemplates();
    }
    if (
      location.pathname === `${scheduleBasePath}/export` &&
      !exportDeepLinkConsumed.current &&
      !exportOpen &&
      !saveOpen &&
      canExportSchedules
    ) {
      exportDeepLinkConsumed.current = true;
      void openExport();
    }
  }, [
    context,
    canExportSchedules,
    exportOpen,
    saveOpen,
    location.pathname,
    query.data,
    scheduleBasePath,
    templatesOpen,
  ]);

  const leaveScheduleDeepLink = () => {
    if (
      location.pathname === `${scheduleBasePath}/export` ||
      location.pathname === `${scheduleBasePath}/templates`
    ) {
      navigate({ pathname: scheduleBasePath, search: location.search });
    }
  };

  const closeTemplates = () => {
    setTemplatesOpen(false);
    leaveScheduleDeepLink();
  };

  const closeExport = () => {
    setExportOpen(false);
    leaveScheduleDeepLink();
  };

  const openExportDialog = () => {
    leaveScheduleDeepLink();
    void openExport();
  };

  const openTemplatesDialog = () => {
    leaveScheduleDeepLink();
    void openTemplates();
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

  const acquire = async (
    source: "blank" | "published" | "draft",
    draftId: string | null = null,
    preserveFilters = false,
  ) => {
    if (!context || !query.data || pastWeek) return;
    const allLocationIds = query.data.locations.map((item) => item.id);
    const filteredLocationIds = validIds(search.get("locations"), allLocationIds);
    // The filtered locations, or every location the person may edit.
    const editLocationIds = filteredLocationIds.length ? filteredLocationIds : null;
    const requestId = Symbol(
      source === "published"
        ? "schedule-live-edit-acquire"
        : "schedule-edit-acquire",
    );
    editAcquireRequestRef.current = requestId;
    setOperationError(null);
    setNewScheduleMenuOpen(false);
    setNewScheduleDismissSignal((current) => current + 1);
    try {
      const result = await acquireScheduleEditSession(
        context.workspace.id,
        query.data.week_start,
        source,
        draftId,
        editLocationIds,
      );
      if (editAcquireRequestRef.current !== requestId) return;
      if (result.status === "conflict") {
        setConflict({
          sessionId: result.session_id,
          holderName: result.holder_name,
          lastHeartbeat: result.last_heartbeat,
          expiresAt: result.expires_at,
          source,
          draftId,
        });
        setSourceOpen(false);
        return;
      }
      setSession(result.session);
      enterEditModeWithResetFilters(
        result.session.source_draft_id,
        preserveFilters,
        result.session.location_ids.length < allLocationIds.length
          ? result.session.location_ids
          : null,
      );
      clearUndoStack();
      setSourceOpen(false);
      setConflict(null);
      return result.session;
    } catch (error) {
      if (editAcquireRequestRef.current === requestId) {
        setOperationError((error as Error).message);
      }
    } finally {
      if (editAcquireRequestRef.current === requestId) {
        editAcquireRequestRef.current = null;
      }
    }
  };

  const discardEditSession = () => {
    if (!context || !session || isDiscardingEditSession) return;
    setDiscardConfirmOpen(false);
    const discardedSession = session;
    setIsDiscardingEditSession(true);
    setSession(null);
    const nextSearch = new URLSearchParams(search);
    nextSearch.set("mode", "preview");
    nextSearch.delete("draft");
    nextSearch.set("date", today);
    nextSearch.set("view", "week");
    setSearch(nextSearch, { replace: true });
    setPendingOps([]);
    updateSelectedIds([]);
    clearUndoStack();
    setClipboard(null);
    setPasteArmed(false);
    setPasteModeNotice(null);
    setPasteBlockedReason(null);
    void discardScheduleEditSession(context.workspace.id, discardedSession.id)
      .then(() => {
        invalidateScheduleCaches(discardedSession.source_draft_id);
        void query.refetch();
      })
      .catch((error: Error) => {
        setOperationError(
          error.message ||
            "Discard cleanup failed. Refresh before editing this schedule again.",
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

  const saveDraftFromMenu = async (
    name: string,
    force: boolean,
    targetDraftId: string | null | undefined,
    recoveryKind: "save" | "save-and-publish" | "save-and-export" = "save",
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
      clearUndoStack();
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
      const message =
        error instanceof ScheduleRequestError
          ? getSaveDraftFailureMessage(error.body, error.message)
          : (error as Error).message;
      setOperationError(message ?? (error as Error).message);
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
  ): Promise<ScheduleDraftSummary | null> {
    if (!context || !session) return null;
    const savingContext = currentMutationContext.current;
    try {
      return await saveScheduleDraft(
        context.workspace.id,
        session,
        name,
        target,
        acknowledgePastEdits,
      );
    } catch (error) {
      if (currentMutationContext.current !== savingContext) return null;
      const retroactiveError = parseRetroactiveEditError(error);
      if (!retroactiveError) throw error;
      const confirmed = await promptRetroactiveEdit(
        retroactiveError.mode,
        retroactiveError.findings,
        retroactiveError.messages,
      );
      if (!confirmed || retroactiveError.mode === "blocked" || currentMutationContext.current !== savingContext) return null;
      return saveDraftWithRetroactivePrompt(name, target, true);
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
        if (intent.kind === "save-and-export") {
          setSaveOpen(false); setExportAfterSave(false); setExportOpen(true);
        }
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
    if (saveRecovery?.intent.kind === "save-and-export") {
      setSaveOpen(false);
      setExportAfterSave(false);
    }
    setSaveRecovery(null);
  };

  const discardAfterSaveFailure = () => {
    setSaveRecovery(null); setSaveOpen(false); setExportAfterSave(false);
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
    const previousSession = session;
    try {
      const next = await action();
      if (throwOnError && mutationContext !== currentMutationContext.current) return null;
      if (!isSameEditSession(mutationContext, currentMutationContext.current)) return null;
      if (previousSession) rememberUndoSnapshot(previousSession);
      setSession(next);
      return next;
    } catch (error) {
      if (throwOnError && mutationContext !== currentMutationContext.current) return null;
      if (!isSameEditSession(mutationContext, currentMutationContext.current)) return null;
      if (throwOnError) throw error;
      const caught = error as Error;
      onError?.(caught);
      setOperationError(caught.message);
      toast.error("Schedule change could not be saved", {
        dedupeKey: "schedule-change-save-failed",
        description: formatScheduleConflictMessage(caught.message),
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

  const undoLastEdit = () => {
    const snapshot = popUndoSnapshot();
    if (!snapshot) return;
    setSession(snapshot);
    setPendingOps([]);
    toast.success("Last edit undone", {
      dedupeKey: "schedule-undo-last-edit",
      description: "The draft returned to the previous edit state.",
    });
  };

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
        undoSnapshotRef.current
      ) {
        if (!gridEditSession) return;
        event.preventDefault();
        event.stopPropagation();
        undoLastEdit();
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
      if (!gridEditSession) return;
      const currentSelectedIds = selectedIdsRef.current;
      if (isTextEditingTarget(event.target) || !currentSelectedIds.length)
        return;
      if (!copySelectedShifts(currentSelectedIds, { armPaste: true })) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const handlePaste = (event: ClipboardEvent) => {
      if (!gridEditSession) return;
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
    findEditableShift,
    removeSelected,
    requestDeleteSelected,
    selectedIds,
    gridEditSession,
    togglePasteMode,
    undoLastEdit,
    undoSnapshot,
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
      mode: isEditMode || gridEditSession ? "edit" : "preview", loading: previewSource.loading,
      requestedSourceKey: previewSource.requestedKey, resolvedSourceKey: previewSource.resolvedKey,
      source: previewSource.source, model: { ...query.data, shifts: effectiveShifts },
      workspaceName: context.workspace.name, selectedDate, view, search, focusedShiftId,
      display: { layout, employeeSortMode, hideUnscheduled, showShiftType, showShiftLabels, showClockTimes,
        showUnassignedShifts, showRoleSeparators, showTotalHours },
    });
  }, [exportOpen, query.data, context, isEditMode, gridEditSession, previewSource.loading, previewSource.requestedKey,
    previewSource.resolvedKey, effectiveShifts, selectedDate, view, search, focusedShiftId, layout,
    employeeSortMode, hideUnscheduled, showShiftType, showShiftLabels, showClockTimes,
    showUnassignedShifts, showRoleSeparators, showTotalHours]);

  // BL-193: the reason a read failed goes to the console, never onto the screen.
  useEffect(() => {
    if (query.error && !isNoAccess(query.error)) console.error(query.error);
  }, [query.error]);

  if (query.isPending)
    return (
      <ScheduleState
        title="Loading Schedule"
        detail="Resolving the published week."
      />
    );
  if (query.isError)
    return isNoAccess(query.error) ? (
      <NoAccessState
        subject="this schedule"
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
              periodLabel={
                view === "day"
                  ? formatPeriod(selectedDate, selectedDate, "day")
                  : `Week of ${new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`
              }
              onToggleViewMode={jumpToCurrentPeriod}
              onPrevious={() => changePeriod(view === "day" ? -1 : -7)}
              onNext={() => changePeriod(view === "day" ? 1 : 7)}
            />
          </div>
        </header>
        <ScheduleState
          title="Schedule unavailable"
          detail="This week's schedule could not be loaded. Try again."
          error
          onRetry={() => void query.refetch()}
        />
      </section>
    );

  const model = { ...query.data, shifts: effectiveShifts };
  const dropReviewAsk = dropReview.review
    ? scheduleDropReviewAsk(model, dropReview.review.drop.items.map((item) => item.input), dropReview.review.assessments)
    : null;
  // A drop the week on screen already flags waits for the server's check, so
  // its rule box opens before anything is written (M8, M12).
  const asksBeforeWrite = (input: ScheduleShiftMutationInput, shiftId: string | null) =>
    evaluateScheduleShiftConflicts(model, model.shifts, input, shiftId).some(isAvailabilityReminder);
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
        if (next) {
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
  const periodLabel = formatPeriod(selectedDate, model.week_start, view);
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
    model.closures,
    model.important_dates,
  );
  const toggleCurrentViewPeriod = () => {
    if (!isCurrentViewPeriod) {
      jumpToCurrentPeriod();
      return;
    }
    const next = new URLSearchParams(search);
    next.set("date", today);
    next.set("view", view === "week" ? "day" : "week");
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
    const liveSearch = new URLSearchParams(window.location.search);
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
      setExportAfterSave(false);
      setSaveOpen(false);
      return true;
    }
    if (sourceOpen) {
      setSourceOpen(false);
      return true;
    }
    if (templatesOpen) {
      setTemplatesOpen(false);
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
    if (preserveMatchingLocationHeader && liveSearch.has("locations")) {
      const higherPrioritySearchLayer =
        liveSearch.get("hideUnscheduled") === "true" ||
        liveSearch.has("shiftTypes") ||
        liveSearch.has("jobs") ||
        liveSearch.has("employees");
      if (!higherPrioritySearchLayer) return false;
    }
    if (preserveSearchFilters) return false;
    const dismissal = dismissNextScheduleSearchLayer({
      search: liveSearch,
      modelWeekStart: model.week_start,
      currentWeekStart: currentWeek,
      today,
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
      !target.closest(SCHEDULE_TOP_ACTION_SURFACE_SELECTOR)
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
      ? buildCellPresetMenuItems(model, cellMenu, useDefaultTimesForScheduling)
      : [];
  const openPresetCreateTarget = (target: PresetCreateTarget): void => {
    const validation = validatePresetCreateTarget(
      model,
      target,
      useDefaultTimesForScheduling,
    );
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
    if (
      context &&
      gridEditSession &&
      target.preset.startTime &&
      target.preset.endTime
    ) {
      dropReview.start({
        input: {
          location_id: target.locationId,
          employee_id: target.employeeId,
          job_id: target.preset.jobId,
          shift_type_id: target.preset.shiftTypeId,
          scheduled_date: target.date,
          start_time: target.preset.startTime!,
          end_time: target.preset.endTime!,
          unpaid_break_minutes: 30,
          hide_time_on_badge: !useDefaultTimesForScheduling,
          time_basis: "type_default",
          time_snapshot: {
            shift_type_id: target.preset.shiftTypeId,
            default_revision: model.shift_types.find((type) => type.id === target.preset.shiftTypeId)?.default_revision ?? 1,
            start_time: target.preset.startTime!, end_time: target.preset.endTime!,
            timezone: model.locations.find((location) => location.id === target.locationId)?.timezone ?? "UTC",
          },
          time_timezone: model.locations.find((location) => location.id === target.locationId)?.timezone ?? "UTC",
          label_ids: [],
          label_names: [],
          note: "",
        },
        save: async input => Boolean(await mutate(() => createScheduleShift(context.workspace.id, gridEditSession, input))),
      });
      return;
    }
    setEditor({
      mode: "create",
      locationId: target.locationId,
      employeeId: target.employeeId,
      date: target.date,
      preset: target.preset,
      x: target.point?.x,
      y: target.point?.y,
    });
  };
  const topBarActions = (
    <>
      {!isDiscardingEditSession && canExportSchedules ? (
        <button
          className={`schedule-export-action ${SCHEDULE_ACTION_BUTTON_CLASS}`}
          data-schedule-top-action-trigger="export"
          type="button"
          onClick={openExportDialog}
        >
          <FileDown size={15} aria-hidden /> Export
        </button>
      ) : null}
      {gates.templates ? (
        <button
          type="button"
          className={`schedule-template-action ${SCHEDULE_ACTION_BUTTON_CLASS}`}
          data-schedule-top-action-trigger="templates"
          onClick={openTemplatesDialog}
        >
          <LayoutTemplate size={15} aria-hidden /> Templates
        </button>
      ) : null}
      {gates.edit ? (
        <>
          <DraftDropdownMenu
            drafts={drafts}
            activeDraftId={activeDraftId}
            triggerLabel={
              drafts.find((draft) => draft.id === activeDraftId)?.name ??
              "New Schedule"
            }
            canEditPublishedSchedule={
              !pastWeek &&
              model.locations.some(
                (location) => location.publication_status === "published",
              )
            }
            canManageDrafts={!pastWeek && !gridEditSession}
            canStartDraft={
              !pastWeek && !gridEditSession && !isDiscardingEditSession
            }
            isStartingDraft={isDiscardingEditSession}
            publishedSchedule={
              publishedScheduleSummary?.published_at
                ? {
                    published_at: publishedScheduleSummary.published_at,
                    published_by_name:
                      publishedScheduleSummary.published_by_name,
                    source_draft_id: publishedScheduleSummary.source_draft_id,
                    source_draft_name:
                      publishedScheduleSummary.source_draft_name,
                  }
                : null
            }
            publishedLocationStatuses={publicationStatus?.locations ?? []}
            onOpen={() => {
              closeTopActionSurfaces("newSchedule");
              // A background refresh: the menu keeps the cached list, the reason goes to the console.
              void refreshDrafts().catch((error: unknown) => console.error(error));
            }}
            onOpenChange={setNewScheduleMenuOpen}
            dismissSignal={newScheduleDismissSignal}
            topActionId="new-schedule"
            onPreviewDraft={(draftId) => {
              void previewDraftFromMenu(draftId);
            }}
            onEditDraft={(draftId) => void editDraftFromMenu(draftId)}
            onStartBlankDraft={() => void startBlankDraftFromMenu()}
            onEditPublishedSchedule={() => void editDraftFromMenu(null)}
            onDeleteDraft={(draft) => void deleteDraftFromMenu(draft)}
            onUnpublishSchedule={
              canUnpublishSchedule(canPublishSchedule, hasPublishedSchedule)
                ? () => {
                    setUnpublishOpen(true);
                  }
                : undefined
            }
          />
        </>
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
        calendarMarkers={calendarMarkers}
        layout={layout}
        onLayoutChange={setLayout}
        onPreviousViewPeriod={() => changePeriod(view === "day" ? -1 : -7)}
        onNextViewPeriod={() => changePeriod(view === "day" ? 1 : 7)}
        onCurrentViewPeriodClick={toggleCurrentViewPeriod}
        isCurrentViewPeriod={isCurrentViewPeriod}
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
        useDefaultTimesForScheduling={useDefaultTimesForScheduling}
        onToggleUseDefaultTimesForScheduling={() =>
          setUseDefaultTimesForScheduling((current) => !current)
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
      />
      <ScheduleFilterCommandStrip chips={filterChips} />
      {activeDraftId && !gridEditSession && previewSource.error ? (
        <div className="schedule-operation-error" role="alert">
          This draft's shifts could not be loaded.
          <Button
            className="schedule-operation-retry"
            onClick={previewSource.retry}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {operationError ? (
        <div className="schedule-operation-error" role="alert">
          {operationError}
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
          {gridEditSession && undoSnapshot ? (
            <button type="button" onClick={undoLastEdit}>
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
      <ScheduleGrid
        model={sortedModel}
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
        useDefaultTimesForScheduling={useDefaultTimesForScheduling}
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
            optimisticOp: asksBeforeWrite(input, shift.id) ? undefined : createOptimisticPendingOp({ locationId, weekStart: gridEditSession.week_start, opType: "update", targetShiftId: shift.id,
              draftId: gridEditSession.source_draft_id, payload: input, actorUserId: gridEditSession.holder_user_id }),
            save: async input => Boolean(await mutate(() => updateScheduleShift(context.workspace.id, gridEditSession, shift.id, shift.revision, input), undefined, true)),
          });
        }}
        onCopyMove={(shift, locationId, employeeId, date) => {
          if (!context || !gridEditSession) return;
          const input = toScheduleShiftMutation(shift, { location_id: locationId, employee_id: employeeId, scheduled_date: date });
          dropReview.start({
            input,
            optimisticOp: asksBeforeWrite(input, null) ? undefined : createOptimisticPendingOp({ locationId, weekStart: gridEditSession.week_start, opType: "create", targetShiftId: null,
              draftId: gridEditSession.source_draft_id, payload: input, actorUserId: gridEditSession.holder_user_id }),
            save: async input => Boolean(await mutate(() => createScheduleShift(context.workspace.id, gridEditSession, input), undefined, true)),
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
      {sourceOpen && !pastWeek ? (
        <EnterEditModeDialog
          open={sourceOpen}
          drafts={drafts}
          onOpenChange={setSourceOpen}
          onStartBlank={() => acquire("blank")}
          onLoadDraft={(draftId) => acquire("draft", draftId)}
          onDeleteDraft={(draft) => void deleteDraftFromMenu(draft)}
        />
      ) : null}
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
      {editor && gridEditSession && context ? (
        <ShiftQuickEditor
          model={model}
          sessionId={gridEditSession.id}
          state={editor}
          timeFormat={model.settings.time_format}
          formatTime={formatTime}
          addDays={addDays}
          scheduleClosureCoversDate={scheduleClosureCoversDate}
          presentation="floating"
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
      {dropReviewAsk?.kind === "note" ? (
        <ScheduleNoteConfirm
          cell={dropReviewAsk.cell}
          when={dropReviewAsk.when}
          by={dropReviewAsk.by}
          employeeName={dropReviewAsk.employeeName}
          text={dropReviewAsk.text}
          disabled={dropReview.pending}
          onPlace={dropReview.confirm}
          onCancel={dropReview.dismiss}
        />
      ) : dropReview.review ? <ScheduleConflictSheet
        open
        messages={dropReviewAsk?.messages ?? []}
        description={dropReview.review.blocked ? "Resolve this conflict before changing the shift." : "Review these scheduling conflicts before placing the shift."}
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
              clearUndoStack();
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
      <ScheduleDiscardEditDialog
        open={discardConfirmOpen && Boolean(session)}
        isDiscarding={isDiscardingEditSession}
        onCancel={() => setDiscardConfirmOpen(false)}
        onConfirm={discardEditSession}
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
          description={exportAfterSave ? "Export is available in preview mode. Save this working copy as a draft to continue." : undefined}
          onClose={() => { if (!saveBusy) { setSaveOpen(false); setExportAfterSave(false); leaveScheduleDeepLink(); } }}
          onSave={(name, draft) => {
            if (saveBusy) return;
            const savingContext = currentMutationContext.current;
            setSaveBusy(true);
            void saveDraftFromMenu(name, Boolean(draft), draft?.id, exportAfterSave ? "save-and-export" : "save")
              .then(saved => {
                if (!saved) return;
                setSaveOpen(false);
                if (exportAfterSave) setExportOpen(true);
                setExportAfterSave(false);
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
            notifyEmployeeIds,
            preflightAck,
            departmentScope,
          ) =>
            publishScheduleDraft(
              context.workspace.id,
              preview,
              overrides,
              notifyEmployeeIds,
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
              toast.success(
                "Schedule published",
                result.notification_warning
                  ? {
                      dedupeKey: "schedule-publish-notification-warning",
                      description: result.notification_warning.message,
                    }
                  : result.notification_count
                    ? {
                        dedupeKey: "schedule-published",
                        description: `${countLabel(result.location_ids.length, "location", "locations")}, ${countLabel(result.published_shift_count, "change", "changes")}, ${countLabel(result.notification_count, "employee", "employees")} notified.`,
                      }
                    : {
                        dedupeKey: "schedule-published",
                        description: `${countLabel(result.location_ids.length, "location", "locations")} and ${countLabel(result.published_shift_count, "change", "changes")} published.`,
                      },
              );
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
              throw new Error("Save or close your current draft before opening another draft.");
            }
            const editing = session ?? await acquire("draft", choices.draftId, true);
            if (!editing) throw new Error("This draft could not be opened for editing. Check the edit lock and try again.");
            const shift = preflightReturnShift(editing, choices.draftId, finding.shift_ids);
            setPublishChoices(choices);
            setPublishOpen(false);
            setEditor(null);
            setEditorDirty(false);
            setShiftMenu(null);
            setCellMenu(null);
            setPasteArmed(false);
            setSearch((current) => preflightReturnSearch(current, shift, choices.draftId), { replace: true });
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
                throw new Error("Past schedule weeks cannot be unpublished.");
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
      {templatesOpen && context ? (
        <ScheduleTemplatesDialog
          templates={templates}
          drafts={drafts}
          session={gridEditSession}
          departments={model.departments}
          onClose={closeTemplates}
          onCreate={(draftId, name, stripAssignments) =>
            createScheduleTemplate(
              context.workspace.id,
              draftId,
              name,
              stripAssignments,
            ).then((result) => {
              toast.success("Template saved", {
                dedupeKey: "schedule-template-saved",
                description: name,
              });
              setTemplates((items) => [...items, result.template]);
            })
          }
          onRename={(template, name) =>
            renameScheduleTemplate(
              context.workspace.id,
              template.id,
              name,
              template.revision,
            ).then((result) => {
              toast.success("Template renamed", {
                dedupeKey: `schedule-template-renamed:${template.id}`,
                description: name,
              });
              setTemplates((items) =>
                items.map((item) =>
                  item.id === template.id ? result.template : item,
                ),
              );
            })
          }
          onDelete={(template) =>
            deleteScheduleTemplate(
              context.workspace.id,
              template.id,
              template.revision,
            )
              .then(() => {
                toast.success("Template deleted", {
                  dedupeKey: `schedule-template-deleted:${template.id}`,
                  description: template.name,
                });
                setTemplates((items) =>
                  items.filter((item) => item.id !== template.id),
                );
              })
              .catch((error: unknown) => {
                toast.error("Template could not be deleted", {
                  dedupeKey: `schedule-template-delete-failed:${template.id}`,
                  description: "Refresh templates, then try again.",
                });
                throw error;
              })
          }
          onApply={(templateId, mode, departmentKeys) =>
            gridEditSession
              ? applyScheduleTemplate(
                  context.workspace.id,
                  gridEditSession,
                  templateId,
                  mode,
                  departmentKeys,
                )
                  .then((result) => {
                    const templateName =
                      templates.find((item) => item.id === templateId)?.name ??
                      "Template";
                    // Archived labels left off: same toast, warning tone (BL-197).
                    (result.skipped.length ? toast.warning : toast.success)(
                      "Template applied",
                      {
                        dedupeKey: `schedule-template-applied:${templateId}`,
                        description: templateAppliedDescription(templateName, result),
                      },
                    );
                    rememberUndoSnapshot(gridEditSession);
                    setSession(result.session);
                    closeTemplates();
                  })
                  .catch((error: unknown) => {
                    toast.error(
                      "Template could not be applied",
                      {
                        dedupeKey: `schedule-template-apply-failed:${templateId}`,
                        description: "Refresh the draft, then try again.",
                      },
                    );
                    throw error;
                  })
              : Promise.resolve()
          }
        />
      ) : null}
      {defaultHoursOpen && context && gridEditSession ? <DefaultHoursReviewDialog key={`${context.workspace.id}:${gridEditSession.id}`} workspaceId={context.workspace.id} session={gridEditSession} model={model} initialSelectedIds={selectedIds}
        onClose={() => setDefaultHoursOpen(false)} onApplied={result => { rememberUndoSnapshot(gridEditSession); setSession(result); }} /> : null}
      {autoFill && context && gridEditSession ? (
        <AutoFillReviewOverlay
          preview={autoFill}
          onClose={() => setAutoFill(null)}
          onApply={(assignments) =>
            applyScheduleAutoFill(
              context.workspace.id,
              gridEditSession,
              autoFill,
              assignments,
            ).then((result) => {
              rememberUndoSnapshot(gridEditSession);
              setSession(result.session);
              if (result.rejected.length)
                setOperationError(
                  `${result.rejected.length} auto-fill assignment could not be applied.`,
                );
              return result;
            })
          }
        />
      ) : null}
      {exportOpen && canExportSchedules && context && !isEditMode && !gridEditSession ? (
        <ExportController key={`${context.userId}:${context.workspace.id}`} userId={context.userId}
          workspaceId={context.workspace.id} result={exportSnapshot} onClose={closeExport}
          canManageLocations={gates.manageLocations} sourceError={previewSource.error} />
      ) : null}
    </section>
  );
}

function scheduleLogoErrorText(error: unknown): string {
  return error instanceof Error ? error.message : "Logo could not be saved.";
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

function ScheduleDeleteSelectionDialog({
  open,
  count,
  onCancel,
  onConfirm,
}: {
  readonly open: boolean;
  readonly count: number;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return;
      if (event.key !== "Escape" && event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.key === "Escape") onCancel();
      else onConfirm();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel, onConfirm, open]);

  return open ? (
    <div className="schedule-discard-layer" role="presentation">
      <button
        type="button"
        className="schedule-discard-backdrop"
        aria-label="Cancel shift deletion"
        onClick={onCancel}
      />
      <section
        className="schedule-discard-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="schedule-delete-selection-title"
        aria-describedby="schedule-delete-selection-description"
      >
        <header>
          <span aria-hidden>
            <AlertTriangle size={18} />
          </span>
          <div>
            <h2 id="schedule-delete-selection-title">
              Delete selected shifts?
            </h2>
            <p id="schedule-delete-selection-description">
              {count === 1
                ? "This removes the selected shift from the edit session."
                : `This removes ${count} selected shifts from the edit session.`}
            </p>
          </div>
        </header>
        <footer>
          <button type="button" onClick={onCancel}>
            Keep shifts
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            <Trash2 size={15} aria-hidden />
            Delete
          </button>
        </footer>
      </section>
    </div>
  ) : null;
}

function ScheduleDiscardEditDialog({
  open,
  isDiscarding,
  onCancel,
  onConfirm,
}: {
  readonly open: boolean;
  readonly isDiscarding: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
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
        data-schedule-discard-edit-dialog="true"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="schedule-discard-edit-title"
        aria-describedby="schedule-discard-edit-description"
      >
        <header>
          <span aria-hidden>
            <AlertTriangle size={18} />
          </span>
          <div>
            <h2 id="schedule-discard-edit-title">Discard unsaved changes?</h2>
            <p id="schedule-discard-edit-description">
              This closes the edit session and returns to the live weekly
              schedule. Unsaved schedule changes will be removed.
            </p>
          </div>
        </header>
        <footer>
          <button type="button" onClick={onCancel} disabled={isDiscarding}>
            Keep editing
          </button>
          <button
            type="button"
            className="danger"
            onClick={onConfirm}
            disabled={isDiscarding}
          >
            <X size={15} aria-hidden />
            {isDiscarding ? "Discarding..." : "Discard"}
          </button>
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
