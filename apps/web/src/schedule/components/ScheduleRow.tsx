import type {
  ScheduleEditableShift,
  ScheduleEmployee,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import { Plus } from "lucide-react";
import type {
  CSSProperties,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import {
  orderScheduleCellShifts,
  scheduleCellStateKey,
  type ScheduleCellStateMap,
} from "../hooks/useCellState";
import {
  PREVIEW_SHIFT_BADGE_MIN_HEIGHT,
  useSynchronizedRowBadgeHeight,
} from "../hooks/useScheduleBadgeMeasurements";
import type { ShiftDragState } from "../hooks/useSingleShiftPointerDrag";
import {
  formatAvailabilityMarkDay,
  formatAvailabilityMarkLine,
  isFullDayTimeOff,
  nameCellShowsAvailabilityMark,
} from "../lib/scheduleAvailabilityMark";
import { scheduleClosureCoversDate } from "../lib/scheduleClosures";
import { shiftDropTargetKey } from "../lib/scheduleDragTargets";
import {
  resolveScheduleInteractionLocationId,
  type ScheduleGridLocationGroup,
} from "../lib/scheduleGridLayout";
import { primaryScheduleJobId } from "../lib/scheduleEmployeeSort";
import {
  buildScheduleHourTotalValue,
  formatHourTotalValue,
} from "../lib/scheduleHourTotals";
import {
  hideReplacedRemovedShifts,
  isGhostScheduleShift,
  publicationStateForShift,
  shiftWithDerivedWarnings,
} from "../lib/scheduleShiftMetadata";
import type { ShiftClipboardSnapshot } from "../lib/shiftClipboard";
import type { CellContextMenuTarget } from "./ScheduleContextMenu";
import { ScheduleEmployeeCard } from "./ScheduleEmployeeCard";
import type { PresetDragState } from "./SchedulePresetRows";
import { ScheduleTotalValue } from "./ScheduleTotalsRow";
import { AvailabilityMarkButton } from "./AvailabilityMarkButton";
import { GhostShiftCard, ShiftCard } from "./ShiftCard";
import {
  scheduleJobName,
  scheduleShiftTypeOf,
  type ScheduleCatalog,
} from "../lib/scheduleCatalogNames";
import { unassignedShiftStackKey } from "../lib/unassignedShiftStack";

export interface ActiveScheduleEditorTarget {
  readonly locationId: string;
  readonly employeeId: string | null;
  readonly date: string;
  readonly shiftId?: string | null;
}

interface DisplayShiftStack {
  readonly shift: ScheduleShift;
  readonly groupedShiftIds: readonly string[];
  readonly stackCount: number;
}

export function ScheduleRow({
  employee,
  shifts,
  totalShifts,
  locations,
  activeEditorTarget = null,
  activeInteractionShiftLocationId,
  days,
  catalog,
  closures,
  cellStateByKey,
  editing,
  showShiftType,
  showShiftLabels,
  showClockTimes,
  timeFormat,
  showTotalHours,
  showJobColorDot,
  showLocationInBadge,
  unassignedFrozen,
  selectedIds,
  focusedShiftId,
  clipboard,
  pasteArmed,
  onSelect,
  onFocusShift,
  onEdit,
  onCreate,
  onCopy,
  onClearSelection,
  onShiftContextMenu,
  onCellContextMenu,
  onPaste,
  draggedShiftId,
  dragOverCell,
  dragState,
  onShiftPointerDown,
  onShiftMouseDown,
  onDragOverCell: _onDragOverCell,
  onOpenEmployeeCard,
}: {
  readonly employee: ScheduleEmployee | null;
  readonly shifts: readonly ScheduleShift[];
  readonly totalShifts: readonly ScheduleShift[];
  readonly locations: readonly ScheduleGridLocationGroup[];
  readonly activeEditorTarget?: ActiveScheduleEditorTarget | null;
  readonly activeInteractionShiftLocationId: string | null;
  readonly days: readonly string[];
  readonly catalog: ScheduleCatalog;
  readonly closures: ScheduleReadModel["closures"];
  readonly cellStateByKey: ScheduleCellStateMap;
  readonly editing: boolean;
  readonly showShiftType: boolean;
  readonly showShiftLabels: boolean;
  readonly showClockTimes: boolean;
  readonly timeFormat: ScheduleReadModel["settings"]["time_format"];
  readonly showTotalHours: boolean;
  readonly showJobColorDot: boolean;
  readonly showLocationInBadge: boolean;
  readonly unassignedFrozen: boolean;
  readonly selectedIds: readonly string[];
  readonly focusedShiftId: string | null;
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
  readonly draggedShiftId: string | null;
  readonly dragOverCell: string | null;
  readonly dragState: ShiftDragState | PresetDragState | null;
  readonly onShiftPointerDown: (
    shiftId: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  readonly onShiftMouseDown: (
    shiftId: string,
    event: MouseEvent<HTMLElement>,
  ) => void;
  readonly onDragOverCell: (cellKey: string | null) => void;
  readonly onOpenEmployeeCard?: (employeeId: string) => void;
}) {
  const rowKey = employee?.id ?? "unassigned";
  const isUnassignedRow = !employee;
  const employeeShifts = shifts.filter(
    (shift) =>
      shift.employee_id === employee?.id ||
      (!employee && shift.employee_id === null),
  );
  const activeDraggedShiftId =
    isUnassignedRowDrag(dragState) && !dragState.copy
      ? dragState.activeShiftId
      : null;
  const activeDraggedOpenShift =
    !employee &&
    activeDraggedShiftId !== null &&
    employeeShifts.some((shift) => shift.id === activeDraggedShiftId);
  const displayedOpenShiftCount = activeDraggedOpenShift
    ? Math.max(0, employeeShifts.length - 1)
    : employeeShifts.length;
  const totalEmployeeShifts = totalShifts.filter(
    (shift) => employee && shift.employee_id === employee.id,
  );
  const hourTotal = buildScheduleHourTotalValue(
    employee ? employeeShifts : [],
    totalEmployeeShifts,
  );
  const unassignedLabelMode =
    isUnassignedRow && displayedOpenShiftCount > 1 ? "header" : "centered";
  const rowVersion = `${employeeShifts.map((shift) => `${shift.id}:${shift.location_id}:${shift.shift_type_id ?? ""}:${shift.job_id}:${shift.start_time}:${shift.end_time}:${shift.crosses_midnight}:${shift.hide_time_on_badge}:${shift.warning_codes.join(",")}:${(shift.label_names ?? []).join(",")}`).join("|")}|${catalog.jobs.map((job) => `${job.id}:${job.name}`).join("|")}|${catalog.shift_types.map((shiftType) => `${shiftType.id}:${shiftType.name}`).join("|")}|${locations.map((location) => `${location.id}:${location.sourceNames.map((source) => source.name).join(",")}`).join("|")}|${editing}|${showShiftType}|${showShiftLabels}|${showClockTimes}|${timeFormat}|${showJobColorDot}|${showLocationInBadge}|${activeDraggedShiftId ?? ""}:${isUnassignedRowDrag(dragState) ? dragState.copy : ""}`;
  const rowMinHeight = PREVIEW_SHIFT_BADGE_MIN_HEIGHT;
  const { anchorRef, badgeHeight, rowBadgeStackHeight } =
    useSynchronizedRowBadgeHeight({
      rowKey,
      version: rowVersion,
      enabled: true,
      minHeight: PREVIEW_SHIFT_BADGE_MIN_HEIGHT,
    });
  const rowStyle = {
    "--schedule-row-min-height": `${Math.max(rowMinHeight, rowBadgeStackHeight)}px`,
    "--schedule-row-badge-height": `${badgeHeight}px`,
  } as CSSProperties;

  // The name cell's "!" reads every cell of the row (KARARLAR Schedule, 2026-10-06).
  const availabilityDays = employee
    ? locations.flatMap((location) => days.map((day) => {
        const cell = employeeShifts.filter((shift) => location.sourceIds.includes(shift.location_id) && shift.scheduled_date === day);
        // While editing, a live shift's card says LIVE, so its "!" moves
        // here (Mert, 2026-10-12).
        const movedHere = cell.filter((shift) => shift.warning_codes.includes("availability") &&
          editing && publicationStateForShift(shift) === "locked");
        return {
          date: day,
          mark: cellStateByKey.get(scheduleCellStateKey(location.id, day, employee.id))?.availabilityMark ?? null,
          shiftCount: cell.length,
          clashes: cell.some((shift) => shift.warning_codes.includes("availability") && !movedHere.includes(shift)),
          // K18, M11: the moved "!" still says the mark came after the first publish.
          changedAfterPublish: movedHere.some((shift) => shift.availability_changed_after_publish),
        };
      }))
    : [];
  const nameAvailabilityLines = nameCellShowsAvailabilityMark(availabilityDays)
    ? days.flatMap((day) => {
        const entries = availabilityDays.filter(({ date }) => date === day);
        const lines = [...new Set(entries.flatMap(({ mark }) => mark?.kind === "unavailable"
          ? mark.windows.map((window) => formatAvailabilityMarkLine(day, window, timeFormat))
          : []))];
        return lines.length && entries.some(({ changedAfterPublish }) => changedAfterPublish)
          ? [...lines, "Changed after publishing"]
          : lines;
      })
    : [];

  return (
    <>
      <ScheduleEmployeeCard
        availabilityLines={nameAvailabilityLines}
        editing={editing}
        employee={employee}
        openShiftCount={displayedOpenShiftCount}
        unassignedFrozen={unassignedFrozen}
        unassignedLabelMode={unassignedLabelMode}
        rowStyle={rowStyle}
        anchorRef={anchorRef}
        onOpenEmployeeCard={onOpenEmployeeCard}
      />
      {locations.flatMap((location, locationIndex) =>
        days.map((day, dayIndex) => {
          const cellShifts = hideReplacedRemovedShifts(
            employeeShifts.filter(
              (shift) =>
                location.sourceIds.includes(shift.location_id) &&
                shift.scheduled_date === day,
            ),
          );
          const derivedCellState = cellStateByKey.get(
            scheduleCellStateKey(location.id, day, employee?.id ?? null),
          );
          const derivedGhostShifts = showLocationInBadge
            ? []
            : (derivedCellState?.ghostShifts ?? []);
          const displayShifts = orderScheduleCellShifts(
            cellShifts,
            derivedGhostShifts,
            catalog.shift_types,
          );
          const displayStacks = isUnassignedRow
            ? stackUnassignedCellShifts(displayShifts, activeDraggedShiftId)
            : displayShifts.map((shift) => ({
                shift,
                groupedShiftIds: [shift.id],
                stackCount: 1,
              }));
          const cellHasOverlap = Boolean(derivedCellState?.hasOverlap);
          const availabilityMark = employee
            ? (derivedCellState?.availabilityMark ?? null)
            : null;
          // Mert, 2026-10-10: full-day approved time off opens no Add shift.
          const canAddShift = editing && !isFullDayTimeOff(availabilityMark);
          const cellKey = `${rowKey}-${location.id}-${day}`;
          const editorOwnsCell = Boolean(
            activeEditorTarget &&
            activeEditorTarget.shiftId === null &&
            activeEditorTarget.date === day &&
            activeEditorTarget.employeeId === (employee?.id ?? null) &&
            location.sourceIds.includes(activeEditorTarget.locationId),
          );
          const interactionLocationId = resolveScheduleInteractionLocationId({
            sourceLocationIds: location.sourceIds,
            employeeLocationIds: employee?.location_ids ?? [],
            activeInteractionShiftLocationId,
          });
          const dropTargetKey = shiftDropTargetKey(
            employee?.id ?? null,
            interactionLocationId,
            day,
          );
          const directClosure = closures.find(
            (item) =>
              location.sourceIds.includes(item.location_id) &&
              scheduleClosureCoversDate(item, day) &&
              item.is_all_day,
          );
          const closure =
            directClosure ??
            (derivedCellState?.isClosedAllDay
              ? { title: derivedCellState.closedTitle ?? "Closed" }
              : null);
          const addShiftLabel = `Add shift for ${
            employee?.display_name ?? "unassigned"
          } at ${location.name} on ${day}`;
          const shiftLocationName = (shift: ScheduleShift): string | null =>
            showLocationInBadge
              ? (location.sourceNames.find(
                  (source) => source.id === shift.location_id,
                )?.name ?? location.name)
              : null;
          const triggerCellAction = (event: MouseEvent<HTMLElement>) => {
            event.preventDefault();
            event.stopPropagation();
            const point = {
              x: Number.isFinite(event.clientX) ? event.clientX : undefined,
              y: Number.isFinite(event.clientY) ? event.clientY : undefined,
            };
            if (pasteArmed && clipboard) {
              onPaste(
                interactionLocationId,
                employee?.id ?? null,
                day,
                point.x !== undefined && point.y !== undefined
                  ? { x: point.x, y: point.y }
                  : undefined,
              );
              return;
            }
            if (selectedIds.length > 0) {
              onClearSelection();
            }
            onCreate(
              interactionLocationId,
              employee?.id ?? null,
              day,
              point.x !== undefined && point.y !== undefined
                ? { x: point.x, y: point.y }
                : undefined,
            );
          };
          return (
            <div
              className={`schedule-cell${
                isUnassignedRow ? " schedule-unassigned-row-cell" : ""
              }`}
              role="gridcell"
              key={`${employee?.id ?? "open"}-${location.id}-${day}`}
              data-testid="schedule-cell-body"
              data-unassigned-cell={isUnassignedRow}
              data-unassigned-frozen={isUnassignedRow && unassignedFrozen}
              data-closed={Boolean(closure)}
              data-availability-kind={availabilityMark?.kind}
              data-overlap={cellHasOverlap}
              title={closure?.title}
              data-editing={editing}
              data-drop-target={
                dragOverCell === cellKey || dragOverCell === dropTargetKey
              }
              data-drop-status={
                dragState?.targetKey === dropTargetKey
                  ? (dragState.targetStatus ?? undefined)
                  : undefined
              }
              data-drop-cell="true"
              data-employee-id={employee?.id ?? ""}
              data-location-id={interactionLocationId}
              data-display-location-id={location.id}
              data-location-boundary={
                locationIndex > 0 && dayIndex === 0 ? "start" : undefined
              }
              data-schedule-row-top-separator="true"
              data-date={day}
              data-shift-editor-active-cell={
                editorOwnsCell ? "true" : undefined
              }
              style={rowStyle}
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) onClearSelection();
              }}
              onClick={(event) => {
                if (
                  !editing ||
                  !pasteArmed ||
                  !clipboard ||
                  event.target !== event.currentTarget
                )
                  return;
                onPaste(interactionLocationId, employee?.id ?? null, day, {
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
              onContextMenu={(event) =>
                onCellContextMenu(
                  {
                    locationId: interactionLocationId,
                    employeeId: employee?.id ?? null,
                    jobId: employee
                      ? primaryScheduleJobId(employee, catalog.jobs)
                      : null,
                    date: day,
                  },
                  event,
                )
              }
              onDoubleClick={(event) =>
                canAddShift &&
                (!pasteArmed || !clipboard) &&
                onCreate(interactionLocationId, employee?.id ?? null, day, {
                  x: event.clientX,
                  y: event.clientY,
                })
              }
            >
              {displayStacks.map(({ shift, groupedShiftIds, stackCount }) =>
                isGhostScheduleShift(shift) ? (
                  <GhostShiftCard
                    key={shift.id}
                    shift={shift}
                    job={scheduleJobName(catalog, shift.job_id) ?? "Shift"}
                    type={scheduleShiftTypeOf(catalog, shift.shift_type_id)}
                    locationName={shiftLocationName(shift)}
                    employeeName={employee?.display_name ?? null}
                    showShiftType={showShiftType}
                    showShiftLabels={showShiftLabels}
                    showClockTimes={showClockTimes}
                    timeFormat={timeFormat}
                    showJobColorDot={showJobColorDot}
                    rowKey={rowKey}
                    badgeHeight={badgeHeight}
                  />
                ) : (
                  <ShiftCard
                    key={shift.id}
                    shift={shiftWithDerivedWarnings(shift, derivedCellState, { editing })}
                    availabilityMark={availabilityMark}
                    job={scheduleJobName(catalog, shift.job_id) ?? "Shift"}
                    type={scheduleShiftTypeOf(catalog, shift.shift_type_id)}
                    locationName={shiftLocationName(shift)}
                    employeeName={employee?.display_name ?? null}
                    editing={editing}
                    showShiftType={showShiftType}
                    showShiftLabels={showShiftLabels}
                    showClockTimes={showClockTimes}
                    timeFormat={timeFormat}
                    showJobColorDot={showJobColorDot}
                    selected={groupedShiftIds.some((id) =>
                      selectedIds.includes(id),
                    )}
                    stackCount={stackCount}
                    focused={groupedShiftIds.some(
                      (id) =>
                        focusedShiftId === id ||
                        activeEditorTarget?.shiftId === id,
                    )}
                    rowKey={rowKey}
                    badgeHeight={badgeHeight}
                    dragging={draggedShiftId === shift.id}
                    publicationState={publicationStateForShift(shift)}
                    onSelect={onSelect}
                    onFocus={onFocusShift}
                    onEdit={onEdit}
                    onCopy={onCopy}
                    onContextMenu={onShiftContextMenu}
                    onPointerDown={onShiftPointerDown}
                    onMouseDown={onShiftMouseDown}
                  />
                ),
              )}
              {canAddShift ? (
                <button
                  type="button"
                  className={`schedule-cell-add-action ${
                    displayStacks.length
                      ? "schedule-cell-add-another"
                      : "schedule-cell-add"
                  }`}
                  data-schedule-add-shift-control="true"
                  data-schedule-row-key={rowKey}
                  data-occupied={displayStacks.length > 0}
                  aria-label={addShiftLabel}
                  onClick={triggerCellAction}
                >
                  <Plus size={12} aria-hidden />
                  <span>Add shift</span>
                </button>
              ) : null}
              {/* After the add layer: the "!" stays pressable over it. */}
              {availabilityMark?.kind === "unavailable" && employee && displayStacks.length === 0 ? (
                <AvailabilityMarkButton
                  className="schedule-availability-mark-corner"
                  label={`${employee.display_name}: unavailable on ${formatAvailabilityMarkDay(day)}`}
                  lines={availabilityMark.windows.map((window) => formatAvailabilityMarkLine(day, window, timeFormat))}
                />
              ) : null}
            </div>
          );
        }),
      )}
      {showTotalHours ? (
        isUnassignedRow ? (
          <div
            className="schedule-total-cell schedule-unassigned-row-cell"
            role="gridcell"
            data-unassigned-frozen={unassignedFrozen}
            data-schedule-total-column-cell="true"
            data-schedule-total-hours-empty="true"
            data-schedule-total-unassigned-bottom-separator="true"
            data-schedule-unassigned-bottom-separator="true"
            style={rowStyle}
            aria-hidden="true"
          />
        ) : (
          <div
            className="schedule-total-cell"
            role="gridcell"
            data-schedule-total-column-cell="true"
            data-schedule-total-hours-employee-cell="true"
            data-schedule-total-hours-week-cell="true"
            style={rowStyle}
            aria-label={`${employee.display_name} total hours ${formatHourTotalValue(
              hourTotal,
            )}`}
          >
            <ScheduleTotalValue total={hourTotal} />
          </div>
        )
      ) : null}
    </>
  );
}

function isUnassignedRowDrag(
  dragState: ShiftDragState | PresetDragState | null,
): dragState is ShiftDragState {
  return Boolean(dragState && "activeShiftId" in dragState);
}

function stackUnassignedCellShifts(
  shifts: readonly ScheduleShift[],
  excludedShiftId: string | null,
): readonly DisplayShiftStack[] {
  const stacks: DisplayShiftStack[] = [];
  const stackByKey = new Map<
    string,
    {
      readonly shift: ScheduleShift;
      readonly groupedShiftIds: string[];
      stackCount: number;
    }
  >();

  for (const shift of shifts) {
    if (!isGhostScheduleShift(shift) && shift.id === excludedShiftId) continue;
    if (isGhostScheduleShift(shift)) {
      stacks.push({ shift, groupedShiftIds: [shift.id], stackCount: 1 });
      continue;
    }

    const key = unassignedShiftStackKey(shift);
    const existing = stackByKey.get(key);
    if (existing) {
      existing.groupedShiftIds.push(shift.id);
      existing.stackCount += 1;
      continue;
    }

    const stack = {
      shift,
      groupedShiftIds: [shift.id],
      stackCount: 1,
    };
    stackByKey.set(key, stack);
    stacks.push(stack);
  }

  return stacks;
}
