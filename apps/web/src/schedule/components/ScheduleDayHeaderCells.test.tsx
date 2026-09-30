import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleDayHeaderCells } from "./ScheduleDayHeaderCells";

const locationGroups = [
  {
    id: "loc-1",
    name: "Main Dining",
    timezone: "America/Los_Angeles",
    sort_order: 0,
    publication_status: "published" as const,
    published_at: null,
    sourceIds: ["loc-1"],
    sourceNames: [{ id: "loc-1", name: "Main Dining" }],
  },
  {
    id: "unified",
    name: "Patio + Bar",
    timezone: "",
    sort_order: 1,
    publication_status: "unpublished" as const,
    published_at: null,
    sourceIds: ["loc-2", "loc-3"],
    sourceNames: [
      { id: "loc-2", name: "Patio" },
      { id: "loc-3", name: "Bar" },
    ],
  },
];

const closures = [
  {
    id: "closure-1",
    location_id: "loc-2",
    closed_date: "2026-08-18",
    end_date: null,
    title: "Private event",
    is_all_day: true,
    shift_type_ids: [],
  },
  {
    id: "closure-2",
    location_id: "loc-1",
    closed_date: "2026-08-19",
    end_date: null,
    title: "Lunch closed",
    is_all_day: false,
    shift_type_ids: ["type-1", "type-2", "type-1"],
  },
  {
    id: "closure-3",
    location_id: "loc-2",
    closed_date: "2026-08-19",
    end_date: null,
    title: "Weather",
    is_all_day: true,
    shift_type_ids: [],
  },
  {
    id: "closure-4",
    location_id: "loc-3",
    closed_date: "2026-08-19",
    end_date: null,
    title: "Weather",
    is_all_day: true,
    shift_type_ids: [],
  },
];

const importantDates = [
  {
    id: "important-1",
    location_id: null,
    title: "Anniversary",
    type: "event" as const,
    starts_on: "2026-08-18",
    ends_on: "2026-08-18",
    recurrence: "none" as const,
  },
  {
    id: "important-2",
    location_id: "loc-3",
    title: "Bar Buyout",
    type: "event" as const,
    starts_on: "2026-08-18",
    ends_on: "2026-08-18",
    recurrence: "none" as const,
  },
  {
    id: "important-3",
    location_id: "loc-2",
    title: "Bar Buyout",
    type: "event" as const,
    starts_on: "2026-08-18",
    ends_on: "2026-08-18",
    recurrence: "none" as const,
  },
];

describe("ScheduleDayHeaderCells", () => {
  it("renders day headers per location group with closures and important dates", () => {
    const onDayHeaderClick = vi.fn();
    render(
      <ScheduleDayHeaderCells
        closures={closures}
        days={["2026-08-18", "2026-08-19"]}
        importantDates={importantDates}
        locationGroups={locationGroups}
        selectedDate="2026-08-19"
        todayDate="2026-08-18"
        onDayHeaderClick={onDayHeaderClick}
      />,
    );

    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
    const mainToday = screen.getByRole("columnheader", {
      name: "View Tue Aug 18, Main Dining",
    });
    expect(mainToday.getAttribute("data-today")).toBe("true");
    expect(mainToday.getAttribute("data-important")).toBe("true");
    expect(mainToday.getAttribute("data-schedule-location-filter-ids")).toBe(
      "loc-1",
    );

    const patioPartiallyClosed = screen.getByRole("columnheader", {
      name: "View Tue Aug 18, Patio + Bar",
    });
    expect(patioPartiallyClosed.getAttribute("data-closed")).toBe("false");
    expect(
      patioPartiallyClosed.getAttribute("data-schedule-location-filter-ids"),
    ).toBe("loc-2,loc-3");
    expect(patioPartiallyClosed.getAttribute("data-location-boundary")).toBe(
      "start",
    );
    expect(
      screen.getByLabelText(
        "Important: event: Anniversary · event: Bar Buyout",
      ),
    ).toBeTruthy();

    const partialClosed = screen.getByRole("columnheader", {
      name: "View Wed Aug 19, Main Dining",
    });
    expect(partialClosed.getAttribute("data-viewed")).toBe("true");
    expect(partialClosed.getAttribute("data-partial-closed")).toBe("true");
    expect(screen.getByLabelText("Closed for 2 shift types")).toBeTruthy();

    const patioFullyClosed = screen.getByRole("columnheader", {
      name: "View Wed Aug 19, Patio + Bar",
    });
    expect(patioFullyClosed.getAttribute("data-closed")).toBe("true");
    expect(patioFullyClosed.getAttribute("data-location-boundary")).toBeNull();

    fireEvent.click(partialClosed);
    expect(onDayHeaderClick).toHaveBeenCalledWith("2026-08-19", ["loc-1"]);
  });

  // BL-353: Monday 1 am in New York is still Sunday 10 pm in Los Angeles. One
  // location's column marks its own day; a group of several has no zone of its
  // own and follows the device.
  it("marks today in the location's own time zone, and the device's for a group", () => {
    const resolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    const device = vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockImplementation(function (this: Intl.DateTimeFormat) {
        return { ...resolvedOptions.call(this), timeZone: "America/New_York" };
      });
    vi.useFakeTimers({ now: new Date("2026-10-05T05:00:00Z"), toFake: ["Date"] });
    try {
      render(
        <ScheduleDayHeaderCells
          closures={[]}
          days={["2026-10-04", "2026-10-05"]}
          importantDates={[]}
          locationGroups={locationGroups}
          selectedDate="2026-10-05"
          onDayHeaderClick={vi.fn()}
        />,
      );
      const isToday = (name: string) =>
        screen.getByRole("columnheader", { name }).getAttribute("data-today");
      expect(isToday("View Sun Oct 4, Main Dining")).toBe("true");
      expect(isToday("View Mon Oct 5, Main Dining")).toBe("false");
      expect(isToday("View Sun Oct 4, Patio + Bar")).toBe("false");
      expect(isToday("View Mon Oct 5, Patio + Bar")).toBe("true");
    } finally {
      vi.useRealTimers();
      device.mockRestore();
    }
  });
});
