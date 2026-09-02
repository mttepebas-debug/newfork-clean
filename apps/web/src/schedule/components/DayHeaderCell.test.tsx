import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DayHeaderCell } from "./DayHeaderCell";

describe("DayHeaderCell", () => {
  it("renders closed and important date indicators together", () => {
    render(
      <DayHeaderCell
        date="2026-08-18"
        closure={{
          id: "60000000-0000-4000-8000-000000000001",
          location_id: "10000000-0000-4000-8000-000000000001",
          closed_date: "2026-08-18",
          end_date: null,
          title: "Private event",
          is_all_day: true,
          shift_type_ids: [],
        }}
        importantDates={[
          {
            id: "70000000-0000-4000-8000-000000000001",
            location_id: "10000000-0000-4000-8000-000000000001",
            title: "Anniversary",
            type: "event",
            starts_on: "2026-08-18",
            ends_on: "2026-08-18",
            recurrence: "none",
          },
        ]}
      />,
    );

    const header = screen.getByRole("columnheader", {
      name: "Tue Aug 18",
    });
    expect(header.getAttribute("data-closed")).toBe("true");
    expect(header.getAttribute("data-important")).toBe("true");
    expect(header.getAttribute("data-schedule-day-header-content")).toBe(
      "true",
    );
    expect(screen.getByLabelText("Important: event: Anniversary")).toBeTruthy();
  });

  it("uses the reference slate cue for today's date number", () => {
    render(<DayHeaderCell date="2026-08-18" isToday />);

    const header = screen.getByRole("columnheader", {
      name: "Tue Aug 18",
    });
    const dateNumber = screen.getByText("18");

    expect(header.getAttribute("data-today")).toBe("true");
    expect(header.getAttribute("data-schedule-day-header-content")).toBe(
      "true",
    );
    expect(dateNumber.className).toContain("schedule-day-header-date");
  });

  it("renders partial closed shift type counts below the day number", () => {
    render(
      <DayHeaderCell
        date="2026-08-18"
        partialClosedShiftTypeIds={[
          "44444444-4444-4444-8444-444444444441",
          "44444444-4444-4444-8444-444444444442",
          "44444444-4444-4444-8444-444444444441",
        ]}
      />,
    );

    const header = screen.getByRole("columnheader", {
      name: "Tue Aug 18",
    });
    expect(header.getAttribute("data-partial-closed")).toBe("true");
    expect(screen.getByLabelText("Closed for 2 shift types").textContent).toBe(
      "⊘2",
    );
  });
});
