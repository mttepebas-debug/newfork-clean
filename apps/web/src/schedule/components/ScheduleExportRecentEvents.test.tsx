import type { ScheduleRecentExportEvent } from "@newfork/shared/schedule";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScheduleExportRecentEvents } from "./ScheduleExportRecentEvents";

function event(
  overrides: Partial<ScheduleRecentExportEvent> = {},
): ScheduleRecentExportEvent {
  return {
    id: "event-1",
    workspace_id: "workspace-1",
    surface: "schedule",
    format: "csv",
    params: {
      week_start: "2026-08-17",
      layout: "weekly",
      location_ids: ["loc-1", "loc-2"],
    },
    actor_user_id: "user-1",
    created_at: "2026-08-17T12:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ScheduleExportRecentEvents", () => {
  it("renders recent export entries with format, params, and relative time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T12:05:00.000Z"));

    render(<ScheduleExportRecentEvents events={[event()]} />);

    expect(screen.getByText("Recent exports")).toBeTruthy();
    expect(screen.getByText("schedule")).toBeTruthy();
    expect(screen.getByText(/CSV .*2026-08-17 .*weekly .*2 location/)).toBeTruthy();
    expect(screen.getByText("5m ago")).toBeTruthy();
  });

  it("limits the visible event list to the ten most recent rows", () => {
    const events = Array.from({ length: 12 }, (_, index) =>
      event({ id: `event-${index + 1}` }),
    );

    render(<ScheduleExportRecentEvents events={events} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  it("shows an empty state when there are no recent exports", () => {
    render(<ScheduleExportRecentEvents events={[]} />);

    expect(screen.getByText("No exports yet.")).toBeTruthy();
  });
});
