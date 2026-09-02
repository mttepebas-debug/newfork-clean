import type {
  ScheduleReadModel,
  ScheduleShift,
  ScheduleView,
} from "@newfork/shared/schedule";

export const UNIFIED_SCHEDULE_EXPORT_LOCATION_ID = "__unified_schedule_grid__";
export const UNASSIGNED_EXPORT_ROW_ID = "unassigned";

export interface ScheduleExportDisplayLocation {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly source_location_ids: readonly string[];
}

export interface ScheduleExportRenderRow {
  readonly kind: "unassigned" | "employee";
  readonly id: string;
  readonly employee_id: string | null;
  readonly label: string;
  readonly color: string | null;
}

export interface ScheduleExportRenderCell {
  readonly row_id: string;
  readonly display_location_id: string;
  readonly date: string;
  readonly shift_ids: readonly string[];
}

export interface ScheduleExportRenderModel {
  readonly grid_mode: "separate" | "unified";
  readonly visible_dates: readonly string[];
  readonly display_locations: readonly ScheduleExportDisplayLocation[];
  readonly rows: readonly ScheduleExportRenderRow[];
  readonly cells: readonly ScheduleExportRenderCell[];
  readonly visibility: {
    readonly show_unassigned: boolean;
    readonly is_daily: boolean;
  };
}

export interface BuildScheduleExportRenderModelInput {
  readonly model: ScheduleReadModel;
  readonly selectedDate: string;
  readonly view: ScheduleView | "daily" | "weekly";
  readonly gridMode: "separate" | "unified";
  readonly showUnassigned?: boolean;
}

function addDays(date: string, count: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

function normalizeView(view: ScheduleView | "daily" | "weekly"): ScheduleView {
  if (view === "daily") return "day";
  if (view === "weekly") return "week";
  return view;
}

function visibleDates(selectedDate: string, view: ScheduleView): string[] {
  if (view === "day") return [selectedDate];
  return Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index));
}

function displayLocations(
  model: ScheduleReadModel,
  gridMode: "separate" | "unified",
): ScheduleExportDisplayLocation[] {
  if (gridMode === "unified" && model.locations.length > 1) {
    return [
      {
        id: UNIFIED_SCHEDULE_EXPORT_LOCATION_ID,
        name: model.locations.map((location) => location.name).join(" + "),
        color:
          model.locations[0]?.publication_status === "published"
            ? "#64748b"
            : null,
        source_location_ids: model.locations.map((location) => location.id),
      },
    ];
  }

  return model.locations.map((location) => ({
    id: location.id,
    name: location.name,
    color: null,
    source_location_ids: [location.id],
  }));
}

function sourceLocationMap(
  locations: readonly ScheduleExportDisplayLocation[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const location of locations) {
    for (const sourceId of location.source_location_ids) {
      map.set(sourceId, location.id);
    }
  }
  return map;
}

function cellKey(
  locationId: string,
  date: string,
  employeeId: string | null,
): string {
  return `${locationId}|${date}|${employeeId ?? UNASSIGNED_EXPORT_ROW_ID}`;
}

function groupShiftIdsByCell(
  shifts: readonly ScheduleShift[],
  locationMap: Map<string, string>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const shift of shifts) {
    const displayLocationId =
      locationMap.get(shift.location_id) ?? shift.location_id;
    const key = cellKey(
      displayLocationId,
      shift.scheduled_date,
      shift.employee_id,
    );
    const existing = result.get(key);
    if (existing) existing.push(shift.id);
    else result.set(key, [shift.id]);
  }
  return result;
}

export function buildScheduleExportRenderModel({
  model,
  selectedDate,
  view,
  gridMode,
  showUnassigned = true,
}: BuildScheduleExportRenderModelInput): ScheduleExportRenderModel {
  const normalizedView = normalizeView(view);
  const dates = visibleDates(selectedDate, normalizedView);
  const locations = displayLocations(model, gridMode);
  const locationMap = sourceLocationMap(locations);
  const shiftIdsByCell = groupShiftIdsByCell(
    model.shifts.filter((shift) => dates.includes(shift.scheduled_date)),
    locationMap,
  );
  const rows: ScheduleExportRenderRow[] = [
    ...(showUnassigned
      ? [
          {
            kind: "unassigned" as const,
            id: UNASSIGNED_EXPORT_ROW_ID,
            employee_id: null,
            label: "Unassigned",
            color: null,
          },
        ]
      : []),
    ...model.employees.map((employee) => ({
      kind: "employee" as const,
      id: `employee:${employee.id}`,
      employee_id: employee.id,
      label: employee.display_name,
      color: null,
    })),
  ];

  const cells = rows.flatMap((row) =>
    locations.flatMap((location) =>
      dates.map((date) => ({
        row_id: row.id,
        display_location_id: location.id,
        date,
        shift_ids:
          shiftIdsByCell.get(cellKey(location.id, date, row.employee_id)) ?? [],
      })),
    ),
  );

  return {
    grid_mode:
      gridMode === "unified" && model.locations.length > 1
        ? "unified"
        : "separate",
    visible_dates: dates,
    display_locations: locations,
    rows,
    cells,
    visibility: {
      show_unassigned: showUnassigned,
      is_daily: normalizedView === "day",
    },
  };
}
