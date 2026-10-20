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
    ...overrides,
  };
}

describe("ScheduleEmployeeCard", () => {
  it("shows the name's \"!\" only when given the week's lines, and lists them all in its window (KARARLAR Schedule, 2026-10-06)", () => {
    const props = { editing: true, employee: employee(), openShiftCount: 0, unassignedFrozen: false, unassignedLabelMode: "header" as const,
      rowStyle: {}, anchorRef: createRef<HTMLDivElement>(), onOpenEmployeeCard: vi.fn() };
    const h = render(<ScheduleEmployeeCard {...props} />);
    expect(h.container.querySelector(".schedule-availability-mark")).toBeNull();
    const lines = ["Marked unavailable Tue, Sep 29 · After 6:00 PM", "Marked unavailable Fri, Oct 2 · All day"];
    h.rerender(<ScheduleEmployeeCard {...props} availabilityLines={lines} />);
    const mark = screen.getByRole("button", { name: "Ada Lovelace: unavailable days this week" });
    fireEvent.click(mark);
    expect([...screen.getByRole("dialog").querySelectorAll("p")].map((line) => line.textContent)).toEqual(lines);
    expect(props.onOpenEmployeeCard).not.toHaveBeenCalled();
  });
  // QA 59: with nothing to open (the employee's Team schedule), the name is text, not a dead button.
  it("draws the name as plain text when there is no employee card to open", () => {
    render(
      <ScheduleEmployeeCard
        editing={false}
        employee={employee()}
        openShiftCount={0}
        unassignedFrozen={false}
        unassignedLabelMode="header"
        rowStyle={{}}
        anchorRef={createRef<HTMLDivElement>()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Ada Lovelace" })).toBeNull();
    expect(screen.getByText("Ada Lovelace").className).toBe("schedule-employee-name-text");
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
