import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ScheduleReadModel } from "@newfork/shared/schedule";

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

const closure = (
  id: string,
  location_id: string,
  closed_date: string,
  extra: Partial<ScheduleReadModel["closures"][number]> = {},
): ScheduleReadModel["closures"][number] => ({
  id,
  location_id,
  closed_date,
  title: "Weather",
  is_all_day: true,
  kind: "closed",
  opens: null,
  closes: null,
  status: "published",
  ...extra,
});

const closures: ScheduleReadModel["closures"] = [
  closure("closure-1", "loc-2", "2026-08-18", { title: "Private event" }),
  closure("closure-2", "loc-1", "2026-08-19", {
    title: "Christmas Eve",
    is_all_day: false,
    kind: "short",
    opens: "10:00",
    closes: "15:00",
  }),
  closure("closure-3", "loc-2", "2026-08-19"),
  closure("closure-4", "loc-3", "2026-08-19"),
  // Scheduled: only its dashed chip until it goes out.
  closure("closure-5", "loc-1", "2026-08-18", { status: "scheduled" }),
];

const post = (
  id: string,
  location_id: string | null,
  title: string,
  extra: Partial<ScheduleReadModel["important_dates"][number]> = {},
): ScheduleReadModel["important_dates"][number] => ({
  id,
  location_id,
  title,
  category: "event",
  category_other: null,
  starts_on: "2026-08-18",
  ends_on: "2026-08-18",
  status: "published",
  publish_at: null,
  day: "open",
  opens: null,
  closes: null,
  event_from: null,
  event_until: null,
  ...extra,
});

const importantDates: ScheduleReadModel["important_dates"] = [
  post("important-1", null, "Anniversary"),
  // One post at two locations of a group: one chip, its Closed row first.
  post("important-2", "loc-3", "Bar Buyout"),
  post("important-2", "loc-2", "Bar Buyout", { day: "closed" }),
  post("important-3", "loc-1", "Christmas Eve", {
    starts_on: "2026-08-19",
    ends_on: "2026-08-19",
    day: "short",
    opens: "10:00",
    closes: "15:00",
  }),
  post("important-4", "loc-1", "Inspection", {
    status: "scheduled",
    publish_at: "2026-08-10T16:00:00Z",
    day: "closed",
  }),
];

describe("ScheduleDayHeaderCells", () => {
  it("renders day headers per location group with Closed days and post chips (EKRAN-08)", () => {
    const onDayHeaderClick = vi.fn();
    const onOpenPost = vi.fn();
    render(
      <ScheduleDayHeaderCells
        closures={closures}
        days={["2026-08-18", "2026-08-19"]}
        importantDates={importantDates}
        locationGroups={locationGroups}
        selectedDate="2026-08-19"
        todayDate="2026-08-18"
        onDayHeaderClick={onDayHeaderClick}
        onOpenPost={onOpenPost}
      />,
    );

    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
    const mainToday = screen.getByRole("columnheader", {
      name: "View Tue Aug 18, Main Dining",
    });
    expect(mainToday.getAttribute("data-today")).toBe("true");
    expect(mainToday.getAttribute("data-posts")).toBe("true");
    // A scheduled Closed day does not shade the column yet.
    expect(mainToday.getAttribute("data-closed")).toBe("false");
    expect(mainToday.getAttribute("data-schedule-location-filter-ids")).toBe(
      "loc-1",
    );
    expect(within(mainToday).getByRole("button").textContent).toBe("Anniversary");
    expect(within(mainToday).getByLabelText("1 more: Closed · announces Aug 10").textContent).toBe("+1");

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
    expect(within(patioPartiallyClosed).getByRole("button").textContent).toBe("Anniversary");
    expect(within(patioPartiallyClosed).getByLabelText("1 more: Closed · Bar Buyout")).toBeTruthy();

    const shortHours = screen.getByRole("columnheader", {
      name: "View Wed Aug 19, Main Dining",
    });
    expect(shortHours.getAttribute("data-viewed")).toBe("true");
    fireEvent.click(within(shortHours).getByRole("button", { name: "Short hours 10a–3p · Christmas Eve" }));
    expect(onOpenPost).toHaveBeenCalledWith("important-3");
    expect(onDayHeaderClick).not.toHaveBeenCalled();

    const patioFullyClosed = screen.getByRole("columnheader", {
      name: "View Wed Aug 19, Patio + Bar",
    });
    expect(patioFullyClosed.getAttribute("data-closed")).toBe("true");
    expect(patioFullyClosed.getAttribute("data-location-boundary")).toBeNull();

    fireEvent.click(shortHours);
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
