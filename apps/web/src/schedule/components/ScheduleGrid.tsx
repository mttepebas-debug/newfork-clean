import type {
  ScheduleEditableShift,
  ScheduleEditSession,
  ScheduleReadModel,
  ScheduleShift,
  ScheduleView,
} from "@newfork/shared/schedule";
import type { ScheduleLogoPlacement } from "@newfork/shared";
import {
  useEffect,
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
import { useScheduleGridDragControllers } from "../hooks/useScheduleGridDragControllers";
import { useScheduleGridSelectionClear } from "../hooks/useScheduleGridSelectionClear";
import { addDays } from "../lib/scheduleDateTime";
import { filterScheduleModel, parseIds } from "../lib/scheduleFilterModel";
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
  readonly onOpenEmployeeCard: (employeeId: string) => void;
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
  const filtered = useMemo(() => {
    const next = filterScheduleModel(model, search);
    // The orange "!" shows only while editing with the switch on (KARARLAR Schedule,
    // 2026-10-06); time off stays. The rule box still reads the full model.
    return showAvailabilityMarks ? next : {
      ...next,
      shifts: next.shifts.map((shift) => shift.warning_codes.includes("availability")
        ? { ...shift, warning_codes: shift.warning_codes.filter((code) => code !== "availability") }
        : shift),
    };
  }, [model, search, showAvailabilityMarks]);
  const days = createScheduleGridDays({
    selectedDate,
    view,
    weekStart: model.week_start,
  });
  const locationGroups = createScheduleGridLocationGroups({
    layout,
    locations: filtered.locations,
  });
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
  } = createScheduleGridViewModel({
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
  });
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
  // While a shift is dragged, people who cannot take it at the shift's own
  // location leave the list until the drop; the shift's own person stays. A
  // preset has no location yet, so any location on screen counts (Mert,
  // 2026-10-09, item 4 B; the drop colors of 2026-10-06 stay for the rest).
  const dragRule = useMemo(() => {
    if (shiftDrag.dragState) {
      const shift = filtered.shifts.find((item) => item.id === shiftDrag.dragState?.activeShiftId);
      if (!shift?.job_id) return null;
      return {
        jobId: shift.job_id,
        shiftTypeId: shift.shift_type_id ?? null,
        ownerId: shift.employee_id,
        locationIds: [shift.location_id],
      };
    }
    if (presetDrag.dragState) {
      return {
        jobId: presetDrag.dragState.jobId,
        shiftTypeId: presetDrag.dragState.shiftTypeId,
        ownerId: null,
        locationIds: filtered.locations.map((location) => location.id),
      };
    }
    return null;
  }, [filtered.locations, filtered.shifts, presetDrag.dragState, shiftDrag.dragState]);
  const { grab: grabDragSource } = useKeepScrollThroughDrag({ active: Boolean(dragRule), gridRef });
  const { employeeRowGroups, rows } = useMemo(() => {
    if (!dragRule) return { employeeRowGroups: allEmployeeRowGroups, rows: allRows };
    const canTake = (employee: (typeof allRows)[number]) =>
      employee.id === dragRule.ownerId ||
      dragRule.locationIds.some((locationId) =>
        isScheduleEmployeeEligible(employee, {
          locationId,
          jobId: dragRule.jobId,
          shiftTypeId: dragRule.shiftTypeId,
        }),
      );
    return {
      rows: allRows.filter(canTake),
      employeeRowGroups: allEmployeeRowGroups
        .map((group) => ({ ...group, employees: group.employees.filter(canTake) }))
        .filter((group) => group.employees.length > 0),
    };
  }, [allEmployeeRowGroups, allRows, dragRule]);
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
      {renderScheduleBadgeWidthMeasurer({
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
      })}
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
        employeeRowGroups={employeeRowGroups}
        fillerRowCount={fillerRowCount}
        focusedShiftId={focusedShiftId}
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
        rows={rows}
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
