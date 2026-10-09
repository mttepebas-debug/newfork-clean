import type {
  ScheduleLocation,
  SchedulePublicationStatus,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";

import type { CalendarMarker } from "../components/MiniCalendar";
import type { ScheduleFilterChipView } from "../components/ScheduleFilterCommandStrip";
import { matchesScheduleEmployeeFilters } from "./employeeEligibility";
import { importantDateTypeLabels } from "../../lib/importantDateTypes";

export function createScheduleCalendarMarkers(
  closures: ScheduleReadModel["closures"],
  importantDates: ScheduleReadModel["important_dates"] = [],
): CalendarMarker[] {
  const markersByDate = new Map<string, CalendarMarker>();

  const addMarker = (marker: CalendarMarker): void => {
    const existing = markersByDate.get(marker.date);
    if (existing) {
      markersByDate.set(marker.date, {
        ...existing,
        endDate: existing.endDate ?? marker.endDate,
        kind:
          existing.kind === "closed" || marker.kind === "closed"
            ? "closed"
            : "important",
        title:
          existing.title === marker.title
            ? existing.title
            : `${existing.title}, ${marker.title}`,
        color: existing.color ?? marker.color,
        recurrence:
          existing.recurrence === "annual" || marker.recurrence === "annual"
            ? "annual"
            : (existing.recurrence ?? marker.recurrence),
      });
      return;
    }
    markersByDate.set(marker.date, marker);
  };

  for (const closure of closures) {
    addMarker({
      date: closure.closed_date,
      endDate: closure.end_date,
      kind: "closed",
      title: closure.title,
    });
  }

  for (const importantDate of importantDates) {
    addMarker({
      date: importantDate.starts_on,
      endDate: importantDate.ends_on,
      kind: "important",
      title: `${importantDateTypeLabels[importantDate.type]}: ${importantDate.title}`,
      recurrence: importantDate.recurrence,
    });
  }

  return [...markersByDate.values()];
}

export function createScheduleFilterChips({
  locations,
  shiftTypes,
  jobs,
  employees,
  selectedLocationIds,
  selectedShiftTypeIds,
  selectedJobIds,
  selectedEmployeeIds,
  setQueryIds,
}: {
  readonly locations: ScheduleReadModel["locations"];
  readonly shiftTypes: ScheduleReadModel["shift_types"];
  readonly jobs: ScheduleReadModel["jobs"];
  readonly employees: ScheduleReadModel["employees"];
  readonly selectedLocationIds: readonly string[];
  readonly selectedShiftTypeIds: readonly string[];
  readonly selectedJobIds: readonly string[];
  readonly selectedEmployeeIds: readonly string[];
  readonly setQueryIds: (param: string, ids: readonly string[]) => void;
}): ScheduleFilterChipView[] {
  const chips: ScheduleFilterChipView[] = [];
  const pushChips = <T extends { id: string; name?: string; color?: string }>(
    items: readonly T[],
    selectedIds: readonly string[],
    param: string,
    kind: ScheduleFilterChipView["kind"],
    labelFor: (item: T) => string,
  ) => {
    for (const id of selectedIds) {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) continue;
      chips.push({
        key: `${param}:${id}`,
        kind,
        label: labelFor(item),
        color: item.color,
        onRemove: () =>
          setQueryIds(
            param,
            selectedIds.filter((selectedId) => selectedId !== id),
          ),
      });
    }
  };

  pushChips(
    locations,
    selectedLocationIds,
    "locations",
    "location",
    (item) => item.name,
  );
  pushChips(
    shiftTypes,
    selectedShiftTypeIds,
    "shiftTypes",
    "shift",
    (item) => item.name,
  );
  pushChips(jobs, selectedJobIds, "jobs", "job", (item) => item.name);

  for (const id of selectedEmployeeIds) {
    const employee = employees.find((item) => item.id === id);
    if (!employee) continue;
    chips.push({
      key: `employees:${id}`,
      kind: "employee",
      label: employee.display_name,
      onRemove: () =>
        setQueryIds(
          "employees",
          selectedEmployeeIds.filter((selectedId) => selectedId !== id),
        ),
    });
  }

  return chips;
}

export interface LocationPublicationChipStatus {
  readonly id: string;
  readonly color?: string | null;
  readonly status: "published" | "unpublished";
  readonly published_shift_count: number;
}

export function createLocationPublicationChipStatuses(
  locations: readonly ScheduleLocation[],
  shifts: readonly ScheduleShift[],
  publicationStatus: SchedulePublicationStatus | null,
): LocationPublicationChipStatus[] {
  if (publicationStatus) {
    const statusByLocation = new Map(
      publicationStatus.locations.map((location) => [location.id, location]),
    );
    return locations.map((location) => {
      const status = statusByLocation.get(location.id);
      if (!status) {
        return {
          id: location.id,
          status: location.publication_status,
          published_shift_count: shifts.filter(
            (shift) => shift.location_id === location.id,
          ).length,
        };
      }
      return {
        id: status.id,
        color: status.color,
        status: status.status,
        published_shift_count: status.published_shift_count,
      };
    });
  }
  return locations.map((location) => ({
    id: location.id,
    status: location.publication_status,
    published_shift_count: shifts.filter(
      (shift) => shift.location_id === location.id,
    ).length,
  }));
}

export type SchedulePublicationActionTone = "none" | "partial" | "complete";

export function getSchedulePublicationActionTone(
  statuses: readonly LocationPublicationChipStatus[],
): SchedulePublicationActionTone {
  const publishedCount = statuses.filter(
    (status) => status.status === "published",
  ).length;
  if (publishedCount === 0) return "none";
  return publishedCount === statuses.length ? "complete" : "partial";
}

export function filterScheduleModel(
  model: ScheduleReadModel,
  search: URLSearchParams,
): ScheduleReadModel {
  const locationIds = validIds(
    search.get("locations"),
    model.locations.map((item) => item.id),
  );
  const jobIds = validIds(
    search.get("jobs"),
    model.jobs.map((item) => item.id),
  );
  const shiftTypeIds = validIds(
    search.get("shiftTypes"),
    model.shift_types.map((item) => item.id),
  );
  const employeeIds = validIds(
    search.get("employees"),
    model.employees.map((item) => item.id),
  );
  const locations = locationIds.length
    ? model.locations.filter((item) => locationIds.includes(item.id))
    : model.locations;
  // BL-974: by role builds its groups from these, so a job left out of the
  // filter brings no group (and a person who holds a chosen job sits under it).
  const jobs = jobIds.length
    ? model.jobs.filter((item) => jobIds.includes(item.id))
    : model.jobs;
  const shifts = model.shifts.filter(
    (shift) =>
      locations.some((location) => location.id === shift.location_id) &&
      (!jobIds.length || jobIds.includes(shift.job_id)) &&
      (!shiftTypeIds.length ||
        (shift.shift_type_id !== null &&
          shiftTypeIds.includes(shift.shift_type_id))) &&
      (!employeeIds.length ||
        (shift.employee_id !== null &&
          employeeIds.includes(shift.employee_id))),
  );
  const employees = model.employees.filter(
    (employee) =>
      (!employeeIds.length || employeeIds.includes(employee.id)) &&
      matchesScheduleEmployeeFilters(employee, {
        locationIds: locations.map((location) => location.id),
        shiftTypeIds,
        jobIds,
      }),
  );
  return { ...model, locations, jobs, employees, shifts };
}

export function parseIds(value: string | null): string[] {
  return value?.split(",").filter(Boolean) ?? [];
}

export function validIds(
  value: string | null,
  allowed: readonly string[],
): string[] {
  return parseIds(value).filter((id) => allowed.includes(id));
}

export function validDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
