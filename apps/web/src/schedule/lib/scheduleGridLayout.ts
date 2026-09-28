import type {
  ScheduleLocation,
  ScheduleReadModel,
  ScheduleView,
} from "@newfork/shared/schedule";

import { addDays } from "./scheduleDateTime";

export const scheduleGridEmployeeColumnWidth = 200;
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
        timezone: "",
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

export function countScheduleGridTotalColumns({
  columns,
  showTotalHours,
}: {
  readonly columns: number;
  readonly showTotalHours: boolean;
}): number {
  return columns + (showTotalHours ? 1 : 0);
}

/**
 * The narrowest day that shows every card title without splitting a word:
 * each card's longest word plus what the card and its cell take around the
 * title (padding, markers such as the availability flag). Neither depends on
 * the column width, so the answer is the same fitted or scrolling.
 */
export function scheduleGridFitDayWidth(
  cards: readonly { readonly longestWord: number; readonly chrome: number }[],
): number {
  return cards.reduce(
    (widest, card) => Math.max(widest, Math.ceil(card.longestWord + card.chrome)),
    scheduleGridFitMinDayColumnWidth,
  );
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
  dayWidth = scheduleGridFitMinDayColumnWidth,
}: {
  readonly width: number;
  readonly columns: number;
  readonly showTotalHours: boolean;
  readonly dayWidth?: number;
}): boolean {
  if (width <= 0) return true;
  const fixed =
    scheduleGridEmployeeColumnWidth +
    (showTotalHours ? scheduleGridTotalColumnWidth : 0);
  return width >= fixed + columns * dayWidth;
}

export function createScheduleGridTemplateColumns({
  columns,
  fitVisibleColumns = false,
  showTotalHours,
}: {
  readonly columns: number;
  readonly fitVisibleColumns?: boolean;
  readonly showTotalHours: boolean;
}): string {
  if (fitVisibleColumns) {
    return `minmax(144px, ${scheduleGridEmployeeColumnWidth}px) repeat(${columns}, minmax(0, 1fr))${
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
  return `${shifts.map((shift) => `${shift.id}:${shift.start_time}:${shift.end_time}:${shift.crosses_midnight}:${shift.hide_time_on_badge}:${shift.shift_type_id ?? ""}:${shift.job_id}:${shift.location_id}:${(shift.label_names ?? []).join(",")}`).join("|")}|${jobs.map((job) => `${job.id}:${job.name}`).join("|")}|${shiftTypes.map((shiftType) => `${shiftType.id}:${shiftType.name}`).join("|")}|${locationGroups.map((location) => `${location.id}:${location.name}:${location.sourceNames.map((source) => `${source.id}:${source.name}`).join(",")}`).join("|")}|${showShiftTypePresets}|${showShiftType}|${showShiftLabels}|${showClockTimes}|${timeFormat}|${showJobColorDot}|${showLocationInBadge}`;
}
