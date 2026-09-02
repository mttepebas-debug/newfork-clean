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
      "Deadline approaching. This week starts soon; publish the schedule as soon as possible.",
    );
    expect(statusDot.dataset.status).toBe("unpublished");
    expect(statusDot.dataset.deadline).toBe("true");
    expect(statusDot.getAttribute("title")).toContain("Deadline approaching");
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
