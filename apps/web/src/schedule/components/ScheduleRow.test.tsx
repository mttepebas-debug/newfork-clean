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
  it("stacks matching unassigned shift badges and updates the remaining count while dragging one", () => {
    const openShift = {
      ...shift,
      id: "open-1",
      employee_id: null,
    };
    const matchingOpenShift = {
      ...openShift,
      id: "open-2",
    };
    const differentOpenShift = {
      ...openShift,
      id: "open-3",
      end_time: "23:00",
    };
    const onShiftPointerDown = vi.fn();
    const { container, rerender } = renderRow({
      employee: null,
      shifts: [openShift, matchingOpenShift, differentOpenShift],
      totalShifts: [openShift, matchingOpenShift, differentOpenShift],
      selectedIds: [],
      onShiftPointerDown,
    });

    expect(screen.getByText("3 open shifts")).toBeTruthy();
    const stackedBadges = container.querySelectorAll(
      ".schedule-shift-badge[data-shift-badge='true']:not([data-ghost='true'])",
    );
    expect(stackedBadges).toHaveLength(2);
    expect(stackedBadges[0]?.getAttribute("data-stack-count")).toBe("2");
    expect(stackedBadges[0]?.textContent).toContain("x2");

    fireEvent.pointerDown(stackedBadges[0]!, {
      pointerId: 1,
      button: 0,
      buttons: 1,
      clientX: 12,
      clientY: 18,
    });
    expect(onShiftPointerDown).toHaveBeenCalledWith(
      "open-1",
      expect.any(Object),
    );

    rerender(
      <div role="grid">
        <ScheduleRow
          employee={null}
          shifts={[openShift, matchingOpenShift, differentOpenShift]}
          totalShifts={[openShift, matchingOpenShift, differentOpenShift]}
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
          draggedShiftId="open-1"
          dragOverCell={null}
          dragState={{
            activeShiftId: "open-1",
            label: "Server, 4:00 PM - 10:00 PM",
            pointerX: 24,
            pointerY: 32,
            previewWidth: 126,
            previewHeight: 58,
            targetKey: null,
            targetLocationId: null,
            targetDate: null,
            targetStatus: null,
            reason: null,
            copy: false,
          }}
          {...handlers}
        />
      </div>,
    );

    expect(screen.getByText("2 open shifts")).toBeTruthy();
    const remainingBadges = container.querySelectorAll(
      ".schedule-shift-badge[data-shift-badge='true']:not([data-ghost='true'])",
    );
    expect(remainingBadges).toHaveLength(2);
    expect(remainingBadges[0]?.getAttribute("data-stack-count")).toBeNull();
    expect(remainingBadges[0]?.textContent).not.toContain("x2");
  });

  it("places the unified add-shift action after existing shift badges", () => {
    renderRow({ shifts: [shift], totalShifts: [shift], selectedIds: [] });

    const cell = screen.getByTestId("schedule-cell-body");
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    const addAnother = screen.getByRole("button", {
      name: "Add shift for Alex Rivera at Main Dining on 2026-08-17",
    });
    const children = Array.from(cell.children);

    expect(children.indexOf(badge)).toBeLessThan(children.indexOf(addAnother));
  });

  it("renders add-shift only while editing without a fixed edit row floor", () => {
    const { rerender } = renderRow({
      editing: false,
      shifts: [shift],
      totalShifts: [shift],
      selectedIds: [],
    });

    expect(
      screen.queryByRole("button", {
        name: "Add shift for Alex Rivera at Main Dining on 2026-08-17",
      }),
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
      screen.getByRole("button", {
        name: "Add shift for Alex Rivera at Main Dining on 2026-08-17",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByTestId("schedule-sticky-employee-seam")
        .style.getPropertyValue("--schedule-row-min-height"),
    ).toBe("44px");
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

  it("marks the active create editor cell without inventing current-badge focus", () => {
    renderRow({
      activeEditorTarget: {
        locationId: "loc-1",
        employeeId: "emp-1",
        date: "2026-08-17",
        shiftId: null,
      },
      shifts: [shift],
      totalShifts: [shift],
      selectedIds: [],
    });

    const cell = screen.getByTestId("schedule-cell-body");
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });

    expect(cell.getAttribute("data-shift-editor-active-cell")).toBe("true");
    expect(badge.getAttribute("data-focused")).toBe("false");
    expect(badge.getAttribute("data-current")).toBe("false");
  });

  it("marks the active edit editor badge without highlighting the whole cell", () => {
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

    expect(cell.getAttribute("data-shift-editor-active-cell")).toBeNull();
    expect(badge.getAttribute("data-focused")).toBe("true");
    expect(badge.getAttribute("data-current")).toBe("true");
  });

  it("clears selection from a blank editable cell body without opening create", () => {
    const onClearSelection = vi.fn();
    const onCreate = vi.fn();
    renderRow({ onClearSelection, onCreate });

    const cell = screen.getByTestId("schedule-cell-body");
    expect(cell.getAttribute("role")).toBe("gridcell");
    expect(cell.getAttribute("tabindex")).toBeNull();

    fireEvent.pointerDown(cell);
    fireEvent.click(cell);

    expect(onClearSelection).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("opens create only from the add affordance, not cell keyboard activation", () => {
    const onCreate = vi.fn();
    renderRow({ onCreate, selectedIds: [] });

    const cell = screen.getByTestId("schedule-cell-body");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Add shift for Alex Rivera at Main Dining on 2026-08-17",
      }),
      { clientX: 120, clientY: 160 },
    );

    expect(onCreate).toHaveBeenCalledWith("loc-1", "emp-1", "2026-08-17", {
      x: 120,
      y: 160,
    });

    onCreate.mockClear();
    fireEvent.keyDown(cell, { key: "Enter" });

    expect(onCreate).not.toHaveBeenCalled();
  });

  it("clears selection from the full-cell add affordance and still opens create", () => {
    const onClearSelection = vi.fn();
    const onCreate = vi.fn();
    renderRow({ onClearSelection, onCreate, selectedIds: ["shift-1"] });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add shift for Alex Rivera at Main Dining on 2026-08-17",
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

    const cell = screen.getByTestId("schedule-cell-body");
    expect(
      screen.getByRole("button", {
        name: "Add shift for Alex Rivera at Main Dining on 2026-08-17",
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

    const cell = screen.getByTestId("schedule-cell-body");
    fireEvent.doubleClick(cell, { clientX: 210, clientY: 90 });

    expect(onCreate).not.toHaveBeenCalled();
  });
});
