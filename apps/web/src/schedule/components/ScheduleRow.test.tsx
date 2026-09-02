import type {
  ScheduleEmployee,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleRow } from "./ScheduleRow";

const location = {
  id: "loc-1",
  name: "Main Dining",
  timezone: "America/Los_Angeles",
  sort_order: 0,
  publication_status: "published" as const,
  published_at: null,
  sourceIds: ["loc-1"],
  sourceNames: [{ id: "loc-1", name: "Main Dining" }],
};

const employee: ScheduleEmployee = {
  id: "emp-1",
  employee_code: "NF-001",
  display_name: "Alex Rivera",
  location_ids: ["loc-1"],
  job_ids: ["job-1"],
  primary_job_id: "job-1",
  availability: null,
};

const job: ScheduleReadModel["jobs"][number] = {
  id: "job-1",
  name: "Server",
  color: "#2563eb",
  sort_order: 0,
  department_id: null,
};

const shiftType: ScheduleReadModel["shift_types"][number] = {
  id: "type-1",
  name: "Dinner",
  color: "#7c3aed",
  sort_order: 0,
  default_start_time: "16:00",
  default_end_time: "22:00",
};

const shift: ScheduleShift = {
  id: "shift-1",
  location_id: "loc-1",
  employee_id: "emp-1",
  job_id: "job-1",
  shift_type_id: "type-1",
  scheduled_date: "2026-08-17",
  start_time: "16:00",
  end_time: "22:00",
  crosses_midnight: false,
  unpaid_break_minutes: 0,
  hide_time_on_badge: false,
  label_ids: [],
  label_names: [],
  note: "",
  warning_codes: [],
};

const handlers = {
  onCellContextMenu: vi.fn(),
  onClearSelection: vi.fn(),
  onCopy: vi.fn(),
  onCreate: vi.fn(),
  onDragOverCell: vi.fn(),
  onEdit: vi.fn(),
  onFocusShift: vi.fn(),
  onOpenEmployeeCard: vi.fn(),
  onPaste: vi.fn(),
  onSelect: vi.fn(),
  onShiftContextMenu: vi.fn(),
  onShiftMouseDown: vi.fn(),
  onShiftPointerDown: vi.fn(),
};

function renderRow(overrides: Partial<Parameters<typeof ScheduleRow>[0]> = {}) {
  const props: Parameters<typeof ScheduleRow>[0] = {
    employee,
    shifts: [],
    totalShifts: [],
    locations: [location],
    activeInteractionShiftLocationId: null,
    days: ["2026-08-17"],
    jobs: [job],
    shiftTypes: [shiftType],
    closures: [],
    cellStateByKey: new Map(),
    editing: true,
    showShiftType: true,
    showShiftLabels: true,
    showClockTimes: true,
    timeFormat: "12h",
    showTotalHours: true,
    showJobColorDot: true,
    showLocationInBadge: false,
    unassignedFrozen: false,
    selectedIds: ["shift-1"],
    focusedShiftId: null,
    clipboard: null,
    pasteArmed: false,
    draggedShiftId: null,
    dragOverCell: null,
    dragState: null,
    ...handlers,
    ...overrides,
  };
  return render(
    <div role="grid">
      <ScheduleRow {...props} />
    </div>,
  );
}

describe("ScheduleRow blank-cell interactions", () => {
  it("places the add-another action after existing shift badges", () => {
    renderRow({ shifts: [shift], totalShifts: [shift], selectedIds: [] });

    const cell = screen.getByTestId("schedule-cell-body");
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    const addAnother = screen.getByRole("button", {
      name: "Add another shift",
    });
    const children = Array.from(cell.children);

    expect(children.indexOf(badge)).toBeLessThan(children.indexOf(addAnother));
  });

  it("reserves add-shift row height only while editing", () => {
    const { rerender } = renderRow({
      editing: false,
      shifts: [shift],
      totalShifts: [shift],
      selectedIds: [],
    });

    expect(
      screen.queryByRole("button", { name: "Add another shift" }),
    ).toBeNull();
    expect(
      screen
        .getByTestId("schedule-sticky-employee-seam")
        .style.getPropertyValue("--schedule-row-min-height"),
    ).toBe("44px");

    rerender(
      <div role="grid">
        <ScheduleRow
          employee={employee}
          shifts={[shift]}
          totalShifts={[shift]}
          locations={[location]}
          activeInteractionShiftLocationId={null}
          days={["2026-08-17"]}
          jobs={[job]}
          shiftTypes={[shiftType]}
          closures={[]}
          cellStateByKey={new Map()}
          editing
          showShiftType
          showShiftLabels
          showClockTimes
          timeFormat="12h"
          showTotalHours
          showJobColorDot
          showLocationInBadge={false}
          unassignedFrozen={false}
          selectedIds={[]}
          focusedShiftId={null}
          clipboard={null}
          pasteArmed={false}
          draggedShiftId={null}
          dragOverCell={null}
          dragState={null}
          {...handlers}
        />
      </div>,
    );

    expect(
      screen.getByRole("button", { name: "Add another shift" }),
    ).toBeTruthy();
    expect(
      screen
        .getByTestId("schedule-sticky-employee-seam")
        .style.getPropertyValue("--schedule-row-min-height"),
    ).toBe("94px");
  });

  it("marks only the first day of later location groups as a location boundary", () => {
    renderRow({
      locations: [
        location,
        {
          ...location,
          id: "loc-2",
          name: "Patio",
          sort_order: 1,
          publication_status: "unpublished",
          sourceIds: ["loc-2"],
          sourceNames: [{ id: "loc-2", name: "Patio" }],
        },
      ],
      days: ["2026-08-17", "2026-08-18"],
    });

    const cells = screen.getAllByTestId("schedule-cell-body");
    expect(
      cells.map((cell) => cell.getAttribute("data-location-boundary")),
    ).toEqual([null, null, "start", null]);
  });

  it("keeps the active editor cell and shift visually marked", () => {
    renderRow({
      activeEditorTarget: {
        locationId: "loc-1",
        employeeId: "emp-1",
        date: "2026-08-17",
        shiftId: "shift-1",
      },
      shifts: [shift],
      totalShifts: [shift],
      selectedIds: [],
    });

    const cell = screen.getByTestId("schedule-cell-body");
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });

    expect(cell.getAttribute("data-shift-editor-active-cell")).toBe("true");
    expect(badge.getAttribute("data-focused")).toBe("true");
  });

  it("clears selection from a blank editable cell body without opening create", () => {
    const onClearSelection = vi.fn();
    const onCreate = vi.fn();
    renderRow({ onClearSelection, onCreate });

    const cell = screen.getByRole("button", {
      name: "Add shift for Alex Rivera at Main Dining on 2026-08-17",
    });
    expect(cell.getAttribute("data-testid")).toBe("schedule-cell-body");

    fireEvent.pointerDown(cell);
    fireEvent.click(cell);

    expect(onClearSelection).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("opens create only from the add affordance or keyboard activation", () => {
    const onCreate = vi.fn();
    renderRow({ onCreate, selectedIds: [] });

    const cell = screen.getByRole("button", {
      name: "Add shift for Alex Rivera at Main Dining on 2026-08-17",
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Add shift for Alex Rivera on 2026-08-17",
      }),
      { clientX: 120, clientY: 160 },
    );

    expect(onCreate).toHaveBeenCalledWith("loc-1", "emp-1", "2026-08-17", {
      x: 120,
      y: 160,
    });

    onCreate.mockClear();
    fireEvent.keyDown(cell, { key: "Enter" });

    expect(onCreate).toHaveBeenCalledWith(
      "loc-1",
      "emp-1",
      "2026-08-17",
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    );
  });

  it("clears selection from the full-cell add affordance and still opens create", () => {
    const onClearSelection = vi.fn();
    const onCreate = vi.fn();
    renderRow({ onClearSelection, onCreate, selectedIds: ["shift-1"] });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add shift for Alex Rivera on 2026-08-17",
      }),
      { clientX: 120, clientY: 160 },
    );

    expect(onClearSelection).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith(
      "loc-1",
      "emp-1",
      "2026-08-17",
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    );
  });

  it("pastes from the blank cell body while sticky paste mode is armed", () => {
    const onPaste = vi.fn();
    const onCreate = vi.fn();
    renderRow({
      clipboard: {
        ...shift,
        source_employee_id: shift.employee_id,
        source_location_id: shift.location_id,
      },
      onCreate,
      onPaste,
      pasteArmed: true,
      selectedIds: [],
    });

    const cell = screen.getByRole("button", {
      name: "Add shift for Alex Rivera at Main Dining on 2026-08-17",
    });
    expect(
      screen.getByRole("button", {
        name: "Add shift for Alex Rivera on 2026-08-17",
      }).className,
    ).not.toContain("schedule-add-target-pulse");
    expect(screen.queryByTitle("Paste copied shift")).toBeNull();
    fireEvent.click(cell, { clientX: 210, clientY: 90 });

    expect(onPaste).toHaveBeenCalledWith("loc-1", "emp-1", "2026-08-17", {
      x: 210,
      y: 90,
    });
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("does not open the create editor from a double click while sticky paste mode is armed", () => {
    const onPaste = vi.fn();
    const onCreate = vi.fn();
    renderRow({
      clipboard: {
        ...shift,
        source_employee_id: shift.employee_id,
        source_location_id: shift.location_id,
      },
      onCreate,
      onPaste,
      pasteArmed: true,
      selectedIds: [],
    });

    const cell = screen.getByRole("button", {
      name: "Add shift for Alex Rivera at Main Dining on 2026-08-17",
    });
    fireEvent.doubleClick(cell, { clientX: 210, clientY: 90 });

    expect(onCreate).not.toHaveBeenCalled();
  });
});
