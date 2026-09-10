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
  countScheduleGridTotalColumns,
  createScheduleBadgeMeasurementVersion,
  createScheduleGridDays,
  createScheduleGridLocationGroups,
} from "../lib/scheduleGridLayout";
import { createScheduleGridViewModel } from "../lib/scheduleGridViewModel";
import { nextScheduleLocationHeaderFilter } from "../lib/scheduleLocationFilterToggle";
import type { ScheduleEmployeeSortMode } from "../lib/scheduleEmployeeSort";
import type { ShiftClipboardSnapshot } from "../lib/shiftClipboard";

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
  showTotalHours,
  showUnassignedShifts,
  unassignedFrozen,
  showJobColorDot,
  showRoleSeparators,
  showPresetShiftBadges,
  useDefaultTimesForScheduling,
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
}: {
  readonly model: ScheduleReadModel;
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
  readonly useDefaultTimesForScheduling: boolean;
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
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(
    () => filterScheduleModel(model, search),
    [model, search],
  );
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
  const totalColumns = countScheduleGridTotalColumns({
    columns,
    showTotalHours,
  });
  const {
    employeeRowGroups,
    fillerRowCount,
    rows,
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
    showUnassignedShifts,
    hasEditSession: Boolean(session),
    addDays,
  });
  const sourceCellStateByKey = useScheduleCellState(model);
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
    useDefaultTimesForScheduling,
    onMove,
    onCopyMove,
    onPresetCreate,
  });
  useEffect(() => {
    if (!shiftDrag.dragState) setActivePointerShiftLocationId(null);
  }, [shiftDrag.dragState]);
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
    layout,
    locationGroups,
    measuredBadgeWidth,
    view,
  });
  const fitVisibleColumns = layout === "unified" && view === "week";
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
      gridRef={gridRef}
      showTotalHours={showTotalHours}
      view={view}
      overlays={
        <ScheduleGridDragPreviews
          dragPreviewShift={dragPreviewShift}
          jobs={model.jobs}
          presetDragState={presetDrag.dragState}
          shiftDragState={shiftDrag.dragState}
          shiftTypes={model.shift_types}
          showShiftType={showShiftType}
          showShiftLabels={showShiftLabels}
          showClockTimes={showClockTimes}
          timeFormat={model.settings.time_format}
          showJobColorDot={showJobColorDot}
        />
      }
      onClearSelection={onClearSelection}
    >
      {renderScheduleBadgeWidthMeasurer({
        shifts: filtered.shifts,
        jobs: model.jobs,
        shiftTypes: model.shift_types,
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
        days={days}
        importantDates={model.important_dates}
        locationGroups={locationGroups}
        organizationLogoPlacement={organizationLogoPlacement}
        organizationLogoUrl={organizationLogoUrl}
        organizationName={organizationName}
        selectedDate={selectedDate}
        showTotalHours={showTotalHours}
        weekStartDate={model.week_start}
        onDayHeaderClick={onDayHeaderClick}
        onManageLogo={onManageLogo}
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
        onPresetMouseDown={presetDrag.onPresetMouseDown}
        onPresetPointerDown={presetDrag.onPresetPointerDown}
        onDragOverCell={setDragOverCell}
        onSelect={onSelect}
        onShiftContextMenu={onShiftContextMenu}
        onShiftMouseDown={handleShiftMouseDown}
        onShiftPointerDown={handleShiftPointerDown}
        pasteArmed={pasteArmed}
        rows={rows}
        selectedIds={selectedIds}
        showClockTimes={showClockTimes}
        timeFormat={model.settings.time_format}
        showEmployeeGroupHeaders={showEmployeeGroupHeaders}
        showEmployeeGroups={showEmployeeGroups}
        showJobColorDot={showJobColorDot}
        showLocationInBadge={showLocationInBadge}
        showShiftLabels={showShiftLabels}
        showShiftType={showShiftType}
        showShiftTypePresets={showShiftTypePresets}
        showTotalHours={showTotalHours}
        showUnassignedRow={showUnassignedRow}
        totalColumns={totalColumns}
        unassignedFrozen={unassignedFrozen}
        visibleShifts={filtered.shifts}
        visibleShiftTypes={filtered.shift_types}
      />
    </ScheduleGridShell>
  );
}
