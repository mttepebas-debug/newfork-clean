import type {
  ScheduleEditableShift,
  ScheduleEmployee,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import {
  Fragment,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { ScheduleCellStateMap } from "../hooks/useCellState";
import type { ShiftDragState } from "../hooks/useSingleShiftPointerDrag";
import type { ScheduleGridLocationGroup } from "../lib/scheduleGridLayout";
import type { ScheduleSearchMark } from "../lib/scheduleSearch";
import type { ShiftClipboardSnapshot } from "../lib/shiftClipboard";
import type { CellContextMenuTarget } from "./ScheduleContextMenu";
import { ScheduleFillerRow } from "./ScheduleFillerRow";
import {
  ScheduleGroupLabelRow,
  SchedulePresetRows,
  type PresetCreateTarget,
  type PresetDragSource,
  type PresetDragState,
} from "./SchedulePresetRows";
import { ScheduleRow, type ActiveScheduleEditorTarget } from "./ScheduleRow";
import { ScheduleTotalsRow } from "./ScheduleTotalsRow";

export interface ScheduleEmployeeGroup {
  readonly job: ScheduleReadModel["jobs"][number] | null;
  readonly employees: readonly ScheduleEmployee[];
}

export function ScheduleGridBody({
  activeDragOverCell,
  activeEditorTarget = null,
  activeInteractionShiftLocationId = null,
  cellStateByKey,
  clipboard,
  days,
  draggedShiftId,
  dragState,
  editing,
  employeeRowGroups,
  fillerRowCount,
  focusedShiftId,
  searchMarks,
  locations,
  model,
  onCellContextMenu,
  onClearSelection,
  onCopy,
  onCreate,
  onEdit,
  onFocusShift,
  onOpenEmployeeCard,
  onPaste,
  onPresetCreate,
  onPresetMouseDown,
  onPresetPointerDown,
  onDragOverCell,
  onSelect,
  onShiftContextMenu,
  onShiftMouseDown,
  onShiftPointerDown,
  pasteArmed,
  rows,
  selectedIds,
  showClockTimes,
  timeFormat,
  showEmployeeGroupHeaders,
  showEmployeeGroups,
  showJobColorDot,
  showLocationInBadge,
  showShiftLabels,
  showShiftType,
  showShiftTypePresets,
  showTotalHours,
  showUnassignedRow,
  unassignedFrozen,
  visibleShifts,
  visibleShiftTypes,
}: {
  readonly activeDragOverCell: string | null;
  readonly activeEditorTarget?: ActiveScheduleEditorTarget | null;
  readonly activeInteractionShiftLocationId?: string | null;
  readonly cellStateByKey: ScheduleCellStateMap;
  readonly clipboard: ShiftClipboardSnapshot | null;
  readonly days: readonly string[];
  readonly draggedShiftId: string | null;
  readonly dragState: ShiftDragState | PresetDragState | null;
  readonly editing: boolean;
  readonly employeeRowGroups: readonly ScheduleEmployeeGroup[];
  readonly fillerRowCount: number;
  readonly focusedShiftId: string | null;
  readonly searchMarks?: ReadonlyMap<string, ScheduleSearchMark>;
  readonly locations: readonly ScheduleGridLocationGroup[];
  readonly model: ScheduleReadModel;
  readonly onCellContextMenu: (
    target: Omit<CellContextMenuTarget, "x" | "y">,
    event: MouseEvent<HTMLElement>,
  ) => void;
  readonly onClearSelection: () => void;
  readonly onCopy: (shift: ScheduleEditableShift) => void;
  readonly onCreate: (
    locationId: string,
    employeeId: string | null,
    date: string,
    point?: { readonly x: number; readonly y: number },
  ) => void;
  readonly onEdit: (
    shift: ScheduleEditableShift,
    point?: { readonly x: number; readonly y: number },
  ) => void;
  readonly onFocusShift: (shift: ScheduleShift) => void;
  readonly onOpenEmployeeCard?: (employeeId: string) => void;
  readonly onPaste: (
    locationId: string,
    employeeId: string | null,
    date: string,
    point?: { readonly x: number; readonly y: number },
  ) => void;
  readonly onPresetCreate: (target: PresetCreateTarget) => void;
  readonly onPresetMouseDown?: (
    preset: PresetDragSource,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  readonly onPresetPointerDown?: (
    preset: PresetDragSource,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  readonly onDragOverCell: (cellKey: string | null) => void;
  readonly onSelect: (id: string, additive: boolean) => void;
  readonly onShiftContextMenu: (
    shift: ScheduleEditableShift,
    event: MouseEvent<HTMLElement>,
  ) => void;
  readonly onShiftMouseDown: (
    shiftId: string,
    event: MouseEvent<HTMLElement>,
  ) => void;
  readonly onShiftPointerDown: (
    shiftId: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  readonly pasteArmed: boolean;
  readonly rows: readonly ScheduleEmployee[];
  readonly selectedIds: readonly string[];
  readonly showClockTimes: boolean;
  readonly timeFormat: ScheduleReadModel["settings"]["time_format"];
  readonly showEmployeeGroupHeaders: boolean;
  readonly showEmployeeGroups: boolean;
  readonly showJobColorDot: boolean;
  readonly showLocationInBadge: boolean;
  readonly showShiftLabels: boolean;
  readonly showShiftType: boolean;
  readonly showShiftTypePresets: boolean;
  readonly showTotalHours: boolean;
  readonly showUnassignedRow: boolean;
  readonly unassignedFrozen: boolean;
  readonly visibleShifts: readonly ScheduleShift[];
  readonly visibleShiftTypes: ScheduleReadModel["shift_types"];
}) {
  const renderEmployeeRow = (employee: ScheduleEmployee) => (
    <ScheduleRow
      key={employee.id}
      employee={employee}
      shifts={visibleShifts}
      totalShifts={model.shifts}
      locations={locations}
      activeEditorTarget={activeEditorTarget}
      activeInteractionShiftLocationId={activeInteractionShiftLocationId}
      days={days}
      catalog={model}
      closures={model.closures}
      cellStateByKey={cellStateByKey}
      editing={editing}
      showShiftType={showShiftType}
      showShiftLabels={showShiftLabels}
      showClockTimes={showClockTimes}
      timeFormat={timeFormat}
      showTotalHours={showTotalHours}
      showJobColorDot={showJobColorDot}
      showLocationInBadge={showLocationInBadge}
      unassignedFrozen={false}
      selectedIds={selectedIds}
      focusedShiftId={focusedShiftId}
      searchMarks={searchMarks}
      clipboard={clipboard}
      pasteArmed={pasteArmed}
      onSelect={onSelect}
      onFocusShift={onFocusShift}
      onEdit={onEdit}
      onCreate={onCreate}
      onCopy={onCopy}
      onClearSelection={onClearSelection}
      onShiftContextMenu={onShiftContextMenu}
      onCellContextMenu={onCellContextMenu}
      onPaste={onPaste}
      draggedShiftId={draggedShiftId}
      dragOverCell={activeDragOverCell}
      dragState={dragState}
      onShiftPointerDown={onShiftPointerDown}
      onShiftMouseDown={onShiftMouseDown}
      onDragOverCell={onDragOverCell}
      onOpenEmployeeCard={onOpenEmployeeCard}
    />
  );

  return (
    <>
      {showUnassignedRow ? (
        <ScheduleRow
          employee={null}
          shifts={visibleShifts}
          totalShifts={model.shifts}
          locations={locations}
          activeEditorTarget={activeEditorTarget}
          activeInteractionShiftLocationId={activeInteractionShiftLocationId}
          days={days}
          catalog={model}
          closures={model.closures}
          cellStateByKey={cellStateByKey}
          editing={editing}
          showShiftType={showShiftType}
          showShiftLabels={showShiftLabels}
          showClockTimes={showClockTimes}
          timeFormat={timeFormat}
          showTotalHours={showTotalHours}
          showJobColorDot={showJobColorDot}
          showLocationInBadge={showLocationInBadge}
          unassignedFrozen={unassignedFrozen}
          selectedIds={selectedIds}
          focusedShiftId={focusedShiftId}
          searchMarks={searchMarks}
          clipboard={clipboard}
          pasteArmed={pasteArmed}
          onSelect={onSelect}
          onFocusShift={onFocusShift}
          onEdit={onEdit}
          onCreate={onCreate}
          onCopy={onCopy}
          onClearSelection={onClearSelection}
          onShiftContextMenu={onShiftContextMenu}
          onCellContextMenu={onCellContextMenu}
          onPaste={onPaste}
          draggedShiftId={draggedShiftId}
          dragOverCell={activeDragOverCell}
          dragState={dragState}
          onShiftPointerDown={onShiftPointerDown}
          onShiftMouseDown={onShiftMouseDown}
          onDragOverCell={onDragOverCell}
          onOpenEmployeeCard={onOpenEmployeeCard}
        />
      ) : null}
      {/* Space for the rows that left above a dragged card (useKeepScrollThroughDrag). */}
      {dragState ? <div className="schedule-drag-hold-space" aria-hidden="true" /> : null}
      {showEmployeeGroups
        ? employeeRowGroups.map((group) => (
            <Fragment key={`schedule-job-group-${group.job?.id ?? "none"}`}>
              {group.job && showShiftTypePresets ? (
                <SchedulePresetRows
                  job={group.job}
                  shiftTypes={visibleShiftTypes}
                  locations={locations}
                  activeInteractionShiftLocationId={
                    activeInteractionShiftLocationId
                  }
                  days={days}
                  editing={editing}
                  showTotalHours={showTotalHours}
                  onPresetCreate={onPresetCreate}
                  onPresetPointerDown={onPresetPointerDown}
                  onPresetMouseDown={onPresetMouseDown}
                />
              ) : showEmployeeGroupHeaders ? (
                <ScheduleGroupLabelRow
                  label={group.job?.name ?? "Unassigned job"}
                  groupId={group.job?.id ?? "none"}
                  color={group.job?.color ?? null}
                  locations={locations}
                  days={days}
                  showTotalHours={showTotalHours}
                />
              ) : null}
              {group.employees.map(renderEmployeeRow)}
            </Fragment>
          ))
        : rows.map(renderEmployeeRow)}
      {!rows.length ? <p className="sr-only">No employees</p> : null}
      {Array.from({ length: fillerRowCount }, (_, rowIndex) => (
        <ScheduleFillerRow
          key={`schedule-filler-${rowIndex}`}
          locations={locations}
          days={days}
          empty={!rows.length}
          showTotalHours={showTotalHours}
        />
      ))}
      {showTotalHours ? (
        <ScheduleTotalsRow
          visibleShifts={visibleShifts}
          totalShifts={model.shifts}
          locations={locations}
          days={days}
        />
      ) : null}
    </>
  );
}
