import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScheduleFillerRow } from "./ScheduleFillerRow";

const locations = [
  {
    id: "loc-1",
    name: "Main Dining",
    timezone: "America/Los_Angeles",
    sort_order: 0,
    publication_status: "published",
    published_at: null,
    sourceIds: ["loc-1"],
    sourceNames: [{ id: "loc-1", name: "Main Dining" }],
  },
  {
    id: "loc-2",
    name: "Patio",
    timezone: "America/Los_Angeles",
    sort_order: 1,
    publication_status: "unpublished",
    published_at: null,
    sourceIds: ["loc-2"],
    sourceNames: [{ id: "loc-2", name: "Patio" }],
  },
] as const;

describe("ScheduleFillerRow", () => {
  it("renders filler cells for every location and day", () => {
    render(
      <div role="grid">
        <ScheduleFillerRow
          locations={locations}
          days={["2026-08-17", "2026-08-18"]}
          showTotalHours={false}
        />
      </div>,
    );

    expect(screen.getAllByRole("gridcell", { hidden: true })).toHaveLength(4);
    expect(
      screen
        .getAllByRole("gridcell", { hidden: true })
        .map((cell) => cell.getAttribute("data-location-boundary")),
    ).toEqual([null, null, "start", null]);
  });

  it("adds the total-hours filler cell when totals are shown", () => {
    render(
      <div role="grid">
        <ScheduleFillerRow
          locations={locations}
          days={["2026-08-17"]}
          showTotalHours
        />
      </div>,
    );

    expect(screen.getAllByRole("gridcell", { hidden: true })).toHaveLength(3);
  });
});
