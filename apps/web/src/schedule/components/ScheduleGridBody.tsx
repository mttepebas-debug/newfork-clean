import type {
  ScheduleEditableShift,
  ScheduleEmployee,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import {
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { ScheduleCellState, ScheduleCellStateMap } from "../hooks/useCellState";
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
  hiddenRowIds = null,
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
  /** People folded away while a shift or preset is dragged (they stay mounted). */
  readonly hiddenRowIds?: ReadonlySet<string> | null;
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
  // The same functions on every render, calling the latest ones: a row only
  // redraws when what it shows changed, not on each pointer move of a drag.
  const handlers = useStableHandlers({
    onCellContextMenu, onClearSelection, onCopy, onCreate, onEdit, onFocusShift, onOpenEmployeeCard,
    onPaste, onDragOverCell, onSelect, onShiftContextMenu, onShiftMouseDown, onShiftPointerDown,
  });
  const openEmployeeCard = onOpenEmployeeCard ? handlers.onOpenEmployeeCard : undefined;
  // A drag's moving parts reach only the row under the pointer (and the open
  // shifts row, which stacks the dragged open shift).
  const dragStateFor = (rowKey: string) => (dragState && (rowKey === "unassigned" || ownsKey(dragState.targetKey, rowKey)) ? dragState : null);
  // A cell's own location only depends on the dragged shift where one day
  // column holds several locations (Unified); elsewhere no row redraws for it.
  const interactionLocationId = locations.some((location) => location.sourceIds.length > 1) ? activeInteractionShiftLocationId : null;
  // The lifted card's own row is the only one that greys it out.
  const draggedOwner = draggedShiftId ? (visibleShifts.find((shift) => shift.id === draggedShiftId)?.employee_id ?? "unassigned") : null;
  const draggedFor = (rowKey: string) => (draggedOwner === rowKey ? draggedShiftId : null);
  const dragOverFor = (rowKey: string) => (ownsKey(activeDragOverCell, rowKey) ? activeDragOverCell : null);
  const slices = useRowSlices({ visibleShifts, totalShifts: model.shifts, cellStateByKey });
  const catalog = useMemo(() => ({
    jobs: model.jobs,
    shift_types: model.shift_types,
    referenced_jobs: model.referenced_jobs,
    referenced_shift_types: model.referenced_shift_types,
  }), [model.jobs, model.shift_types, model.referenced_jobs, model.referenced_shift_types]);
  const renderEmployeeRow = (employee: ScheduleEmployee) => (
    <ScheduleRow
      key={employee.id}
      employee={employee}
      shifts={slices.shifts(employee.id)}
      totalShifts={slices.totalShifts(employee.id)}
      locations={locations}
      activeEditorTarget={activeEditorTarget}
      activeInteractionShiftLocationId={interactionLocationId}
      days={days}
      catalog={catalog}
      closures={model.closures}
      cellStateByKey={slices.cells(employee.id)}
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
      onSelect={handlers.onSelect}
      onFocusShift={handlers.onFocusShift}
      onEdit={handlers.onEdit}
      onCreate={handlers.onCreate}
      onCopy={handlers.onCopy}
      onClearSelection={handlers.onClearSelection}
      onShiftContextMenu={handlers.onShiftContextMenu}
      onCellContextMenu={handlers.onCellContextMenu}
      onPaste={handlers.onPaste}
      draggedShiftId={draggedFor(employee.id)}
      dragOverCell={dragOverFor(employee.id)}
      dragState={dragStateFor(employee.id)}
      onShiftPointerDown={handlers.onShiftPointerDown}
      onShiftMouseDown={handlers.onShiftMouseDown}
      onDragOverCell={handlers.onDragOverCell}
      onOpenEmployeeCard={openEmployeeCard}
    />
  );

  return (
    <>
      {showUnassignedRow ? (
        <ScheduleRow
          employee={null}
          shifts={slices.shifts(null)}
          totalShifts={slices.totalShifts(null)}
          locations={locations}
          activeEditorTarget={activeEditorTarget}
          activeInteractionShiftLocationId={interactionLocationId}
          days={days}
          catalog={catalog}
          closures={model.closures}
          cellStateByKey={slices.cells(null)}
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
          onSelect={handlers.onSelect}
          onFocusShift={handlers.onFocusShift}
          onEdit={handlers.onEdit}
          onCreate={handlers.onCreate}
          onCopy={handlers.onCopy}
          onClearSelection={handlers.onClearSelection}
          onShiftContextMenu={handlers.onShiftContextMenu}
          onCellContextMenu={handlers.onCellContextMenu}
          onPaste={handlers.onPaste}
          draggedShiftId={draggedFor("unassigned")}
          dragOverCell={dragOverFor("unassigned")}
          dragState={dragStateFor("unassigned")}
          onShiftPointerDown={handlers.onShiftPointerDown}
          onShiftMouseDown={handlers.onShiftMouseDown}
          onDragOverCell={handlers.onDragOverCell}
          onOpenEmployeeCard={openEmployeeCard}
        />
      ) : null}
      {/* Space for the rows that left above a dragged card (useKeepScrollThroughDrag). */}
      {editing ? <div className="schedule-drag-hold-space" aria-hidden="true" /> : null}
      {showEmployeeGroups
        ? employeeRowGroups.map((group) => (
            <Fragment key={`schedule-job-group-${group.job?.id ?? "none"}`}>
              {hiddenRowIds && group.employees.every((employee) => hiddenRowIds.has(employee.id)) ? null : group.job && showShiftTypePresets ? (
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

/** A row's cells use two key shapes: "<row>|<location>|<date>" and "<row>-<location>-<date>". */
function ownsKey(key: string | null | undefined, rowKey: string): boolean {
  return Boolean(key && (key.startsWith(`${rowKey}|`) || key.startsWith(`${rowKey}-`)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = ((...args: any[]) => unknown) | undefined;
function useStableHandlers<T extends Record<string, Handler>>(latest: T): { readonly [K in keyof T]-?: NonNullable<T[K]> } {
  const ref = useRef(latest);
  useLayoutEffect(() => {
    ref.current = latest;
  });
  const [stable] = useState(() => Object.fromEntries(Object.keys(latest).map((name) => [
    name,
    (...args: unknown[]) => ref.current[name]?.(...args),
  ])) as unknown as { readonly [K in keyof T]-?: NonNullable<T[K]> });
  return stable;
}

const NO_SHIFTS: readonly ScheduleShift[] = [];
const NO_CELLS: ScheduleCellStateMap = new Map();

/**
 * Each row's own shifts and cells, as the same arrays and maps while what is
 * in them stays the same: a drop or a save changes one or two rows, and only
 * those draw again (atama-surukle B, 2026-10-20).
 */
function useRowSlices({
  visibleShifts,
  totalShifts,
  cellStateByKey,
}: {
  readonly visibleShifts: readonly ScheduleShift[];
  readonly totalShifts: readonly ScheduleShift[];
  readonly cellStateByKey: ScheduleCellStateMap;
}) {
  const kept = useRef({
    shifts: new Map<string, { key: string; value: readonly ScheduleShift[] }>(),
    total: new Map<string, { key: string; value: readonly ScheduleShift[] }>(),
    cells: new Map<string, { key: string; value: ScheduleCellStateMap }>(),
  });
  const shifts = useMemo(() => slice(kept.current.shifts, groupShifts(visibleShifts)), [visibleShifts]);
  const total = useMemo(() => slice(kept.current.total, groupShifts(totalShifts)), [totalShifts]);
  const cells = useMemo(() => {
    const groups = new Map<string, [string, ScheduleCellState][]>();
    for (const [key, state] of cellStateByKey) {
      const row = rowOfCellKey(key);
      const list = groups.get(row);
      if (list) list.push([key, state]);
      else groups.set(row, [[key, state]]);
    }
    const next = new Map<string, { key: string; value: ScheduleCellStateMap }>();
    for (const [row, entries] of groups) {
      const key = JSON.stringify(entries);
      const before = kept.current.cells.get(row);
      next.set(row, before?.key === key ? before : { key, value: new Map(entries) });
    }
    kept.current.cells = next;
    return next;
  }, [cellStateByKey]);
  return {
    shifts: (employeeId: string | null) => shifts.get(employeeId ?? "") ?? NO_SHIFTS,
    totalShifts: (employeeId: string | null) => total.get(employeeId ?? "") ?? NO_SHIFTS,
    cells: (employeeId: string | null) => cells.get(employeeId ?? "")?.value ?? NO_CELLS,
  };
}

// Cell keys end with the row: "<location>|<date>|<employee or unassigned>".
function rowOfCellKey(key: string): string {
  const row = key.slice(key.lastIndexOf("|") + 1);
  return row === "unassigned" ? "" : row;
}

function groupShifts(shifts: readonly ScheduleShift[]): Map<string, ScheduleShift[]> {
  const groups = new Map<string, ScheduleShift[]>();
  for (const shift of shifts) {
    const row = shift.employee_id ?? "";
    const list = groups.get(row);
    if (list) list.push(shift);
    else groups.set(row, [shift]);
  }
  return groups;
}

function slice(
  kept: Map<string, { key: string; value: readonly ScheduleShift[] }>,
  groups: Map<string, ScheduleShift[]>,
): Map<string, readonly ScheduleShift[]> {
  const next = new Map<string, { key: string; value: readonly ScheduleShift[] }>();
  for (const [row, list] of groups) {
    const key = JSON.stringify(list);
    const before = kept.get(row);
    next.set(row, before?.key === key ? before : { key, value: list });
  }
  kept.clear();
  for (const [row, entry] of next) kept.set(row, entry);
  return new Map([...next].map(([row, entry]) => [row, entry.value]));
}
