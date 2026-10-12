import { locationShortNameSchema } from "@newfork/shared";
import type { ScheduleReadModel, ScheduleShift, ScheduleView } from "@newfork/shared/schedule";
import { formatScheduleBadgeTimeRange, formatScheduleShiftBadgeTitle, formatShiftLabelDisplay } from "../components/ShiftCard";
import { buildScheduleCellState, orderScheduleCellShifts, scheduleCellStateKey } from "../hooks/useCellState";
import { scheduleJobName, scheduleShiftTypeOf } from "../lib/scheduleCatalogNames";
import { scheduleClosureCoversDate } from "../lib/scheduleClosures";
import { schedulePostChipText } from "../components/DayHeaderCell";
import { scheduleImportantDateCoversDate } from "../importantDateCoverage";
import { addDays } from "../lib/scheduleDateTime";
import { createSortedScheduleModel, type ScheduleEmployeeSortMode } from "../lib/scheduleEmployeeSort";
import { filterScheduleModel } from "../lib/scheduleFilterModel";
import { createScheduleGridDays } from "../lib/scheduleGridLayout";
import { createScheduleGridViewModel } from "../lib/scheduleGridViewModel";
import { buildScheduleHourTotalValue, formatHourTotalValue } from "../lib/scheduleHourTotals";

export type ExportSource =
  | { readonly kind: "draft"; readonly id: string; readonly revision: number; readonly name: string }
  | { readonly kind: "published" };

export interface ExportGridDisplay {
  readonly layout: "separate" | "unified";
  readonly employeeSortMode: ScheduleEmployeeSortMode;
  readonly hideUnscheduled: boolean;
  readonly showShiftType: boolean;
  readonly showShiftLabels: boolean;
  readonly showClockTimes: boolean;
  readonly showUnassignedShifts: boolean;
  readonly showRoleSeparators: boolean;
  readonly showTotalHours: boolean;
}

export interface ExportShift {
  readonly id: string;
  readonly employeeId: string | null;
  readonly locationId: string;
  readonly date: string;
  readonly title: string;
  readonly position: string;
  readonly shiftType: string | null;
  readonly label: string | null;
  readonly location: string;
  readonly color: string;
  readonly time: string | null;
  readonly start: string | null;
  readonly end: string | null;
  readonly overnight: boolean | null;
  readonly focused: boolean;
  readonly ghost?: boolean;
  readonly sourceLocationId?: string;
  readonly displayOrder?: number;
}

export interface ExportEmployeeRow {
  readonly id: string | null;
  readonly name: string;
  readonly group: string | null;
  readonly total: string | null;
}

export { exportShiftLines } from "./badge-text";

export interface ExportDayDecoration {
  readonly locationId: string | null;
  readonly date: string;
  readonly lines: readonly string[];
  readonly closed: boolean;
}

/** Display-only projection: no notes, wages, availability, contacts or hidden clocks. */
export interface ScheduleExportSnapshot {
  readonly version: 1;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly weekStart: string;
  readonly source: ExportSource;
  readonly dates: readonly string[];
  readonly layout: ExportGridDisplay["layout"];
  readonly locations: readonly { readonly id: string; readonly name: string; readonly shortName: string }[];
  readonly rows: readonly ExportEmployeeRow[];
  readonly shifts: readonly ExportShift[];
  readonly ghosts?: readonly ExportShift[];
  readonly dayDecorations?: readonly ExportDayDecoration[];
  readonly totals?: { readonly week: string; readonly cells: readonly { readonly locationId: string | null; readonly date: string; readonly text: string }[] };
  readonly filename: string;
}

export type SnapshotResult =
  | { readonly status: "ready"; readonly snapshot: ScheduleExportSnapshot }
  | { readonly status: "blocked"; readonly reason: "edit" | "loading" | "source" | "locations" | "short_names"; readonly locationNames?: readonly string[] };

/**
 * Call with the same effective model/search/settings used by ScheduleGrid.
 * Loading includes query placeholder data and draft-switch requests. Source keys
 * must come from requested and resolved preview state, never from export prefs.
 * This projection does not grant schedule.export permission; delivery must recheck it.
 */
export function createScheduleExportSnapshot(input: {
  readonly mode: "edit" | "preview";
  readonly loading: boolean;
  readonly requestedSourceKey: string;
  readonly resolvedSourceKey: string | null;
  readonly source: ExportSource | null;
  readonly model: ScheduleReadModel;
  readonly workspaceName: string;
  readonly selectedDate: string;
  readonly view: ScheduleView;
  readonly search: URLSearchParams;
  readonly display: ExportGridDisplay;
  readonly focusedShiftId: string | null;
}): SnapshotResult {
  if (input.mode === "edit") return { status: "blocked", reason: "edit" };
  if (input.loading) return { status: "blocked", reason: "loading" };
  if (!input.source || !input.requestedSourceKey || input.requestedSourceKey !== input.resolvedSourceKey) {
    return { status: "blocked", reason: "source" };
  }
  const { model, display } = input;
  const filtered = filterScheduleModel(createSortedScheduleModel(model, display.employeeSortMode), input.search);
  if (!filtered.locations.length) return { status: "blocked", reason: "locations" };
  const missing = filtered.locations.filter(location => !locationShortNameSchema.safeParse(location.short_name).success);
  if (missing.length) return { status: "blocked", reason: "short_names", locationNames: missing.map(location => location.name) };
  const dates = createScheduleGridDays({ selectedDate: input.selectedDate, view: input.view, weekStart: model.week_start });
  const grid = createScheduleGridViewModel({
    ...display, filtered, hasEditSession: false, showPresetShiftBadges: false, addDays,
  });
  const visibleEmployees = new Set(grid.rows.map(employee => employee.id));
  const dateSet = new Set(dates);
  const visibleShifts = filtered.shifts.filter(shift => dateSet.has(shift.scheduled_date) &&
    (shift.employee_id === null ? grid.showUnassignedRow : visibleEmployees.has(shift.employee_id)));
  const locationById = new Map(model.locations.map(location => [location.id, location]));
  const groupByEmployee = new Map(grid.showEmployeeGroupHeaders
    ? grid.employeeRowGroups.flatMap(group => group.employees.map(employee => [employee.id, group.job?.name ?? "No position"] as const))
    : []);
  const orderedEmployees = grid.showEmployeeGroups
    ? grid.employeeRowGroups.flatMap(group => group.employees)
    : grid.rows;
  const rows: ExportEmployeeRow[] = orderedEmployees.map(employee => ({
    id: employee.id, name: employee.display_name, group: groupByEmployee.get(employee.id) ?? null,
    total: display.showTotalHours ? formatHourTotalValue(buildScheduleHourTotalValue(
      filtered.shifts.filter(shift => shift.employee_id === employee.id),
      model.shifts.filter(shift => shift.employee_id === employee.id),
    )) : null,
  }));
  if (grid.showUnassignedRow) rows.unshift({ id: null, name: "Unassigned", group: null, total: null });
  const displayOrder = new Map(orderScheduleCellShifts(model.shifts, [], model.shift_types).map((shift, index) => [shift.id, index]));
  const projectShift = (shift: ScheduleShift): ExportShift => {
    const type = scheduleShiftTypeOf(model, shift.shift_type_id);
    const position = scheduleJobName(model, shift.job_id) ?? "Shift";
    const showTime = display.showClockTimes && !shift.hide_time_on_badge;
    return {
      id: shift.id, employeeId: shift.employee_id, locationId: shift.location_id,
      date: shift.scheduled_date, position,
      title: formatScheduleShiftBadgeTitle(type, position, display.showShiftType),
      shiftType: display.showShiftType ? type?.name ?? null : null,
      label: display.showShiftLabels ? formatShiftLabelDisplay(shift.label_names ?? []).displayText || null : null,
      location: locationById.get(shift.location_id)!.name,
      color: type?.color ?? "#54736a",
      time: showTime ? `${formatScheduleBadgeTimeRange(shift.start_time, shift.end_time, model.settings.time_format)}${shift.crosses_midnight ? " +1" : ""}` : null,
      start: showTime ? shift.start_time : null,
      end: showTime ? shift.end_time : null,
      overnight: showTime ? shift.crosses_midnight : null,
      focused: shift.id === input.focusedShiftId,
      displayOrder: displayOrder.get(shift.id),
    };
  };
  const shifts = orderScheduleCellShifts(visibleShifts, [], model.shift_types).map(projectShift);
  // The grid's separate-location view shows cross-location references, including
  // references outside the current location filter. Never turn these into assigned shifts.
  const cellState = display.layout === "separate" ? buildScheduleCellState(model) : null;
  const ghosts = filtered.locations.flatMap(location => rows.flatMap(row => row.id === null ? [] : dates.flatMap(date =>
    orderScheduleCellShifts([], cellState?.get(scheduleCellStateKey(location.id, date, row.id))?.ghostShifts ?? [], model.shift_types)
      .filter(shift => locationById.has(shift.location_id))
      .map(shift => ({ ...projectShift(shift), focused: false, ghost: true, sourceLocationId: shift.location_id, locationId: location.id })),
  )));
  const scopes = [{ id: null, ids: filtered.locations.map(location => location.id) }, ...filtered.locations.map(location => ({ id: location.id, ids: [location.id] }))];
  const dayDecorations = scopes.flatMap(scope => dates.map(date => {
    // A printed week is what employees see: nothing scheduled (EKRAN-08).
    const closures = model.closures.filter(item => item.status !== "scheduled" && item.kind === "closed" &&
      scope.ids.includes(item.location_id) && scheduleClosureCoversDate(item, date));
    const allClosed = scope.ids.every(id => closures.some(item => item.location_id === id));
    const posts = [...new Map(model.important_dates.filter(item => item.status === "published" && scheduleImportantDateCoversDate(item, date) &&
      (item.location_id === null || scope.ids.includes(item.location_id))).map(item => [item.id, item])).values()];
    const closedBy = closures.find(item => !posts.some(post => post.id === item.announcement_id));
    return { locationId: scope.id, date, closed: closures.length > 0, lines: [
      ...(allClosed && closedBy ? [`Closed: ${closedBy.title}`] : []),
      ...posts.map(post => schedulePostChipText(post, model.settings.time_format)),
    ] };
  }));
  const totals = display.showTotalHours ? {
    week: formatHourTotalValue(buildScheduleHourTotalValue(filtered.shifts.filter(shift => shift.employee_id), model.shifts.filter(shift => shift.employee_id))),
    cells: scopes.flatMap(scope => dates.map(date => {
      const inCell = (shift: ScheduleShift) => Boolean(shift.employee_id) && scope.ids.includes(shift.location_id) && shift.scheduled_date === date;
      return { locationId: scope.id, date, text: formatHourTotalValue(buildScheduleHourTotalValue(filtered.shifts.filter(inCell), model.shifts.filter(inCell))) };
    })),
  } : undefined;
  const locations = filtered.locations.map(location => ({ id: location.id, name: location.name, shortName: location.short_name! }));
  // Clone before freezing: never freeze React Query data or objects owned by the grid.
  const snapshot: ScheduleExportSnapshot = structuredClone({
    version: 1, workspaceId: model.workspace_id, workspaceName: input.workspaceName, weekStart: model.week_start,
    source: input.source, dates, layout: display.layout, locations, rows, shifts, ghosts, dayDecorations, totals,
    filename: `${locations.map(location => location.shortName).join("_")}_${dates[0]}${dates.length > 1 ? `_${dates[dates.length - 1]}` : ""}`,
  });
  return { status: "ready", snapshot: freezeSnapshot(snapshot) };
}

function freezeSnapshot<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeSnapshot);
    Object.freeze(value);
  }
  return value;
}
