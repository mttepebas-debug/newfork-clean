import { describe, expect, it } from "vitest";

import {
  calculateScheduleGridFillerHeight,
  calculateScheduleDayColumnMinWidth,
  countScheduleGridBodyRows,
  countScheduleGridColumns,
  countScheduleGridFillerRows,
  countScheduleGridTotalColumns,
  createScheduleBadgeMeasurementVersion,
  createScheduleGridDays,
  createScheduleGridLocationGroups,
  createScheduleGridTemplateColumns,
  resolveScheduleInteractionLocationId,
} from "./scheduleGridLayout";

const locations = [
  {
    id: "loc-1",
    name: "Main Dining",
    timezone: "America/Los_Angeles",
    sort_order: 0,
    publication_status: "published" as const,
    published_at: "2026-08-17T00:00:00.000Z",
  },
  {
    id: "loc-2",
    name: "Patio",
    timezone: "America/Los_Angeles",
    sort_order: 1,
    publication_status: "unpublished" as const,
    published_at: null,
  },
];

describe("scheduleGridLayout", () => {
  it("builds day and week column dates", () => {
    expect(
      createScheduleGridDays({
        selectedDate: "2026-08-19",
        view: "day",
        weekStart: "2026-08-17",
      }),
    ).toEqual(["2026-08-19"]);
    expect(
      createScheduleGridDays({
        selectedDate: "2026-08-19",
        view: "week",
        weekStart: "2026-08-17",
      }),
    ).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ]);
  });

  it("creates separate and unified location groups", () => {
    const separate = createScheduleGridLocationGroups({
      layout: "separate",
      locations,
    });
    expect(separate).toHaveLength(2);
    expect(separate[0]!.sourceIds).toEqual(["loc-1"]);
    expect(separate[0]!.sourceNames).toEqual([
      { id: "loc-1", name: "Main Dining" },
    ]);

    const unified = createScheduleGridLocationGroups({
      layout: "unified",
      locations,
    });
    expect(unified).toEqual([
      expect.objectContaining({
        id: "unified",
        name: "Main Dining + Patio",
        publication_status: "unpublished",
        sourceIds: ["loc-1", "loc-2"],
      }),
    ]);
  });

  it("resolves the reference interaction location for unified cells", () => {
    expect(
      resolveScheduleInteractionLocationId({
        sourceLocationIds: ["loc-1", "loc-2"],
        employeeLocationIds: ["loc-1"],
        activeInteractionShiftLocationId: "loc-2",
      }),
    ).toBe("loc-2");
    expect(
      resolveScheduleInteractionLocationId({
        sourceLocationIds: ["loc-1", "loc-2"],
        employeeLocationIds: ["loc-2"],
        activeInteractionShiftLocationId: null,
      }),
    ).toBe("loc-2");
    expect(
      resolveScheduleInteractionLocationId({
        sourceLocationIds: ["loc-1", "loc-2"],
        employeeLocationIds: ["loc-3"],
        activeInteractionShiftLocationId: "loc-4",
      }),
    ).toBe("loc-1");
  });

  it("keeps the reference grid sizing thresholds", () => {
    const groups = createScheduleGridLocationGroups({
      layout: "separate",
      locations,
    });
    expect(countScheduleGridColumns({ days: ["2026-08-17"], locationGroups: [] }))
      .toBe(1);
    expect(
      countScheduleGridColumns({
        days: ["2026-08-17", "2026-08-18"],
        locationGroups: groups,
      }),
    ).toBe(4);
    expect(
      countScheduleGridTotalColumns({
        columns: 4,
        showTotalHours: true,
      }),
    ).toBe(5);
    expect(
      calculateScheduleDayColumnMinWidth({
        editing: true,
        locationGroups: groups,
        measuredBadgeWidth: 300,
        view: "week",
      }),
    ).toBe(309);
    expect(
      calculateScheduleDayColumnMinWidth({
        editing: false,
        locationGroups: groups,
        measuredBadgeWidth: 300,
        view: "week",
      }),
    ).toBe(303);
    expect(
      calculateScheduleDayColumnMinWidth({
        editing: false,
        locationGroups: [],
        measuredBadgeWidth: 90,
        view: "week",
      }),
    ).toBe(93);
    expect(
      calculateScheduleDayColumnMinWidth({
        editing: true,
        locationGroups: [
          {
            ...groups[0]!,
            id: "unified",
            name: "Main Dining + Patio + Rooftop + Banquet",
            sourceIds: ["loc-1", "loc-2"],
          },
        ],
        measuredBadgeWidth: 90,
        view: "week",
      }),
    ).toBe(99);
  });

  it("lets empty weekly locations fit the viewport regardless of their names", () => {
    const groups = createScheduleGridLocationGroups({
      layout: "separate",
      locations,
    });
    expect(
      calculateScheduleDayColumnMinWidth({
        editing: false,
        locationGroups: groups,
        measuredBadgeWidth: 0,
        view: "week",
      }),
    ).toBe(0);
    expect(
      calculateScheduleDayColumnMinWidth({
        editing: false,
        locationGroups: groups,
        measuredBadgeWidth: 0,
        view: "day",
      }),
    ).toBe(168);
  });

  it("can create a weekly unified template that fits visible grid width", () => {
    expect(
      createScheduleGridTemplateColumns({
        columns: 7,
        fitVisibleColumns: true,
        showTotalHours: true,
      }),
    ).toBe("minmax(144px, 200px) repeat(7, minmax(0, 1fr)) minmax(72px, 120px)");
  });

  it("counts visible body and filler rows", () => {
    expect(
      countScheduleGridBodyRows({
        rowCount: 3,
        showUnassignedRow: true,
        showEmployeeGroupHeaders: true,
        employeeRowGroupCount: 2,
        showTotalHours: true,
      }),
    ).toBe(7);
    expect(
      countScheduleGridBodyRows({
        rowCount: 0,
        showUnassignedRow: false,
        showEmployeeGroupHeaders: false,
        employeeRowGroupCount: 0,
        showTotalHours: true,
      }),
    ).toBe(1);
    expect(countScheduleGridFillerRows(7)).toBe(1);
    expect(countScheduleGridFillerRows(10)).toBe(1);
    expect(countScheduleGridFillerRows(0)).toBe(1);
  });

  it("calculates one elastic filler row height from the visible grid space", () => {
    expect(
      calculateScheduleGridFillerHeight({
        viewportHeight: 620,
        fillerStartOffset: 360,
        totalRowHeight: 40,
        horizontalNavHeight: 17,
      }),
    ).toBe(203);
    expect(
      calculateScheduleGridFillerHeight({
        viewportHeight: 360,
        fillerStartOffset: 380,
        totalRowHeight: 40,
        horizontalNavHeight: 17,
      }),
    ).toBe(0);
  });

  it("captures fields that affect badge measurement", () => {
    const version = createScheduleBadgeMeasurementVersion({
      shifts: [
        {
          id: "shift-1",
          job_id: "job-1",
          shift_type_id: "type-1",
          location_id: "loc-1",
          start_time: "09:00",
          end_time: "17:00",
          crosses_midnight: false,
          hide_time_on_badge: false,
          label_names: ["Lead"],
        },
      ] as never,
      jobs: [{ id: "job-1", name: "Server" }] as never,
      shiftTypes: [{ id: "type-1", name: "Dinner" }] as never,
      locationGroups: [
        {
          id: "loc-1",
          name: "Main Dining",
          sourceIds: ["loc-1"],
          sourceNames: [{ id: "loc-1", name: "Main Dining" }],
        },
      ] as never,
      showShiftTypePresets: true,
      showShiftType: true,
      showShiftLabels: true,
      showClockTimes: true,
      timeFormat: "24h",
      showJobColorDot: true,
      showLocationInBadge: true,
    });

    expect(version).toContain(
      "shift-1:09:00:17:00:false:false:type-1:job-1:loc-1:Lead",
    );
    expect(version).toContain("job-1:Server");
    expect(version.endsWith("true|true|true|true|24h|true|true")).toBe(true);
  });
});
