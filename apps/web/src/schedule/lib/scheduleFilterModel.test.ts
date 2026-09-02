import type {
  SchedulePublicationStatus,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import { describe, expect, it, vi } from "vitest";

import {
  createLocationPublicationChipStatuses,
  createScheduleCalendarMarkers,
  createScheduleFilterChips,
  filterScheduleModel,
  getSchedulePublicationActionTone,
  hasUnpublishablePublishedSchedule,
  parseIds,
  validDate,
  validIds,
} from "./scheduleFilterModel";

const model = {
  locations: [
    {
      id: "loc-1",
      name: "Main Dining",
      publication_status: "published",
    },
    {
      id: "loc-2",
      name: "Patio",
      publication_status: "unpublished",
    },
  ],
  shift_types: [
    { id: "type-1", name: "Dinner", color: "#123456" },
    { id: "type-2", name: "Lunch", color: "#abcdef" },
  ],
  jobs: [
    { id: "job-1", name: "Server", color: "#f97316" },
    { id: "job-2", name: "Host", color: "#22c55e" },
  ],
  employees: [
    {
      id: "emp-1",
      display_name: "Alex Rivera",
      job_ids: ["job-1"],
      location_ids: ["loc-1"],
      shift_type_ids: ["type-1"],
    },
    {
      id: "emp-2",
      display_name: "Blair Chen",
      job_ids: ["job-2"],
      location_ids: ["loc-2"],
      shift_type_ids: ["type-2"],
    },
  ],
  shifts: [
    {
      id: "shift-1",
      location_id: "loc-1",
      employee_id: "emp-1",
      job_id: "job-1",
      shift_type_id: "type-1",
    },
    {
      id: "shift-2",
      location_id: "loc-2",
      employee_id: "emp-2",
      job_id: "job-2",
      shift_type_id: "type-2",
    },
  ],
  closures: [
    {
      id: "closure-1",
      closed_date: "2026-08-17",
      end_date: null,
      title: "Maintenance",
    },
    {
      id: "closure-2",
      closed_date: "2026-08-17",
      end_date: null,
      title: "Private event",
    },
  ],
  important_dates: [
    {
      id: "important-1",
      location_id: null,
      title: "Anniversary",
      type: "event",
      starts_on: "2026-08-18",
      ends_on: "2026-08-19",
      recurrence: "none",
    },
    {
      id: "important-2",
      location_id: null,
      title: "Holiday",
      type: "holiday",
      starts_on: "2025-07-04",
      ends_on: "2025-07-04",
      recurrence: "annual",
    },
  ],
} as unknown as ScheduleReadModel;

describe("scheduleFilterModel", () => {
  it("filters read model by selected query ids", () => {
    const filtered = filterScheduleModel(
      model,
      new URLSearchParams({
        locations: "loc-1,missing",
        jobs: "job-1",
        shiftTypes: "type-1",
        employees: "emp-1",
      }),
    );

    expect(filtered.locations.map((location) => location.id)).toEqual([
      "loc-1",
    ]);
    expect(filtered.employees.map((employee) => employee.id)).toEqual([
      "emp-1",
    ]);
    expect(filtered.shifts.map((shift) => shift.id)).toEqual(["shift-1"]);
  });

  it("filters employees by selected shift type eligibility", () => {
    const filtered = filterScheduleModel(
      model,
      new URLSearchParams({
        shiftTypes: "type-2",
      }),
    );

    expect(filtered.employees.map((employee) => employee.id)).toEqual([
      "emp-2",
    ]);
    expect(filtered.shifts.map((shift) => shift.id)).toEqual(["shift-2"]);
  });

  it("creates removable active filter chips", () => {
    const setQueryIds = vi.fn();
    const chips = createScheduleFilterChips({
      locations: model.locations,
      shiftTypes: model.shift_types,
      jobs: model.jobs,
      employees: model.employees,
      selectedLocationIds: ["loc-1"],
      selectedShiftTypeIds: ["type-1"],
      selectedJobIds: ["job-1"],
      selectedEmployeeIds: ["emp-1"],
      setQueryIds,
    });

    expect(chips.map((chip) => chip.label)).toEqual([
      "Main Dining",
      "Dinner",
      "Server",
      "Alex Rivera",
    ]);

    chips[0]?.onRemove();
    expect(setQueryIds).toHaveBeenCalledWith("locations", []);
  });

  it("omits filter chips while every filter is in its all state", () => {
    const chips = createScheduleFilterChips({
      locations: model.locations,
      shiftTypes: model.shift_types,
      jobs: model.jobs,
      employees: model.employees,
      selectedLocationIds: [],
      selectedShiftTypeIds: [],
      selectedJobIds: [],
      selectedEmployeeIds: [],
      setQueryIds: vi.fn(),
    });

    expect(chips).toEqual([]);
  });

  it("creates a location chip for a badge or header-selected location filter", () => {
    const setQueryIds = vi.fn();
    const chips = createScheduleFilterChips({
      locations: model.locations,
      shiftTypes: model.shift_types,
      jobs: model.jobs,
      employees: model.employees,
      selectedLocationIds: ["loc-2"],
      selectedShiftTypeIds: [],
      selectedJobIds: [],
      selectedEmployeeIds: [],
      setQueryIds,
    });

    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({
      key: "locations:loc-2",
      kind: "location",
      label: "Patio",
    });

    chips[0]?.onRemove();
    expect(setQueryIds).toHaveBeenCalledWith("locations", []);
  });

  it("creates merged closure markers for the mini calendar", () => {
    expect(createScheduleCalendarMarkers(model.closures)).toEqual([
      {
        date: "2026-08-17",
        endDate: null,
        kind: "closed",
        title: "Maintenance, Private event",
      },
    ]);
  });

  it("adds important date ranges and annual recurrence metadata to mini-calendar markers", () => {
    expect(
      createScheduleCalendarMarkers(model.closures, model.important_dates),
    ).toEqual([
      {
        date: "2026-08-17",
        endDate: null,
        kind: "closed",
        title: "Maintenance, Private event",
      },
      {
        date: "2026-08-18",
        endDate: "2026-08-19",
        kind: "important",
        title: "event: Anniversary",
        recurrence: "none",
      },
      {
        date: "2025-07-04",
        endDate: "2025-07-04",
        kind: "important",
        title: "holiday: Holiday",
        recurrence: "annual",
      },
    ]);
  });

  it("creates location publication chip statuses with live fallback counts", () => {
    const statuses = createLocationPublicationChipStatuses(
      model.locations,
      model.shifts,
      null,
    );

    expect(statuses).toMatchObject([
      {
        id: "loc-1",
        status: "published",
        reason: "live",
        published_shift_count: 1,
      },
      {
        id: "loc-2",
        status: "unpublished",
        reason: "not_live",
        published_shift_count: 1,
      },
    ]);
  });

  it("derives the publish action tone from location publication coverage", () => {
    expect(
      getSchedulePublicationActionTone([
        {
          id: "loc-1",
          name: "Main",
          status: "unpublished",
          published_shift_count: 0,
        },
        {
          id: "loc-2",
          name: "Patio",
          status: "unpublished",
          published_shift_count: 0,
        },
      ]),
    ).toBe("none");

    expect(
      getSchedulePublicationActionTone([
        {
          id: "loc-1",
          name: "Main",
          status: "published",
          published_shift_count: 1,
        },
        {
          id: "loc-2",
          name: "Patio",
          status: "unpublished",
          published_shift_count: 0,
        },
      ]),
    ).toBe("partial");

    expect(
      getSchedulePublicationActionTone([
        {
          id: "loc-1",
          name: "Main",
          status: "published",
          published_shift_count: 1,
        },
        {
          id: "loc-2",
          name: "Patio",
          status: "published",
          published_shift_count: 1,
        },
      ]),
    ).toBe("complete");
  });

  it("normalizes publication status reasons from server status", () => {
    const publicationStatus = {
      locations: [
        {
          id: "loc-2",
          name: "Patio",
          color: "#22c55e",
          status: "published",
          reason: "worked_shifts_kept",
          published_shift_count: 4,
          worked_shift_count: 2,
        },
      ],
    } as unknown as SchedulePublicationStatus;

    expect(
      createLocationPublicationChipStatuses(
        model.locations,
        model.shifts,
        publicationStatus,
      ),
    ).toMatchObject([
      {
        id: "loc-1",
        reason: "live",
        published_shift_count: 1,
      },
      {
        id: "loc-2",
        reason: "worked_shifts_kept",
        published_shift_count: 4,
        worked_shift_count: 2,
      },
    ]);
  });

  it("treats worked-kept publication status as historical, not unpublishable live schedule", () => {
    expect(
      hasUnpublishablePublishedSchedule([
        {
          id: "loc-1",
          name: "Main Dining",
          status: "published",
          reason: "worked_shifts_kept",
          published_shift_count: 0,
          worked_shift_count: 2,
        },
      ]),
    ).toBe(false);

    expect(
      hasUnpublishablePublishedSchedule([
        {
          id: "loc-1",
          name: "Main Dining",
          status: "published",
          reason: "live",
          published_shift_count: 3,
        },
      ]),
    ).toBe(true);
  });

  it("parses and validates query primitives", () => {
    expect(parseIds("a,,b")).toEqual(["a", "b"]);
    expect(validIds("a,c", ["a", "b"])).toEqual(["a"]);
    expect(validDate("2026-08-17")).toBe("2026-08-17");
    expect(validDate("08/17/2026")).toBeNull();
  });
});
