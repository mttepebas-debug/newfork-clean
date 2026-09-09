import type { ScheduleEmployee } from "@newfork/shared/schedule";
import { createRef, type CSSProperties } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleEmployeeCard } from "./ScheduleEmployeeCard";

function employee(overrides: Partial<ScheduleEmployee> = {}): ScheduleEmployee {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    employee_code: "NF-001",
    display_name: "Ada Lovelace",
    location_ids: ["22222222-2222-4222-8222-222222222222"],
    job_ids: ["33333333-3333-4333-8333-333333333333"],
    shift_type_ids: [],
    is_excluded_from_schedule: false,
    primary_job_id: "33333333-3333-4333-8333-333333333333",
    availability: null,
    ...overrides,
  };
}

describe("ScheduleEmployeeCard", () => {
  it("shows the weekly summary and removes the indicator after restrictions clear", () => {
    const projected = employee({ availability: [{ day: 1, mode: "unavailable", windows: [] }], weekly_availability: [{
      location_id: "22222222-2222-4222-8222-222222222222", location_name: "West", timezone: "America/Los_Angeles", week_start: "2035-01-15",
      status: "ready", unavailable_intervals: [], leave_intervals: [], clock_segments: [], days: [{ date: "2035-01-15", has_unavailable: true, all_day: true }],
    }] });
    const props = { editing: true, openShiftCount: 0, unassignedFrozen: false, unassignedLabelMode: "header" as const,
      rowStyle: {}, anchorRef: createRef<HTMLDivElement>(), onOpenEmployeeCard: vi.fn() };
    const h = render(<ScheduleEmployeeCard {...props} employee={projected} />);
    expect(screen.getByLabelText("Weekly availability preferences").getAttribute("title")).toBe("West: 2035-01-15 all day");
    h.rerender(<ScheduleEmployeeCard {...props} employee={{ ...projected, weekly_availability: [] }} />);
    expect(screen.queryByLabelText("Weekly availability preferences")).toBeNull();
    expect(screen.queryByLabelText(/Has .*availability rule/)).toBeNull();
  });
  it("renders employee identity and opens the employee card from the name button", () => {
    const onOpenEmployeeCard = vi.fn();
    render(
      <ScheduleEmployeeCard
        editing
        employee={employee()}
        openShiftCount={0}
        unassignedFrozen={false}
        unassignedLabelMode="header"
        rowStyle={{ "--schedule-row-min-height": "100px" } as CSSProperties}
        anchorRef={createRef<HTMLDivElement>()}
        onOpenEmployeeCard={onOpenEmployeeCard}
      />,
    );

    const button = screen.getByRole("button", { name: "Ada Lovelace" });
    const row = button.closest(".schedule-employee-cell") as HTMLElement;

    expect(screen.queryByText("NF-001")).toBeNull();
    expect(row.getAttribute("data-schedule-employee-row")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(row.getAttribute("data-testid")).toBe("schedule-sticky-employee-seam");
    expect(row.style.getPropertyValue("--schedule-row-min-height")).toBe(
      "100px",
    );
    expect(button.dataset.scheduleEmployeeCardTrigger).toBe("true");

    fireEvent.click(button);

    expect(onOpenEmployeeCard).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("shows availability summary when employee has schedule restrictions", () => {
    render(
      <ScheduleEmployeeCard
        editing={false}
        employee={employee({
          availability: [
            { day: 0, mode: "unrestricted", windows: [] },
            { day: 1, mode: "unavailable", windows: [] },
            {
              day: 2,
              mode: "windows",
              windows: [{ start: "09:00", end: "15:00" }],
            },
            { day: 3, mode: "unrestricted", windows: [] },
            { day: 4, mode: "unrestricted", windows: [] },
            { day: 5, mode: "unrestricted", windows: [] },
            { day: 6, mode: "unrestricted", windows: [] },
          ],
        })}
        openShiftCount={0}
        unassignedFrozen={false}
        unassignedLabelMode="header"
        rowStyle={{}}
        anchorRef={createRef<HTMLDivElement>()}
        onOpenEmployeeCard={vi.fn()}
      />,
    );

    const indicator = screen.getByLabelText("Has 2 availability rule(s)");
    const row = indicator.closest(".schedule-employee-cell");

    expect(row?.getAttribute("data-editing")).toBe("false");
    expect(indicator.getAttribute("title")).toContain(
      "Unavailable Monday all day",
    );
    expect(indicator.getAttribute("title")).toContain(
      "Unavailable outside Tuesday 09:00-15:00",
    );
  });

  it("renders unassigned rows with open shift count and freeze metadata", () => {
    render(
      <ScheduleEmployeeCard
        editing={false}
        employee={null}
        openShiftCount={2}
        unassignedFrozen
        unassignedLabelMode="centered"
        rowStyle={{ "--schedule-row-badge-height": "48px" } as CSSProperties}
        anchorRef={createRef<HTMLDivElement>()}
        onOpenEmployeeCard={vi.fn()}
      />,
    );

    const row = screen.getByRole("rowheader");

    expect(screen.getByText("Unassigned")).toBeTruthy();
    expect(screen.getByText("2 open shifts")).toBeTruthy();
    expect(row.getAttribute("data-unassigned")).toBe("true");
    expect(row.getAttribute("data-unassigned-frozen")).toBe("true");
    expect(row.getAttribute("data-schedule-unassigned-label-mode")).toBe(
      "centered",
    );
    expect(row.style.getPropertyValue("--schedule-row-badge-height")).toBe(
      "48px",
    );
  });
});
