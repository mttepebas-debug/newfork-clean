import type {
  ScheduleLocation,
  ScheduleReadModel,
  ScheduleView,
} from "@newfork/shared/schedule";

import { addDays } from "./scheduleDateTime";

export const scheduleGridEmployeeColumnWidth = 200;
// The narrowest the employee column gets when it gives days room.
export const scheduleGridMinEmployeeColumnWidth = 144;
export const scheduleGridTotalColumnWidth = 120;
export const scheduleGridMinDayColumnWidth = 112;
// Floor for a fitted week's day when there are no cards to measure.
export const scheduleGridFitMinDayColumnWidth = 88;
export const scheduleGridTotalRowHeight = 40;
export const scheduleGridHorizontalNavHeight = 17;
export const scheduleGridPreviewCellHorizontalChrome = 3;
export const scheduleGridEditCellHorizontalChrome = 9;
const scheduleGridLocationHeaderBaseWidth = 64;
const scheduleGridLocationHeaderCharWidth = 9;

export type ScheduleGridLocationGroup = ScheduleLocation & {
  readonly sourceIds: readonly string[];
  readonly sourceNames: readonly {
    readonly id: string;
    readonly name: string;
  }[];
};

export function resolveScheduleInteractionLocationId({
  sourceLocationIds,
  employeeLocationIds = [],
  activeInteractionShiftLocationId,
}: {
  readonly sourceLocationIds: readonly string[];
  readonly employeeLocationIds?: readonly string[];
  readonly activeInteractionShiftLocationId: string | null;
}): string {
  if (
    activeInteractionShiftLocationId &&
    sourceLocationIds.includes(activeInteractionShiftLocationId)
  ) {
    return activeInteractionShiftLocationId;
  }

  const employeeLocationId = sourceLocationIds.find((locationId) =>
    employeeLocationIds.includes(locationId),
  );
  if (employeeLocationId) return employeeLocationId;

  return sourceLocationIds[0] ?? "";
}

export function createScheduleGridDays({
  selectedDate,
  view,
  weekStart,
}: {
  readonly selectedDate: string;
  readonly view: ScheduleView;
  readonly weekStart: string;
}): readonly string[] {
  return view === "day"
    ? [selectedDate]
    : Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function createScheduleGridLocationGroups({
  layout,
  locations,
}: {
  readonly layout: "separate" | "unified";
  readonly locations: ScheduleReadModel["locations"];
}): readonly ScheduleGridLocationGroup[] {
  if (layout === "unified") {
    return [
      {
        id: "unified",
        name: locations.map((item) => item.name).join(" + "),
        // One location keeps its own zone; several have none of their own.
        timezone: locations.length === 1 ? locations[0]!.timezone : "",
        sort_order: 0,
        publication_status: locations.every(
          (item) => item.publication_status === "published",
        )
          ? "published"
          : "unpublished",
        published_at: null,
        sourceIds: locations.map((item) => item.id),
        sourceNames: locations.map((item) => ({
          id: item.id,
          name: item.name,
        })),
      },
    ];
  }

  return locations.map((item) => ({
    ...item,
    sourceIds: [item.id],
    sourceNames: [{ id: item.id, name: item.name }],
  }));
}

export function countScheduleGridColumns({
  days,
  locationGroups,
}: {
  readonly days: readonly string[];
  readonly locationGroups: readonly ScheduleGridLocationGroup[];
}): number {
  return Math.max(1, locationGroups.length * days.length);
}

/**
 * Whether a fitted week still gives every day that width. In a fitted week the
 * employee and totals columns grow to their full 200px / 120px before the days
 * share the rest, so those are the widths to subtract. An unmeasured box
 * (width 0, first render or a test DOM) keeps the fitted layout.
 */
export function scheduleGridFitsVisibleDays({
  width,
  columns,
  showTotalHours,
}: {
  readonly width: number;
  readonly columns: number;
  readonly showTotalHours: boolean;
}): boolean {
  if (width <= 0) return true;
  const fixed =
    scheduleGridEmployeeColumnWidth +
    (showTotalHours ? scheduleGridTotalColumnWidth : 0);
  return width >= fixed + columns * scheduleGridFitMinDayColumnWidth;
}

export type ScheduleGridWeeklyLocationWidths = {
  readonly day: number;
  readonly employee: number;
};

/**
 * Widths that put one location's whole week on screen when several locations
 * stand side by side: seven days share the box less the employee and totals
 * columns. When the days need more than that share (what their cards need),
 * the employee column gives up room down to the fitted week's 144px. null
 * when even that is too narrow: the days keep the cards' full width and the
 * week scrolls.
 */
export function scheduleGridWeeklyLocationWidths({
  width,
  showTotalHours,
  dayWidth = scheduleGridFitMinDayColumnWidth,
  columns = 7,
}: {
  readonly width: number;
  readonly showTotalHours: boolean;
  readonly dayWidth?: number;
  readonly columns?: number;
}): ScheduleGridWeeklyLocationWidths | null {
  if (width <= 0) return null;
  const room = width - (showTotalHours ? scheduleGridTotalColumnWidth : 0);
  const share = (room - scheduleGridEmployeeColumnWidth) / columns;
  if (share >= dayWidth) {
    return { day: share, employee: scheduleGridEmployeeColumnWidth };
  }
  const employee = room - columns * dayWidth;
  return employee >= scheduleGridMinEmployeeColumnWidth
    ? { day: dayWidth, employee }
    : null;
}

// A card's line never wraps, and with the left menu open one location's seven
// days still fit (Mert, 2026-10-12). A day needs its widest card line plus the
// corner room on both sides ("side"); when that is too wide, the line plus
// 2px, with the marks beside the first line or on rows of their own
// ("tight"); narrower, the name a point smaller ("compact"). "time" is the
// day width that still shows every card's hours in full: below it the week
// scrolls rather than cut a time. ScheduleGridShell measures them.
export type ScheduleCardNeeds = {
  readonly side: number;
  readonly tight: number;
  readonly compact: number;
  readonly time: number;
};
export type ScheduleCardBand = "side" | "tight" | "compact" | "clip";
export type ScheduleCardFit = {
  readonly band: ScheduleCardBand;
  readonly widths: ScheduleGridWeeklyLocationWidths | null;
  readonly fits: boolean;
};

/** The first band whose day width leaves the employee column at least 144px. */
export function scheduleGridFitCards({
  width,
  columns,
  showTotalHours,
  needs,
}: {
  readonly width: number;
  readonly columns: number;
  readonly showTotalHours: boolean;
  readonly needs: ScheduleCardNeeds;
}): ScheduleCardFit {
  const bands = [
    ["side", needs.side],
    ["tight", needs.tight],
    ["compact", needs.compact],
  ] as const;
  for (const [band, dayWidth] of bands) {
    const widths = scheduleGridWeeklyLocationWidths({ width, showTotalHours, dayWidth, columns });
    if (widths) return { band, widths, fits: true };
  }
  // Narrower still: the days stay on screen and a name too long ends in "…";
  // the hours are never cut, so below their width the week scrolls.
  const room = width - (showTotalHours ? scheduleGridTotalColumnWidth : 0);
  const share = (room - scheduleGridMinEmployeeColumnWidth) / columns;
  if (share >= Math.max(scheduleGridFitMinDayColumnWidth, needs.time)) {
    return { band: "clip", widths: { day: share, employee: scheduleGridMinEmployeeColumnWidth }, fits: true };
  }
  return { band: "side", widths: null, fits: false };
}

export function createScheduleGridTemplateColumns({
  columns,
  fitVisibleColumns = false,
  locationWidths = null,
  showTotalHours,
}: {
  readonly columns: number;
  readonly fitVisibleColumns?: boolean;
  /** Fixed widths that keep each location's week on one screen. */
  readonly locationWidths?: ScheduleGridWeeklyLocationWidths | null;
  readonly showTotalHours: boolean;
}): string {
  if (locationWidths) {
    return `${locationWidths.employee}px repeat(${columns}, ${locationWidths.day}px)${
      showTotalHours ? ` ${scheduleGridTotalColumnWidth}px` : ""
    }`;
  }

  if (fitVisibleColumns) {
    return `minmax(${scheduleGridMinEmployeeColumnWidth}px, ${scheduleGridEmployeeColumnWidth}px) repeat(${columns}, minmax(0, 1fr))${
      showTotalHours ? ` minmax(72px, ${scheduleGridTotalColumnWidth}px)` : ""
    }`;
  }

  return `${scheduleGridEmployeeColumnWidth}px repeat(${columns}, minmax(var(--schedule-day-column-min), 1fr))${
    showTotalHours ? ` ${scheduleGridTotalColumnWidth}px` : ""
  }`;
}

export function calculateScheduleDayColumnMinWidth({
  editing,
  locationGroups,
  measuredBadgeWidth,
  view,
}: {
  readonly editing: boolean;
  readonly locationGroups: readonly ScheduleGridLocationGroup[];
  readonly measuredBadgeWidth: number;
  readonly view: ScheduleView;
}): number {
  const measuredLocationHeaderWidth = locationGroups.reduce(
    (maxWidth, location) =>
      Math.max(
        maxWidth,
        scheduleGridLocationHeaderBaseWidth +
          location.name.length * scheduleGridLocationHeaderCharWidth,
      ),
    scheduleGridMinDayColumnWidth,
  );

  return Math.max(
    view === "day" ? Math.max(168, measuredLocationHeaderWidth) : 0,
    measuredBadgeWidth > 0
      ? measuredBadgeWidth +
        (editing
          ? scheduleGridEditCellHorizontalChrome
          : scheduleGridPreviewCellHorizontalChrome)
      : 0,
  );
}

export function countScheduleGridBodyRows({
  employeeRowGroupCount,
  rowCount,
  showEmployeeGroupHeaders,
  showTotalHours,
  showUnassignedRow,
}: {
  readonly employeeRowGroupCount: number;
  readonly rowCount: number;
  readonly showEmployeeGroupHeaders: boolean;
  readonly showTotalHours: boolean;
  readonly showUnassignedRow: boolean;
}): number {
  return (
    rowCount +
    (showUnassignedRow ? 1 : 0) +
    (showEmployeeGroupHeaders ? employeeRowGroupCount : 0) +
    (showTotalHours ? 1 : 0)
  );
}

export function countScheduleGridFillerRows(_bodyRowCount: number): number {
  return 1;
}

export function calculateScheduleGridFillerHeight({
  viewportHeight,
  fillerStartOffset,
  totalRowHeight,
  horizontalNavHeight,
}: {
  readonly viewportHeight: number;
  readonly fillerStartOffset: number;
  readonly totalRowHeight: number;
  readonly horizontalNavHeight: number;
}): number {
  return Math.max(
    0,
    Math.round(
      viewportHeight - fillerStartOffset - totalRowHeight - horizontalNavHeight,
    ),
  );
}

export function createScheduleBadgeMeasurementVersion({
  shifts,
  jobs,
  shiftTypes,
  locationGroups,
  showShiftTypePresets,
  showShiftType,
  showShiftLabels,
  showClockTimes,
  timeFormat,
  showJobColorDot,
  showLocationInBadge,
}: {
  readonly shifts: ScheduleReadModel["shifts"];
  readonly jobs: ScheduleReadModel["jobs"];
  readonly shiftTypes: ScheduleReadModel["shift_types"];
  readonly locationGroups: readonly ScheduleGridLocationGroup[];
  readonly showShiftTypePresets: boolean;
  readonly showShiftType: boolean;
  readonly showShiftLabels: boolean;
  readonly showClockTimes: boolean;
  readonly timeFormat: ScheduleReadModel["settings"]["time_format"];
  readonly showJobColorDot: boolean;
  readonly showLocationInBadge: boolean;
}): string {
  return `${shifts.map((shift) => `${shift.id}:${shift.start_time}:${shift.end_time}:${shift.crosses_midnight}:${shift.hide_time_on_badge}:${shift.shift_type_id ?? ""}:${shift.job_id}:${shift.location_id}:${(shift.label_names ?? []).join(",")}:${shift.warning_codes.includes("availability")}`).join("|")}|${jobs.map((job) => `${job.id}:${job.name}`).join("|")}|${shiftTypes.map((shiftType) => `${shiftType.id}:${shiftType.name}`).join("|")}|${locationGroups.map((location) => `${location.id}:${location.name}:${location.sourceNames.map((source) => `${source.id}:${source.name}`).join(",")}`).join("|")}|${showShiftTypePresets}|${showShiftType}|${showShiftLabels}|${showClockTimes}|${timeFormat}|${showJobColorDot}|${showLocationInBadge}`;
}
