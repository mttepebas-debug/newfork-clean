import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleGridHeaders } from "./ScheduleGridHeaders";

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

describe("ScheduleGridHeaders", () => {
  it("renders the reference grid header bands and wires header actions", () => {
    const onDayHeaderClick = vi.fn();
    const onManageLogo = vi.fn();
    const onToggleLocationFilter = vi.fn();

    render(
      <ScheduleGridHeaders
        closures={[]}
        days={["2026-08-18"]}
        importantDates={[]}
        locationGroups={locationGroups}
        organizationLogoPlacement={{
          scale: 1,
          offset_x: 0,
          offset_y: 0,
        }}
        organizationLogoUrl={null}
        organizationName="Meyhouse Jazz"
        selectedDate="2026-08-18"
        showTotalHours
        weekStartDate="2026-08-17"
        onDayHeaderClick={onDayHeaderClick}
        onManageLogo={onManageLogo}
        onToggleLocationFilter={onToggleLocationFilter}
      />,
    );

    const logoButton = screen.getByRole("button", {
      name: "Manage schedule logo",
    });
    expect(screen.getByTestId("schedule-organization-logo-frame")).toBe(
      logoButton,
    );
    expect(screen.getByTestId("schedule-sticky-left-header-cap")).toBeTruthy();
    expect(
      screen
        .getByTestId("schedule-sticky-left-header-cap")
        .getAttribute("data-schedule-logo-slot"),
    ).toBe("expanded");
    expect(
      screen.getByTestId("schedule-sticky-employee-header-seam"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("schedule-generated-organization-logo"),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Meyhouse Jazz logo" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Total hours" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Employees" }),
    ).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Week" })).toBeTruthy();

    fireEvent.click(logoButton);
    expect(onManageLogo).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getAllByTestId("schedule-day-header-2026-08-18")[0]!,
    );
    expect(onDayHeaderClick).toHaveBeenCalledWith("2026-08-18", ["loc-1"]);

    fireEvent.click(screen.getByRole("button", { name: "Patio" }));
    expect(onToggleLocationFilter).toHaveBeenCalledWith(["loc-2"]);
  });

  it("omits total headers when total hours are hidden", () => {
    render(
      <ScheduleGridHeaders
        closures={[]}
        days={["2026-08-18"]}
        importantDates={[]}
        locationGroups={locationGroups.slice(0, 1)}
        organizationLogoPlacement={null}
        organizationLogoUrl={null}
        organizationName="Meyhouse Jazz"
        selectedDate="2026-08-18"
        showTotalHours={false}
        weekStartDate="2026-08-17"
        onDayHeaderClick={vi.fn()}
        onToggleLocationFilter={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("columnheader", { name: "Total hours" }),
    ).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Week" })).toBeNull();
  });

  it("uses the canonical week start for location publication warnings in daily view", () => {
    render(
      <ScheduleGridHeaders
        closures={[]}
        days={["2026-09-03"]}
        importantDates={[]}
        locationGroups={[locationGroups[1]!]}
        organizationLogoPlacement={null}
        organizationLogoUrl={null}
        organizationName="Meyhouse Jazz"
        selectedDate="2026-09-03"
        showTotalHours={false}
        weekStartDate="2026-09-01"
        currentDate="2026-09-02"
        onDayHeaderClick={vi.fn()}
        onToggleLocationFilter={vi.fn()}
      />,
    );

    const statusDot = screen.getByLabelText(
      "Schedule week is underway. Publish this schedule as soon as possible.",
    );
    expect(statusDot.dataset.status).toBe("unpublished");
    expect(statusDot.dataset.deadline).toBe("true");
  });
});
