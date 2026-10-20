import type { ScheduleLocation, ScheduleShift } from "@newfork/shared/schedule";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScheduleTotalValue, ScheduleTotalsRow } from "./ScheduleTotalsRow";

const location: ScheduleLocation & { readonly sourceIds: readonly string[] } = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Main Dining",
  timezone: "America/Los_Angeles",
  sort_order: 0,
  publication_status: "published",
  published_at: null,
  sourceIds: ["11111111-1111-4111-8111-111111111111"],
};

function shift(overrides: Partial<ScheduleShift> = {}): ScheduleShift {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    location_id: location.id,
    employee_id: "33333333-3333-4333-8333-333333333333",
    job_id: "44444444-4444-4444-8444-444444444444",
    shift_type_id: "55555555-5555-4555-8555-555555555555",
    scheduled_date: "2026-08-17",
    start_time: "16:00",
    end_time: "22:30",
    crosses_midnight: false,
    unpaid_break_minutes: 30,
    hide_time_on_badge: false,
    label_ids: [],
    label_names: [],
    note: "",
    warning_codes: [],
    ...overrides,
  };
}

describe("ScheduleTotalsRow", () => {
  it("marks only the first total day of later location groups as a location boundary", () => {
    render(
      <div role="grid">
        <ScheduleTotalsRow
          visibleShifts={[]}
          totalShifts={[]}
          locations={[
            location,
            {
              ...location,
              id: "77777777-7777-4777-8777-777777777777",
              name: "Patio",
              sort_order: 1,
              publication_status: "unpublished",
              sourceIds: ["77777777-7777-4777-8777-777777777777"],
            },
          ]}
          days={["2026-08-17", "2026-08-18"]}
        />
      </div>,
    );

    const cells = screen.getAllByRole("gridcell").slice(0, 4);
    expect(
      cells.map((cell) => cell.getAttribute("data-location-boundary")),
    ).toEqual([null, null, "start", null]);
  });

  it("renders day and week totals with visible/total comparison labels", () => {
    const visible = [shift({ end_time: "20:00" })];
    const total = [
      ...visible,
      shift({
        id: "66666666-6666-4666-8666-666666666666",
        start_time: "20:00",
        end_time: "22:30",
      }),
    ];

    render(
      <div role="grid">
        <ScheduleTotalsRow
          visibleShifts={visible}
          totalShifts={total}
          locations={[location]}
          days={["2026-08-17"]}
        />
      </div>,
    );

    expect(screen.getByRole("rowheader").textContent).toBe("Total");
    expect(
      screen.getByRole("gridcell", {
        name: "Main Dining Mon, Aug 17 total hours 3h 30m / 5h 30m",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("gridcell", {
        name: "Week total hours 3h 30m / 5h 30m",
      }),
    ).toBeTruthy();
    expect(
      document.querySelectorAll(
        ".schedule-total-value[data-has-comparison='true']",
      ),
    ).toHaveLength(2);
  });

  it("renders a single total value without a comparison marker", () => {
    render(
      <ScheduleTotalValue
        total={{
          visibleMinutes: 390,
          totalMinutes: 390,
        }}
      />,
    );

    expect(screen.getByText("6h 30m")).toBeTruthy();
    expect(
      document.querySelector(
        ".schedule-total-value[data-has-comparison='true']",
      ),
    ).toBeNull();
  });

  // QA 49: the hidden shift on reference hours marks the week, not the exact part shown.
  it("keeps the comparison and marks only the part with reference hours", () => {
    render(
      <ScheduleTotalValue
        total={{
          visibleMinutes: 450,
          totalMinutes: 900,
          totalContainsEstimates: true,
        }}
      />,
    );

    const value = document.querySelector(".schedule-total-value[data-has-comparison='true']");
    expect(value?.textContent).toBe("7h 30m/ ~15h");
    expect(value?.getAttribute("title")).toBe("~ Some shifts use their shift type's default hours, which can change.");
  });
});
