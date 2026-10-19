import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ScheduleGroupLabelRow,
  SchedulePresetRows,
} from "./SchedulePresetRows";

const job: ScheduleReadModel["jobs"][number] = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Server",
  color: "#2563eb",
  
  department_id: null,
  system_key: null,
};

const shiftTypes: ScheduleReadModel["shift_types"] = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Dinner",
    color: "#7c3aed",
    sort_order: 0,
    default_start_time: "16:00",
    default_end_time: "22:00",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Clock off",
    color: "#0f766e",
    sort_order: 1,
    default_start_time: null,
    default_end_time: null,
  },
];

const locations = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Main Dining",
    timezone: "America/Los_Angeles",
    sort_order: 0,
    publication_status: "published" as const,
    published_at: null,
    sourceIds: ["44444444-4444-4444-8444-444444444444"],
  },
];

const multiLocations = [
  locations[0]!,
  {
    ...locations[0]!,
    id: "55555555-5555-4555-8555-555555555555",
    name: "Patio",
    sort_order: 1,
    publication_status: "unpublished" as const,
    sourceIds: ["55555555-5555-4555-8555-555555555555"],
  },
] as const;

const unifiedLocations = [
  {
    ...locations[0]!,
    id: "unified",
    name: "Main Dining + Patio",
    sourceIds: [
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ],
    sourceNames: [
      { id: "44444444-4444-4444-8444-444444444444", name: "Main Dining" },
      { id: "55555555-5555-4555-8555-555555555555", name: "Patio" },
    ],
  },
];

describe("SchedulePresetRows", () => {
  it("continues location boundaries through preset rows", () => {
    render(
      <div role="grid">
        <SchedulePresetRows
          job={job}
          shiftTypes={shiftTypes}
          locations={multiLocations}
          days={["2026-08-17", "2026-08-18"]}
          editing
          showTotalHours={false}
          onPresetCreate={vi.fn()}
        />
      </div>,
    );

    const cells = Array.from(
      document.querySelectorAll<HTMLElement>("[data-schedule-preset-cell]"),
    );
    expect(
      cells.map((cell) => cell.getAttribute("data-location-boundary")),
    ).toEqual([null, null, "start", null]);
    expect(
      cells.map((cell) =>
        cell.getAttribute("data-schedule-preset-location-end"),
      ),
    ).toEqual([null, "true", null, "true"]);
  });

  it("renders preset chips with the reference data attributes and opens create target", () => {
    const onPresetCreate = vi.fn();
    const onPresetPointerDown = vi.fn();
    const onPresetMouseDown = vi.fn();

    render(
      <div role="grid">
        <SchedulePresetRows
          job={job}
          shiftTypes={shiftTypes}
          locations={locations}
          days={["2026-08-17", "2026-08-18"]}
          editing
          showTotalHours
          onPresetCreate={onPresetCreate}
          onPresetPointerDown={onPresetPointerDown}
          onPresetMouseDown={onPresetMouseDown}
        />
      </div>,
    );

    const dinner = screen.getByRole("button", { name: "Dinner-Server" });
    const dinnerCell = dinner.parentElement as HTMLElement;
    const presetChips = document.querySelectorAll(
      "[data-schedule-preset-chip='true']",
    );
    expect(presetChips).toHaveLength(2);
    expect(
      screen.getByTestId(`schedule-employee-group-${job.id}`).textContent,
    ).toContain("Server");
    expect(dinner.getAttribute("data-schedule-preset-chip")).toBe("true");
    expect(dinner.getAttribute("data-job-id")).toBe(job.id);
    expect(dinner.getAttribute("data-shift-type-id")).toBe(shiftTypes[0]!.id);
    expect(dinner.getAttribute("data-preset-has-default-times")).toBe("true");
    expect(dinner.getAttribute("data-preset-clock-off")).toBe("false");
    expect(dinner.style.color).toBe("rgb(0, 0, 0)");
    expect(
      dinner.style.getPropertyValue("--schedule-preset-chip-hover-glow"),
    ).toBe("color-mix(in srgb, #7c3aed 52%, #000)");
    expect(
      dinner.style.getPropertyValue("--schedule-preset-chip-hover-glow-soft"),
    ).toBe("color-mix(in srgb, #7c3aed 24%, transparent)");
    expect(dinnerCell.getAttribute("data-schedule-preset-cell")).toBe("true");
    expect(dinnerCell.style.borderRightWidth).toBe("");

    fireEvent.pointerDown(dinner);
    expect(onPresetPointerDown).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: job.id,
        shiftTypeId: shiftTypes[0]!.id,
        label: "Dinner-Server",
      }),
      expect.anything(),
    );

    fireEvent.click(dinner, { clientX: 120, clientY: 160 });
    expect(onPresetCreate).toHaveBeenCalledWith({
      locationId: locations[0]!.id,
      employeeId: null,
      date: "2026-08-17",
      point: { x: 120, y: 160 },
      preset: {
        jobId: job.id,
        shiftTypeId: shiftTypes[0]!.id,
        startTime: "16:00",
        endTime: "22:00",
      },
    });

    const clockOff = screen.getByRole("button", { name: "Clock off-Server" });
    const clockOffCell = clockOff.parentElement as HTMLElement;
    expect(clockOff.getAttribute("data-preset-has-default-times")).toBe(
      "false",
    );
    expect(clockOff.getAttribute("data-preset-clock-off")).toBe("true");
    expect(clockOff.style.width).toBe("100%");
    expect(clockOff.style.height).toBe("calc(100% - 4px)");
    expect(
      clockOff.style.getPropertyValue("--schedule-preset-chip-border"),
    ).toBe("#0f766e");
    expect(
      clockOffCell.getAttribute("data-schedule-role-location-seam"),
    ).toBeNull();
    expect(clockOffCell.style.borderRightWidth).toBe("");
    expect(
      document.querySelector("[data-schedule-role-employee-seam='true']"),
    ).toBeTruthy();
    expect(document.querySelector(".schedule-preset-total-cell")).toBeTruthy();
  });

  // PRESET-SAAT (S-183): dragging a chip to another day drops it there; the
  // click the browser sends when the press ends is not a second create on the
  // chip's own day.
  it("does not create on the chip's day when a press ends far away after a drag", () => {
    const onPresetCreate = vi.fn();
    render(
      <div role="grid">
        <SchedulePresetRows
          job={job}
          shiftTypes={shiftTypes.slice(0, 1)}
          locations={locations}
          days={["2026-08-17"]}
          editing
          showTotalHours={false}
          onPresetCreate={onPresetCreate}
          onPresetPointerDown={vi.fn()}
        />
      </div>,
    );
    const dinner = screen.getByRole("button", { name: "Dinner-Server" });
    // jsdom has no PointerEvent: the press carries its point by hand.
    const press = (x: number, y: number) => {
      const event = new Event("pointerdown", { bubbles: true, cancelable: true });
      Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y }, button: { value: 0 }, pointerId: { value: 1 } });
      fireEvent(dinner, event);
    };
    press(20, 20);
    fireEvent.click(dinner, { clientX: 340, clientY: 220 });
    expect(onPresetCreate).not.toHaveBeenCalled();
    press(20, 20);
    fireEvent.click(dinner, { clientX: 22, clientY: 21 });
    expect(onPresetCreate).toHaveBeenCalledTimes(1);
  });

  it("disables preset chips outside editing mode", () => {
    const onPresetCreate = vi.fn();

    render(
      <div role="grid">
        <SchedulePresetRows
          job={job}
          shiftTypes={shiftTypes.slice(0, 1)}
          locations={locations}
          days={["2026-08-17"]}
          editing={false}
          showTotalHours={false}
          onPresetCreate={onPresetCreate}
        />
      </div>,
    );

    const dinner = screen.getByRole("button", { name: "Dinner-Server" });
    expect(dinner).toHaveProperty("disabled", true);
    fireEvent.click(dinner);
    expect(onPresetCreate).not.toHaveBeenCalled();
  });

  it("uses the active source location when unified preset cells create shifts", () => {
    const onPresetCreate = vi.fn();

    render(
      <div role="grid">
        <SchedulePresetRows
          job={job}
          shiftTypes={shiftTypes.slice(0, 1)}
          locations={unifiedLocations}
          activeInteractionShiftLocationId="55555555-5555-4555-8555-555555555555"
          days={["2026-08-17"]}
          editing
          showTotalHours={false}
          onPresetCreate={onPresetCreate}
        />
      </div>,
    );

    const dinner = screen.getByRole("button", { name: "Dinner-Server" });
    expect(dinner.parentElement?.getAttribute("data-location-id")).toBe(
      "55555555-5555-4555-8555-555555555555",
    );
    expect(dinner.parentElement?.getAttribute("data-display-location-id")).toBe(
      "unified",
    );

    fireEvent.click(dinner);
    expect(onPresetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "55555555-5555-4555-8555-555555555555",
      }),
    );
  });
});

describe("ScheduleGroupLabelRow", () => {
  it("renders the group separator row with stable boundary cells", () => {
    render(
      <div role="grid">
        <ScheduleGroupLabelRow
          label="No job/position"
          groupId="none"
          color={null}
          locations={locations}
          days={["2026-08-17"]}
          showTotalHours
        />
      </div>,
    );

    expect(screen.getByRole("rowheader").textContent).toContain(
      "No job/position",
    );
    const roleEmployeeSeam = document.querySelector<HTMLElement>(
      "[data-schedule-role-employee-seam='true']",
    );
    expect(roleEmployeeSeam).toBeTruthy();
    expect(roleEmployeeSeam?.style.right).toBe("-1px");
    expect(roleEmployeeSeam?.style.width).toBe("3px");
    expect(document.querySelector(".schedule-preset-total-cell")).toBeTruthy();
  });

  it("continues location boundaries through group-label rows", () => {
    render(
      <div role="grid">
        <ScheduleGroupLabelRow
          label="No job/position"
          groupId="none"
          color={null}
          locations={multiLocations}
          days={["2026-08-17", "2026-08-18"]}
          showTotalHours={false}
        />
      </div>,
    );

    const cells = Array.from(
      document.querySelectorAll<HTMLElement>(".schedule-group-label-cell"),
    );
    expect(
      cells.map((cell) => cell.getAttribute("data-location-boundary")),
    ).toEqual([null, null, "start", null]);
    expect(
      cells.map((cell) =>
        cell.getAttribute("data-schedule-preset-location-end"),
      ),
    ).toEqual([null, "true", null, "true"]);
  });
});
