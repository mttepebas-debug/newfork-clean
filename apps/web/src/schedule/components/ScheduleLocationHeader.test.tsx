import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleLocationHeader } from "./ScheduleLocationHeader";

const unifiedLocation = {
  id: "unified",
  name: "Main Dining + Patio",
  timezone: "",
  sort_order: 0,
  publication_status: "unpublished" as const,
  published_at: null,
  sourceIds: ["loc-1", "loc-2"],
  sourceNames: [
    { id: "loc-1", name: "Main Dining" },
    { id: "loc-2", name: "Patio" },
  ],
};

describe("ScheduleLocationHeader", () => {
  it("toggles all grouped locations from the header", () => {
    const onToggleLocationFilter = vi.fn();
    render(
      <ScheduleLocationHeader
        location={unifiedLocation}
        locationIndex={1}
        daysLength={7}
        weekStartDate="2026-09-07"
        currentDate="2026-09-01"
        onToggleLocationFilter={onToggleLocationFilter}
      />,
    );

    const header = screen.getByRole("columnheader");
    expect(header.getAttribute("data-location-boundary")).toBe("start");
    expect(header.getAttribute("data-testid")).toBe("schedule-location-seam");
    expect(header.getAttribute("data-schedule-location-filter-ids")).toBe(
      "loc-1,loc-2",
    );
    expect(header.getAttribute("data-clickable")).toBe("true");
    expect(header.getAttribute("style")).toContain("grid-column: span 7");
    const statusDot = screen.getByLabelText("Unpublished");
    expect(statusDot.dataset.status).toBe("unpublished");
    expect(statusDot.dataset.deadline).toBe("false");

    fireEvent.click(header);
    expect(onToggleLocationFilter).toHaveBeenCalledWith(["loc-1", "loc-2"]);

    fireEvent.keyDown(header, { key: "Enter" });
    expect(onToggleLocationFilter).toHaveBeenLastCalledWith(["loc-1", "loc-2"]);
  });

  // BL-713: the status is not told by the dot's color alone. Focusing the header
  // reads it out with the location's name.
  it("names the publication status for the keyboard and screen reader", () => {
    render(
      <ScheduleLocationHeader
        location={{ ...unifiedLocation, sourceNames: [unifiedLocation.sourceNames[0]!], name: "Main Dining" }}
        locationIndex={0}
        daysLength={7}
        weekStartDate="2026-09-21"
        currentDate="2026-09-01"
        onToggleLocationFilter={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: "Unpublished" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Unpublished Main Dining" })).toBeTruthy();
  });

  // BL-683: the publish deadline is the manager's job; an employee looking at the
  // same week is not told to publish it.
  it("never asks an employee to publish a week whose deadline is near", () => {
    const header = (publishWarnings?: boolean) => (
      <ScheduleLocationHeader
        location={unifiedLocation}
        locationIndex={0}
        daysLength={7}
        weekStartDate="2026-09-07"
        currentDate="2026-09-06"
        publishWarnings={publishWarnings}
        onToggleLocationFilter={vi.fn()}
      />
    );
    const { rerender } = render(header());
    expect(screen.getByLabelText(/publish the schedule as soon as possible/)).toBeTruthy();

    rerender(header(false));
    const dot = screen.getByLabelText("Unpublished");
    expect(dot.dataset.deadline).toBe("false");
    expect(screen.queryByLabelText(/as soon as possible/)).toBeNull();
  });

  it("renders published status in the per-location header status area", () => {
    render(
      <ScheduleLocationHeader
        location={{
          ...unifiedLocation,
          id: "loc-1",
          name: "Main Dining",
          publication_status: "published",
          sourceIds: ["loc-1"],
          sourceNames: [{ id: "loc-1", name: "Main Dining" }],
        }}
        locationIndex={0}
        daysLength={7}
        weekStartDate="2026-09-07"
        currentDate="2026-09-05"
        onToggleLocationFilter={vi.fn()}
      />,
    );

    const statusDot = screen.getByLabelText("Published - Live");
    expect(statusDot.dataset.status).toBe("published");
    expect(statusDot.dataset.deadline).toBe("false");
    expect(screen.queryByText("Published")).toBeNull();
  });

  // BL-277: Sunday 11 pm in Los Angeles is Monday in UTC. A week starting
  // Wednesday is three days out there, so no publish warning yet.
  it("counts the days to the week in the location's own time zone", () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T06:00:00Z"), toFake: ["Date"] });
    try {
      render(
        <ScheduleLocationHeader
          location={{
            ...unifiedLocation,
            id: "loc-1",
            name: "Main Dining",
            timezone: "America/Los_Angeles",
            sourceIds: ["loc-1"],
            sourceNames: [{ id: "loc-1", name: "Main Dining" }],
          }}
          locationIndex={0}
          daysLength={7}
          weekStartDate="2026-10-07"
          onToggleLocationFilter={vi.fn()}
        />,
      );
      expect(screen.getByLabelText("Unpublished").dataset.deadline).toBe("false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns unpublished headers when the schedule week is about to start", () => {
    render(
      <ScheduleLocationHeader
        location={{
          ...unifiedLocation,
          id: "loc-1",
          name: "Main Dining",
          sourceIds: ["loc-1"],
          sourceNames: [{ id: "loc-1", name: "Main Dining" }],
        }}
        locationIndex={0}
        daysLength={7}
        weekStartDate="2026-09-07"
        currentDate="2026-09-05"
        onToggleLocationFilter={vi.fn()}
      />,
    );

    const statusDot = screen.getByLabelText(
      "Deadline approaching. The week starts Mon, Sep 7; publish the schedule as soon as possible.",
    );
    expect(statusDot.dataset.status).toBe("unpublished");
    expect(statusDot.dataset.deadline).toBe("true");
    expect(statusDot.getAttribute("title")).toContain("Deadline approaching");
  });

  // Settings → Scheduling → Publish by: the deadline is that weekday before the
  // week, and the warning names the date (two days ahead, as before).
  describe("with the workspace's Publish by day", () => {
    const header = (currentDate: string) => (
      <ScheduleLocationHeader
        location={{
          ...unifiedLocation,
          id: "loc-1",
          name: "Main Dining",
          sourceIds: ["loc-1"],
          sourceNames: [{ id: "loc-1", name: "Main Dining" }],
        }}
        locationIndex={0}
        daysLength={7}
        weekStartDate="2026-09-07"
        currentDate={currentDate}
        publishDeadlineDay="thursday"
        onToggleLocationFilter={vi.fn()}
      />
    );

    it("stays quiet until two days before that day", () => {
      render(header("2026-08-31"));
      expect(screen.getByLabelText("Unpublished").dataset.deadline).toBe("false");
    });

    it("names the date to publish by and the week's start", () => {
      render(header("2026-09-01"));
      const dot = screen.getByLabelText(
        "Deadline approaching. Publish by Thu, Sep 3. The week starts Mon, Sep 7.",
      );
      expect(dot.dataset.deadline).toBe("true");
    });

    it("says the date passed while the week has not started", () => {
      render(header("2026-09-05"));
      const dot = screen.getByLabelText(
        "Publish deadline passed on Thu, Sep 3. The week starts Mon, Sep 7; publish as soon as possible.",
      );
      expect(dot.dataset.deadline).toBe("true");
    });
  });

  it("keeps unpublished headers urgent while the schedule week is underway", () => {
    render(
      <ScheduleLocationHeader
        location={{
          ...unifiedLocation,
          id: "loc-1",
          name: "Main Dining",
          sourceIds: ["loc-1"],
          sourceNames: [{ id: "loc-1", name: "Main Dining" }],
        }}
        locationIndex={0}
        daysLength={7}
        weekStartDate="2026-09-01"
        currentDate="2026-09-02"
        onToggleLocationFilter={vi.fn()}
      />,
    );

    const statusDot = screen.getByLabelText(
      "Schedule week is underway. Publish this schedule as soon as possible.",
    );
    expect(statusDot.dataset.status).toBe("unpublished");
    expect(statusDot.dataset.deadline).toBe("true");
  });

  it("toggles one source location from a grouped source button", () => {
    const onToggleLocationFilter = vi.fn();
    render(
      <ScheduleLocationHeader
        location={unifiedLocation}
        locationIndex={0}
        daysLength={1}
        weekStartDate="2026-09-07"
        currentDate="2026-09-01"
        onToggleLocationFilter={onToggleLocationFilter}
      />,
    );

    const patioButton = screen.getByRole("button", { name: "Patio" });
    expect(patioButton.getAttribute("data-schedule-location-filter-ids")).toBe(
      "loc-2",
    );
    fireEvent.click(patioButton);

    expect(onToggleLocationFilter).toHaveBeenCalledWith(["loc-2"]);
  });
});
