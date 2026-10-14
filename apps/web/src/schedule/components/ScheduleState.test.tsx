import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScheduleState } from "./ScheduleState";

describe("ScheduleState", () => {
  it("says it quietly where the grid would be", () => {
    render(<ScheduleState title="No locations match" detail="Clear the location filter to see shifts." />);

    const state = screen.getByRole("status");
    expect(state.className).toBe("schedule-state");
    expect(screen.getByText("No locations match")).toBeTruthy();
    expect(screen.getByText("Clear the location filter to see shifts.")).toBeTruthy();
    // Loading and errors use the shared "B" look now, not this line.
    expect(screen.queryByRole("button")).toBeNull();
  });
});
