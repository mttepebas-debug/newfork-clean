import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScheduleState } from "./ScheduleState";

describe("ScheduleState", () => {
  it("renders the reference status state", () => {
    render(<ScheduleState title="Loading Schedule" detail="Resolving week." />);

    const state = screen.getByRole("status");
    expect(state.className).toBe("schedule-state");
    expect(screen.getByText("Loading Schedule")).toBeTruthy();
    expect(screen.getByText("Resolving week.")).toBeTruthy();
  });

  it("uses alert semantics for errors", () => {
    render(
      <ScheduleState
        title="Schedule unavailable"
        detail="Could not load schedule."
        error
      />,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
