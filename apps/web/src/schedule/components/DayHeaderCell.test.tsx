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
          title: "Private event",
          is_all_day: true,
          kind: "closed",
          window_start: null,
          window_end: null,
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
    expect(screen.getByLabelText("Important: Event: Anniversary")).toBeTruthy();
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

  it("shows a location's short hours and closed span below the day number (EKRAN-08)", () => {
    const day = {
      id: "60000000-0000-4000-8000-000000000002",
      location_id: "10000000-0000-4000-8000-000000000001",
      closed_date: "2026-12-24",
      is_all_day: false,
    };
    render(
      <DayHeaderCell
        date="2026-12-24"
        partialClosures={[
          { ...day, title: "Christmas Eve", kind: "short", window_start: "10:00", window_end: "15:00" },
          { ...day, title: "Inventory", kind: "closed", window_start: "17:00", window_end: "24:00" },
        ]}
      />,
    );

    const header = screen.getByRole("columnheader", { name: "Thu Dec 24" });
    expect(header.getAttribute("data-partial-closed")).toBe("true");
    expect(header.getAttribute("data-closed")).toBe("false");
    const hours = screen.getByLabelText("Short hours 10a–3p: Christmas Eve · Closed 5p–12a: Inventory");
    expect(hours.textContent).toBe("10a–3p +1");
  });

  it("shows the hours in the workspace's 24-hour clock", () => {
    render(
      <DayHeaderCell
        date="2026-12-24"
        timeFormat="24h"
        partialClosures={[
          {
            id: "60000000-0000-4000-8000-000000000003",
            location_id: "10000000-0000-4000-8000-000000000001",
            closed_date: "2026-12-24",
            title: "Christmas Eve",
            is_all_day: false,
            kind: "short",
            window_start: "10:00",
            window_end: "15:00",
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Short hours 10:00–15:00: Christmas Eve").textContent).toBe("10:00–15:00");
  });
});
