import { describe, expect, it } from "vitest";

import {
  calculateScheduleGridFillerHeight,
  calculateScheduleDayColumnMinWidth,
  countScheduleGridBodyRows,
  countScheduleGridColumns,
  countScheduleGridFillerRows,
  createScheduleBadgeMeasurementVersion,
  createScheduleGridDays,
  createScheduleGridLocationGroups,
  createScheduleGridTemplateColumns,
  scheduleGridFitCards,
  scheduleGridFitsVisibleDays,
  scheduleGridFittedColumns,
  scheduleGridWeeklyLocationWidths,
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

  // S1 (G14): one location's column keeps its own time zone, merged or not; a
  // group of several has none and follows the device.
  // S-226: a merged column marks the page's day, the first location's in their own order.
  it("gives a merged group its first location's time zone", () => {
    const zoneOf = (sources: typeof locations) =>
      createScheduleGridLocationGroups({ layout: "unified", locations: sources })[0]!.timezone;

    expect(zoneOf([locations[0]!])).toBe("America/Los_Angeles");
    const [main, patio] = locations;
    expect(zoneOf([{ ...patio!, timezone: "Europe/Istanbul" }, { ...main!, timezone: "America/New_York" }])).toBe("America/New_York");
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

  it("fits a week only while every day keeps a readable width", () => {
    const week = { columns: 7, showTotalHours: false };
    // 200 employee column + 7 x 88 = 816
    expect(scheduleGridFitsVisibleDays({ ...week, width: 975 })).toBe(true);
    expect(scheduleGridFitsVisibleDays({ ...week, width: 816 })).toBe(true);
    expect(scheduleGridFitsVisibleDays({ ...week, width: 815 })).toBe(false);
    expect(scheduleGridFitsVisibleDays({ ...week, width: 463 })).toBe(false);
    // The totals column takes 120 more.
    expect(
      scheduleGridFitsVisibleDays({ ...week, showTotalHours: true, width: 935 }),
    ).toBe(false);
    // Unmeasured keeps the fitted layout.
    expect(scheduleGridFitsVisibleDays({ ...week, width: 0 })).toBe(true);
  });

  // Mert, 2026-10-12: a card's line never wraps, and one location's seven
  // days still fit; the bands give up the side room, then a point of the name,
  // then cut a long name with "…", but never the hours.
  it("fits a week in the first band its cards fit in, never cutting the hours", () => {
    const needs = { side: 150, tight: 130, compact: 120, time: 100 };
    const fitAt = (width: number, showTotalHours = false) =>
      scheduleGridFitCards({ width, columns: 7, showTotalHours, needs });
    // Room for the side room: 7 x 200.
    expect(fitAt(1600)).toEqual({ band: "side", widths: { day: 200, employee: 200 }, fits: true });
    // 1440 window, box 1135: 133.6px a day, too narrow for the side room.
    expect(fitAt(1135)).toEqual({ band: "tight", widths: { day: 935 / 7, employee: 200 }, fits: true });
    // The employee column gives up room down to 144px before the next band.
    expect(fitAt(1100)).toEqual({ band: "tight", widths: { day: 130, employee: 190 }, fits: true });
    expect(fitAt(1000)).toEqual({ band: "compact", widths: { day: 120, employee: 160 }, fits: true });
    // Narrower: the employee column at 144px, a long name cut...
    expect(fitAt(900)).toEqual({ band: "clip", widths: { day: 108, employee: 144 }, fits: true });
    // ...until the hours would not fit: the week scrolls.
    expect(fitAt(800)).toEqual({ band: "side", widths: null, fits: false });
    // The totals column keeps its 120px.
    expect(fitAt(1720, true)).toEqual({ band: "side", widths: { day: 200, employee: 200 }, fits: true });
  });

  // Review finding: one location's fitted week used a flexible employee
  // column, which grows to 200px before the days get any, so a band chosen
  // with a 144px employee column cut the hours.
  it("gives one location's fitted week the widths its band was chosen with", () => {
    const needs = { side: 150, tight: 130, compact: 120, time: 90 };
    const fitted = (width: number, time = needs.time) =>
      scheduleGridFittedColumns({
        width,
        columns: 7,
        showTotalHours: false,
        needs: { ...needs, time },
        weeklyLocations: false,
      });
    // 790px box: the hours need 90px; seven days of (790 - 144) / 7 keep them.
    const narrow = fitted(790);
    expect(narrow).toEqual({ band: "clip", fits: true, widths: { day: 646 / 7, employee: 144 } });
    expect(narrow.widths!.day).toBeGreaterThanOrEqual(needs.time);
    expect(
      createScheduleGridTemplateColumns({
        columns: 7,
        fitVisibleColumns: narrow.fits,
        locationWidths: narrow.widths,
        showTotalHours: false,
      }),
    ).toBe(`144px repeat(7, ${646 / 7}px)`);
    // Hours that need 95px do not fit: the week scrolls with full-width cards.
    expect(fitted(790, 95)).toEqual({ band: "side", fits: false, widths: null });
    // Unmeasured, it fits while every day keeps 88px.
    expect(
      scheduleGridFittedColumns({ width: 975, columns: 7, showTotalHours: false, needs: null, weeklyLocations: false }),
    ).toEqual({ band: "side", fits: true, widths: null });
    expect(
      scheduleGridFittedColumns({ width: 790, columns: 7, showTotalHours: false, needs: null, weeklyLocations: false }).fits,
    ).toBe(false);
    // Several locations side by side keep their seven-day widths.
    expect(
      scheduleGridFittedColumns({ width: 1135, columns: 14, showTotalHours: false, needs: null, weeklyLocations: true }),
    ).toEqual({ band: "side", fits: true, widths: { day: 935 / 7, employee: 200 } });
  });

  it("puts each location's whole week on one screen while its cards' words fit", () => {
    // 1440 window, box 1135, two locations side by side: Downtown's cards
    // used to keep their one-line 146px and its week ran 400px off screen.
    // Seven days share 935px; the employee column keeps its 200px.
    expect(
      scheduleGridWeeklyLocationWidths({ width: 1135, showTotalHours: false }),
    ).toEqual({ day: 935 / 7, employee: 200 });
    // A pinned card needs 138px for "Dishwasher": the employee column gives
    // up 31px so the week still fits (169 + 7 x 138 = 1135).
    expect(
      scheduleGridWeeklyLocationWidths({
        width: 1135,
        showTotalHours: false,
        dayWidth: 138,
      }),
    ).toEqual({ day: 138, employee: 169 });
    // The totals column keeps its 120px at the end of the last week.
    expect(
      scheduleGridWeeklyLocationWidths({ width: 1615, showTotalHours: true }),
    ).toEqual({ day: 185, employee: 200 });
    // Below a 144px employee column the week scrolls with full-width cards.
    expect(
      scheduleGridWeeklyLocationWidths({
        width: 975,
        showTotalHours: false,
        dayWidth: 138,
      }),
    ).toBeNull();
    expect(
      scheduleGridWeeklyLocationWidths({ width: 0, showTotalHours: false }),
    ).toBeNull();
    expect(
      createScheduleGridTemplateColumns({
        columns: 14,
        locationWidths: { day: 138, employee: 169 },
        showTotalHours: true,
      }),
    ).toBe("169px repeat(14, 138px) 120px");
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
          warning_codes: ["availability"],
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
      // The availability "!" takes room on the card (KARARLAR Schedule, 2026-10-06).
      "shift-1:09:00:17:00:false:false:type-1:job-1:loc-1:Lead:true",
    );
    expect(version).toContain("job-1:Server");
    expect(version.endsWith("true|true|true|true|24h|true|true")).toBe(true);
  });
});
