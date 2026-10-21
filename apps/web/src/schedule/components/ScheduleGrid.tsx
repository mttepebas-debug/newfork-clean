import type {
  ScheduleEditableShift,
  ScheduleEditSession,
  ScheduleReadModel,
  ScheduleShift,
  ScheduleView,
} from "@newfork/shared/schedule";
import type { ScheduleLogoPlacement, SchedulingSettings } from "@newfork/shared";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { CellContextMenuTarget } from "./ScheduleContextMenu";
import { ScheduleGridBody } from "./ScheduleGridBody";
import { ScheduleGridDragPreviews } from "./ScheduleGridDragPreviews";
import { ScheduleGridHeaders } from "./ScheduleGridHeaders";
import { ScheduleGridShell } from "./ScheduleGridShell";
import type { ActiveScheduleEditorTarget } from "./ScheduleRow";
import type { PresetCreateTarget } from "./SchedulePresetRows";
import { ScheduleState } from "./ScheduleState";
import {
  renderScheduleBadgeWidthMeasurer,
  useUniformScheduleBadgeWidth,
} from "../hooks/useScheduleBadgeMeasurements";
import { useKeepScrollThroughDrag } from "../hooks/useKeepScrollThroughDrag";
import {
  buildDisplayScheduleCellState,
  useScheduleCellState,
} from "../hooks/useCellState";
import { canTakeDraggedShift, useScheduleGridDragControllers } from "../hooks/useScheduleGridDragControllers";
import { useScheduleGridSelectionClear } from "../hooks/useScheduleGridSelectionClear";
import { addDays } from "../lib/scheduleDateTime";
import { filterScheduleModel, parseIds } from "../lib/scheduleFilterModel";
import { scheduleSearchTerm, searchScheduleModel } from "../lib/scheduleSearch";
import {
  calculateScheduleDayColumnMinWidth,
  countScheduleGridColumns,
  createScheduleBadgeMeasurementVersion,
  createScheduleGridDays,
  createScheduleGridLocationGroups,
} from "../lib/scheduleGridLayout";
import { createScheduleGridViewModel } from "../lib/scheduleGridViewModel";
import { nextScheduleLocationHeaderFilter } from "../lib/scheduleLocationFilterToggle";
import type { ScheduleEmployeeSortMode } from "../lib/scheduleEmployeeSort";
import type { ShiftClipboardSnapshot } from "../lib/shiftClipboard";
import { isScheduleEmployeeEligible } from "../lib/employeeEligibility";

export function ScheduleGrid({
  model,
  search,
  selectedDate,
  view,
  layout,
  hideUnscheduled,
  showShiftType,
  showShiftLabels,
  showClockTimes,
  timeFormat,
  publishWarnings,
  publishDeadlineDay,
  showTotalHours,
  showUnassignedShifts,
  unassignedFrozen,
  showJobColorDot,
  showRoleSeparators,
  showPresetShiftBadges,
  showAvailability = true,
  employeeSortMode,
  session,
  dragDisabled = false,
  activeEditorTarget = null,
  focusedShiftId,
  selectedIds,
  clipboard,
  pasteArmed,
  onSelect,
  onFocusShift,
  onEdit,
  onCreate,
  onPresetCreate,
  onCopy,
  onClearSelection,
  onShiftContextMenu,
  onCellContextMenu,
  onPaste,
  onMove,
  onCopyMove,
  onOpenEmployeeCard,
  onDayHeaderClick,
  onLocationHeaderClick,
  organizationName,
  organizationLogoUrl,
  organizationLogoPlacement,
  onManageLogo,
  onOpenPost,
}: {
  readonly model: ScheduleReadModel;
  /** BL-055: the viewer's own 12h/24h choice; the workspace's when they have none. */
  readonly timeFormat?: ScheduleReadModel["settings"]["time_format"];
  /** BL-683, BL-1025: false where the viewer cannot publish (Employee view, a manager without publish). */
  readonly publishWarnings?: boolean;
  /** Settings → Scheduling → Publish by. */
  readonly publishDeadlineDay?: SchedulingSettings["schedule_deadline_day"];
  readonly search: URLSearchParams;
  readonly selectedDate: string;
  readonly view: ScheduleView;
  readonly layout: "separate" | "unified";
  readonly hideUnscheduled: boolean;
  readonly showShiftType: boolean;
  readonly showShiftLabels: boolean;
  readonly showClockTimes: boolean;
  readonly showTotalHours: boolean;
  readonly showUnassignedShifts: boolean;
  readonly unassignedFrozen: boolean;
  readonly showJobColorDot: boolean;
  readonly showRoleSeparators: boolean;
  readonly showPresetShiftBadges: boolean;
  /** Off hides the orange availability marks only (M10); time off stays. */
  readonly showAvailability?: boolean;
  readonly employeeSortMode: ScheduleEmployeeSortMode;
  readonly session: ScheduleEditSession | null;
  readonly dragDisabled?: boolean;
  readonly activeEditorTarget?: ActiveScheduleEditorTarget | null;
  readonly focusedShiftId: string | null;
  readonly selectedIds: readonly string[];
  readonly clipboard: ShiftClipboardSnapshot | null;
  readonly pasteArmed: boolean;
  readonly onSelect: (id: string, additive: boolean) => void;
  readonly onFocusShift: (shift: ScheduleShift) => void;
  readonly onEdit: (
    shift: ScheduleEditableShift,
    point?: { readonly x: number; readonly y: number },
  ) => void;
  readonly onCreate: (
    locationId: string,
    employeeId: string | null,
    date: string,
    point?: { readonly x: number; readonly y: number },
  ) => void;
  readonly onPresetCreate: (target: PresetCreateTarget) => void;
  readonly onCopy: (shift: ScheduleEditableShift) => void;
  readonly onClearSelection: () => void;
  readonly onShiftContextMenu: (
    shift: ScheduleEditableShift,
    event: MouseEvent<HTMLElement>,
  ) => void;
  readonly onCellContextMenu: (
    target: Omit<CellContextMenuTarget, "x" | "y">,
    event: MouseEvent<HTMLElement>,
  ) => void;
  readonly onPaste: (
    locationId: string,
    employeeId: string | null,
    date: string,
    point?: { readonly x: number; readonly y: number },
  ) => void;
  readonly onMove: (
    shift: ScheduleEditableShift,
    locationId: string,
    employeeId: string | null,
    date: string,
  ) => void;
  readonly onCopyMove: (
    shift: ScheduleEditableShift,
    locationId: string,
    employeeId: string | null,
    date: string,
  ) => void;
  readonly onOpenEmployeeCard?: (employeeId: string) => void;
  readonly onDayHeaderClick: (
    date: string,
    locationIds: readonly string[],
  ) => void;
  readonly onLocationHeaderClick: (locationIds: string[]) => void;
  readonly organizationName: string;
  readonly organizationLogoUrl: string | null;
  readonly organizationLogoPlacement: ScheduleLogoPlacement | null;
  readonly onManageLogo?: () => void;
  /** A day header's post chip opens the post (EKRAN-08). */
  readonly onOpenPost?: (announcementId: string) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const showAvailabilityMarks = showAvailability && Boolean(session);
  const searched = useMemo(
    () =>
      searchScheduleModel(filterScheduleModel(model, search), scheduleSearchTerm(search), {
        day: view === "day" ? selectedDate : null,
      }),
    [model, search, selectedDate, view],
  );
  const filtered = useMemo(() => {
    const next = searched.model;
    // The orange "!" shows only while editing with the switch on (KARARLAR Schedule,
    // 2026-10-06); time off stays. The rule box still reads the full model.
    return showAvailabilityMarks ? next : {
      ...next,
      shifts: next.shifts.map((shift) => shift.warning_codes.includes("availability")
        ? { ...shift, warning_codes: shift.warning_codes.filter((code) => code !== "availability") }
        : shift),
    };
  }, [searched, showAvailabilityMarks]);
  // Kept between renders: a drag re-renders the grid every frame, and the
  // rows only redraw when what they show changed (atama-surukle B).
  const days = useMemo(() => createScheduleGridDays({
    selectedDate,
    view,
    weekStart: model.week_start,
  }), [selectedDate, view, model.week_start]);
  const locationGroups = useMemo(() => createScheduleGridLocationGroups({
    layout,
    locations: filtered.locations,
  }), [layout, filtered.locations]);
  const columns = countScheduleGridColumns({ days, locationGroups });
  const {
    employeeRowGroups: allEmployeeRowGroups,
    fillerRowCount,
    rows: allRows,
    showEmployeeGroupHeaders,
    showEmployeeGroups,
    showLocationInBadge,
    showShiftTypePresets,
    showUnassignedRow,
  } = useMemo(() => createScheduleGridViewModel({
    employeeSortMode,
    filtered,
    hideUnscheduled,
    layout,
    showPresetShiftBadges,
    showRoleSeparators,
    showTotalHours,
    // KARARLAR Schedule 2026-10-05 (BL-681): the open shifts row is part of
    // editing; view mode shows the published week plainly. Export keeps its
    // own rule (it reads the model with the row allowed).
    showUnassignedShifts: showUnassignedShifts && Boolean(session),
    hasEditSession: Boolean(session),
    addDays,
  }), [employeeSortMode, filtered, hideUnscheduled, layout, showPresetShiftBadges, showRoleSeparators, showTotalHours, showUnassignedShifts, session]);
  const sourceCellStateByKey = useScheduleCellState(model, !showAvailabilityMarks);
  const cellStateByKey = useMemo(
    () =>
      buildDisplayScheduleCellState({
        locationGroups,
        sourceState: sourceCellStateByKey,
      }),
    [locationGroups, sourceCellStateByKey],
  );
  const [activePointerShiftLocationId, setActivePointerShiftLocationId] =
    useState<string | null>(null);
  const {
    activeDragOverCell,
    draggedShiftId,
    dragPreviewShift,
    presetDrag,
    setDragOverCell,
    shiftDrag,
  } = useScheduleGridDragControllers({
    enabled: Boolean(session) && !dragDisabled,
    filtered,
    model,
    showShiftTypePresets,
    onMove,
    onCopyMove,
    onPresetCreate,
  });
  useEffect(() => {
    if (!shiftDrag.dragState) setActivePointerShiftLocationId(null);
  }, [shiftDrag.dragState]);
  // While a shift is dragged, people who cannot take it on any day of the week
  // at the shift's own location fold away until the drop; the shift's own
  // person stays. A cell refuses what its drop colour refuses (the server's
  // blocks: location, job, approved time off, an overlap), so somebody off on
  // Monday stays for Tuesday (Mert, 2026-10-20, atama-surukle B; 2026-10-09
  // item 4 B before). A preset has no location yet, so any location on
  // screen counts. Worked out once per drag, not per pointer move.
  const draggedId = shiftDrag.dragState?.activeShiftId ?? null;
  const presetJobId = presetDrag.dragState?.jobId ?? null;
  const presetShiftTypeId = presetDrag.dragState?.shiftTypeId ?? null;
  const dragKey = draggedId ?? (presetJobId ? `preset|${presetJobId}|${presetShiftTypeId ?? ""}` : null);
  // The rows fold a frame after the card lifts, and unfold a frame after it
  // lands: the lift and the landing are drawn first, at once, and the bigger
  // redraw of the rows follows (atama-surukle B, 2026-10-20). Who folds is
  // worked out once, from the drag as it began.
  const latest = useRef({ allRows, days, filtered, model, presetJobId, presetShiftTypeId });
  useLayoutEffect(() => {
    latest.current = { allRows, days, filtered, model, presetJobId, presetShiftTypeId };
  });
  const [fold, setFold] = useState<{ readonly key: string; readonly rows: ReadonlySet<string> } | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        const rows = dragKey ? foldedRows(latest.current, dragKey) : null;
        setFold(dragKey && rows ? { key: dragKey, rows } : null);
      }, 0);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [dragKey]);
  const hiddenRowIds = fold?.rows ?? null;
  // Folding is written straight onto the rows' cells: the rows are not drawn
  // again, so a drag starts in one frame (atama-surukle B). Before the scroll
  // keeper below, which measures the folded grid.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || !hiddenRowIds?.size) return undefined;
    const folded = Array.from(grid.querySelectorAll<HTMLElement>(":scope > [data-schedule-row-owner]"))
      .filter((item) => hiddenRowIds.has(item.dataset.scheduleRowOwner ?? ""));
    for (const item of folded) {
      item.dataset.dragHidden = "true";
      item.setAttribute("aria-hidden", "true");
    }
    return () => {
      for (const item of folded) {
        delete item.dataset.dragHidden;
        item.removeAttribute("aria-hidden");
      }
    };
  }, [hiddenRowIds]);
  const { grab: grabDragSource } = useKeepScrollThroughDrag({ active: hiddenRowIds !== null, gridRef });
  const activeDragShiftLocationId = useMemo(() => {
    const activeShiftId = shiftDrag.dragState?.activeShiftId;
    if (!activeShiftId) return null;
    return (
      filtered.shifts.find((shift) => shift.id === activeShiftId)
        ?.location_id ?? null
    );
  }, [filtered.shifts, shiftDrag.dragState]);
  const activeInteractionShiftLocationId =
    activePointerShiftLocationId ?? activeDragShiftLocationId;
  const handleShiftPointerDown = (
    shiftId: string,
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    if (event.detail > 1) {
      shiftDrag.endDrag();
      setActivePointerShiftLocationId(null);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (selectedIds.length > 1) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const shift = filtered.shifts.find((item) => item.id === shiftId);
    setActivePointerShiftLocationId(shift?.location_id ?? null);
    grabDragSource(event.currentTarget);
    shiftDrag.onShiftPointerDown(shiftId, event);
  };
  const handleShiftMouseDown = (
    shiftId: string,
    event: MouseEvent<HTMLElement>,
  ): void => {
    if (event.detail > 1) {
      shiftDrag.endDrag();
      setActivePointerShiftLocationId(null);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (selectedIds.length > 1) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const shift = filtered.shifts.find((item) => item.id === shiftId);
    setActivePointerShiftLocationId(shift?.location_id ?? null);
    grabDragSource(event.currentTarget);
    shiftDrag.onShiftMouseDown(shiftId, event);
  };
  const handleEdit = (
    shift: ScheduleEditableShift,
    point?: { readonly x: number; readonly y: number },
  ): void => {
    shiftDrag.endDrag();
    setActivePointerShiftLocationId(null);
    onEdit(shift, point);
  };
  // Every card once, off screen, to size the days: not again on each pointer move.
  const badgeWidthMeasurer = useMemo(() => renderScheduleBadgeWidthMeasurer({
    shifts: filtered.shifts,
    catalog: model,
    editing: Boolean(session),
    locationGroups,
    showShiftType,
    showShiftLabels,
    showClockTimes,
    timeFormat: model.settings.time_format,
    showJobColorDot,
    showLocationInBadge,
    showShiftTypePresets,
  }), [filtered.shifts, model, session, locationGroups, showShiftType, showShiftLabels, showClockTimes, showJobColorDot, showLocationInBadge, showShiftTypePresets]);
  const measuredBadgeWidth = useUniformScheduleBadgeWidth({
    containerRef: gridRef,
    minimumWidth: view === "week" ? 0 : 126,
    version: createScheduleBadgeMeasurementVersion({
      shifts: filtered.shifts,
      jobs: model.jobs,
      shiftTypes: model.shift_types,
      locationGroups,
      showShiftTypePresets,
      showShiftType,
      showShiftLabels,
      showClockTimes,
      timeFormat: model.settings.time_format,
      showJobColorDot,
      showLocationInBadge,
    }),
  });
  const dayColumnMinWidth = calculateScheduleDayColumnMinWidth({
    editing: Boolean(session),
    locationGroups,
    measuredBadgeWidth,
    view,
  });
  const fitVisibleColumns = locationGroups.length <= 1 && view === "week";
  const selectedLocationFilterIds = parseIds(search.get("locations"));
  const toggleLocationHeaderFilter = (locationIds: readonly string[]): void => {
    const nextLocationIds = nextScheduleLocationHeaderFilter({
      selectedLocationIds: selectedLocationFilterIds,
      toggledLocationIds: locationIds,
    });
    if (nextLocationIds === selectedLocationFilterIds) return;
    onLocationHeaderClick([...nextLocationIds]);
  };

  useScheduleGridSelectionClear({
    enabled: selectedIds.length > 0,
    gridRef,
    onClearSelection,
  });

  if (!filtered.locations.length)
    return (
      <ScheduleState
        title="No locations match"
        detail="Clear the location filter to restore the schedule grid."
      />
    );

  return (
    <ScheduleGridShell
      columns={columns}
      dayColumnMinWidth={dayColumnMinWidth}
      dragPointer={
        shiftDrag.dragState
          ? { x: shiftDrag.dragState.pointerX, y: shiftDrag.dragState.pointerY }
          : null
      }
      editing={Boolean(session)}
      fitVisibleColumns={fitVisibleColumns}
      fitWeeklyLocations={view === "week" && !fitVisibleColumns}
      gridRef={gridRef}
      published={
        locationGroups.length > 0 &&
        locationGroups.every((group) => group.publication_status === "published")
      }
      showTotalHours={showTotalHours}
      view={view}
      overlays={
        <ScheduleGridDragPreviews
          dragPreviewShift={dragPreviewShift}
          catalog={model}
          presetDragState={presetDrag.dragState}
          shiftDragState={shiftDrag.dragState}
          showShiftType={showShiftType}
          showShiftLabels={showShiftLabels}
          showClockTimes={showClockTimes}
          timeFormat={timeFormat ?? model.settings.time_format}
          showJobColorDot={showJobColorDot}
        />
      }
      onClearSelection={onClearSelection}
    >
      {badgeWidthMeasurer}
      <ScheduleGridHeaders
        closures={model.closures}
        timeFormat={model.settings.time_format}
        days={days}
        importantDates={model.important_dates}
        locationGroups={locationGroups}
        organizationLogoPlacement={organizationLogoPlacement}
        organizationLogoUrl={organizationLogoUrl}
        organizationName={organizationName}
        selectedDate={selectedDate}
        showTotalHours={showTotalHours}
        weekStartDate={model.week_start}
        publishWarnings={publishWarnings}
        publishDeadlineDay={publishDeadlineDay}
        onDayHeaderClick={onDayHeaderClick}
        onManageLogo={onManageLogo}
        onOpenPost={onOpenPost}
        onToggleLocationFilter={toggleLocationHeaderFilter}
      />
      <ScheduleGridBody
        activeDragOverCell={activeDragOverCell}
        activeEditorTarget={activeEditorTarget}
        activeInteractionShiftLocationId={activeInteractionShiftLocationId}
        cellStateByKey={cellStateByKey}
        clipboard={clipboard}
        days={days}
        draggedShiftId={draggedShiftId}
        dragState={shiftDrag.dragState ?? presetDrag.dragState}
        editing={Boolean(session)}
        employeeRowGroups={allEmployeeRowGroups}
        hiddenRowIds={hiddenRowIds}
        fillerRowCount={fillerRowCount}
        focusedShiftId={focusedShiftId}
        searchMarks={searched.marks}
        locations={locationGroups}
        model={model}
        onCellContextMenu={onCellContextMenu}
        onClearSelection={onClearSelection}
        onCopy={onCopy}
        onCreate={onCreate}
        onEdit={handleEdit}
        onFocusShift={onFocusShift}
        onOpenEmployeeCard={onOpenEmployeeCard}
        onPaste={onPaste}
        onPresetCreate={onPresetCreate}
        onPresetMouseDown={(preset, event) => {
          grabDragSource(event.currentTarget);
          presetDrag.onPresetMouseDown(preset, event);
        }}
        onPresetPointerDown={(preset, event) => {
          grabDragSource(event.currentTarget);
          presetDrag.onPresetPointerDown(preset, event);
        }}
        onDragOverCell={setDragOverCell}
        onSelect={onSelect}
        onShiftContextMenu={onShiftContextMenu}
        onShiftMouseDown={handleShiftMouseDown}
        onShiftPointerDown={handleShiftPointerDown}
        pasteArmed={pasteArmed}
        rows={allRows}
        selectedIds={selectedIds}
        showClockTimes={showClockTimes}
        timeFormat={timeFormat ?? model.settings.time_format}
        showEmployeeGroupHeaders={showEmployeeGroupHeaders}
        showEmployeeGroups={showEmployeeGroups}
        showJobColorDot={showJobColorDot}
        showLocationInBadge={showLocationInBadge}
        showShiftLabels={showShiftLabels}
        showShiftType={showShiftType}
        showShiftTypePresets={showShiftTypePresets}
        showTotalHours={showTotalHours}
        showUnassignedRow={showUnassignedRow}
        unassignedFrozen={unassignedFrozen}
        visibleShifts={filtered.shifts}
        visibleShiftTypes={filtered.shift_types}
      />
    </ScheduleGridShell>
  );
}

/** The people with no cell for what is dragged: a shift (by id) or a preset ("preset|job|type"). */
function foldedRows(
  {
    allRows,
    days,
    filtered,
    model,
    presetJobId,
    presetShiftTypeId,
  }: {
    readonly allRows: readonly ScheduleReadModel["employees"][number][];
    readonly days: readonly string[];
    readonly filtered: ScheduleReadModel;
    readonly model: ScheduleReadModel;
    readonly presetJobId: string | null;
    readonly presetShiftTypeId: string | null;
  },
  key: string,
): ReadonlySet<string> | null {
  if (key.startsWith("preset|")) {
    if (!presetJobId) return null;
    return new Set(allRows.filter((employee) => !filtered.locations.some((location) =>
      isScheduleEmployeeEligible(employee, { locationId: location.id, jobId: presetJobId, shiftTypeId: presetShiftTypeId }),
    )).map((employee) => employee.id));
  }
  const shift = filtered.shifts.find((item) => item.id === key) as ScheduleEditableShift | undefined;
  if (!shift?.job_id) return null;
  return new Set(allRows.filter((employee) => !canTakeDraggedShift({ model, shift, employee, dates: days }))
    .map((employee) => employee.id));
}
