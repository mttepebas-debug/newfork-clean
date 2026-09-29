import type {
  ScheduleEmployee,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleGridBody } from "./ScheduleGridBody";

vi.mock("./ScheduleRow", () => ({
  ScheduleRow: ({ employee }: { employee: ScheduleEmployee | null }) => (
    <div data-testid="schedule-row">
      {employee ? employee.display_name : "Unassigned"}
    </div>
  ),
}));

vi.mock("./SchedulePresetRows", () => ({
  SchedulePresetRows: ({
    job,
    shiftTypes,
  }: {
    job: ScheduleReadModel["jobs"][number];
    shiftTypes: ScheduleReadModel["shift_types"];
  }) => (
    <div data-testid="schedule-preset-row">
      {job.name}:{shiftTypes.map((item) => item.name).join(",")}
    </div>
  ),
  ScheduleGroupLabelRow: ({ label }: { label: string }) => (
    <div data-testid="schedule-group-row">{label}</div>
  ),
}));

vi.mock("./ScheduleFillerRow", () => ({
  ScheduleFillerRow: () => <div data-testid="schedule-filler-row" />,
}));

vi.mock("./ScheduleTotalsRow", () => ({
  ScheduleTotalsRow: () => <div data-testid="schedule-totals-row" />,
}));

const employee = {
  id: "emp-1",
  display_name: "Alex Morgan",
  employee_code: "A100",
} as ScheduleEmployee;

const job = {
  id: "job-1",
  name: "Server",
  color: "#2563eb",
  sort_order: 0,
  department_id: null,
} as ScheduleReadModel["jobs"][number];

const model = {
  shifts: [],
  jobs: [job],
  shift_types: [
    {
      id: "type-1",
      name: "Dinner",
      color: "#7c3aed",
      sort_order: 0,
      default_start_time: "16:00",
      default_end_time: "22:00",
    },
    {
      id: "type-hidden",
      name: "Hidden",
      color: "#0f766e",
      sort_order: 1,
      default_start_time: "10:00",
      default_end_time: "14:00",
    },
  ],
  closures: [],
} as unknown as ScheduleReadModel;

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
  onPresetCreate: vi.fn(),
  onSelect: vi.fn(),
  onShiftContextMenu: vi.fn(),
  onShiftMouseDown: vi.fn(),
  onShiftPointerDown: vi.fn(),
};

function renderBody(
  overrides: Partial<Parameters<typeof ScheduleGridBody>[0]> = {},
) {
  return render(
    <ScheduleGridBody
      activeDragOverCell={null}
      cellStateByKey={new Map()}
      clipboard={null}
      days={["2026-08-17"]}
      draggedShiftId={null}
      dragState={null}
      editing
      employeeRowGroups={[{ job, employees: [employee] }]}
      fillerRowCount={1}
      focusedShiftId={null}
      locations={[location]}
      model={model}
      pasteArmed={false}
      rows={[employee]}
      selectedIds={[]}
      showClockTimes
      timeFormat="12h"
      showEmployeeGroupHeaders
      showEmployeeGroups
      showJobColorDot
      showLocationInBadge={false}
      showShiftLabels
      showShiftType
      showShiftTypePresets
      showTotalHours
      showUnassignedRow
      unassignedFrozen
      visibleShifts={[]}
      visibleShiftTypes={model.shift_types.slice(0, 1)}
      {...handlers}
      {...overrides}
    />,
  );
}

describe("ScheduleGridBody", () => {
  it("renders unassigned, grouped preset rows, employees, filler rows, and totals", () => {
    renderBody();

    expect(screen.getByText("Unassigned")).toBeTruthy();
    expect(screen.getByText("Alex Morgan")).toBeTruthy();
    expect(screen.getByTestId("schedule-preset-row").textContent).toBe(
      "Server:Dinner",
    );
    expect(screen.getAllByTestId("schedule-filler-row")).toHaveLength(1);
    expect(screen.getByTestId("schedule-totals-row")).toBeTruthy();
  });

  it("renders only the filler row when there are no employees", () => {
    renderBody({
      employeeRowGroups: [],
      rows: [],
      showEmployeeGroups: false,
      showUnassignedRow: false,
      showTotalHours: false,
    });

    expect(screen.queryByText("No employees")).toBeNull();
    expect(document.querySelectorAll(".schedule-cell")).toHaveLength(0);
    expect(screen.getAllByTestId("schedule-filler-row")).toHaveLength(1);
    expect(screen.queryByTestId("schedule-totals-row")).toBeNull();
  });
});
