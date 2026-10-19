import type {
  ScheduleEditSession,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleGrid } from "./ScheduleGrid";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const employeeId = "55555555-5555-4555-8555-555555555555";
const jobId = "33333333-3333-4333-8333-333333333333";
const locationA = "11111111-1111-4111-8111-111111111111";
const locationB = "22222222-2222-4222-8222-222222222222";
const shiftTypeId = "44444444-4444-4444-8444-444444444444";

function shift(overrides: Partial<ScheduleShift> = {}): ScheduleShift {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    location_id: locationA,
    employee_id: employeeId,
    job_id: jobId,
    shift_type_id: shiftTypeId,
    scheduled_date: "2026-08-17",
    start_time: "09:00",
    end_time: "17:00",
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

function model(overrides: Partial<ScheduleReadModel> = {}): ScheduleReadModel {
  return {
    workspace_id: workspaceId,
    week_start: "2026-08-17",
    week_start_day: "monday",
    settings: { time_format: "12h" },
    locations: [
      {
        id: locationA,
        name: "Main Dining",
        timezone: "America/Los_Angeles",
        sort_order: 0,
        publication_status: "published",
        published_at: null,
      },
      {
        id: locationB,
        name: "Patio",
        timezone: "America/Los_Angeles",
        sort_order: 1,
        publication_status: "published",
        published_at: null,
      },
    ],
    departments: [],
    jobs: [
      {
        id: jobId,
        department_id: null,
        system_key: null,
        name: "Server",
        color: "#2563EB",
        
      },
    ],
    referenced_jobs: [],
    referenced_shift_types: [],
    shift_types: [
      {
        id: shiftTypeId,
        name: "Dinner",
        color: "#7C3AED",
        sort_order: 0,
        default_start_time: "16:00",
        default_end_time: "22:00",
      },
    ],
    shift_labels: [],
    employees: [
      {
        id: employeeId,
        employee_code: "NF-001",
        display_name: "Alex Rivera",
        location_ids: [locationA, locationB],
        job_ids: [jobId],
        primary_job_id: jobId,
      },
    ],
    shifts: [shift()],
    closures: [],
    important_dates: [],
    ...overrides,
  };
}

function session(readModel: ScheduleReadModel): ScheduleEditSession {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    workspace_id: readModel.workspace_id,
    week_start: readModel.week_start,
    source_kind: "published",
    source_draft_id: null,
    source_revision: 1,
    holder_user_id: "88888888-8888-4888-8888-888888888888",
    location_ids: [locationA, locationB],
    holder_name: "Development Owner",
    revision: 1,
    dirty: false,
    last_heartbeat: "2026-08-17T12:00:00Z",
    expires_at: "2026-08-17T12:04:00Z",
    shifts: readModel.shifts.map((item) => ({ ...item, revision: 1 })),
  };
}

function renderGrid(
  readModel: ScheduleReadModel,
  overrides: Partial<Parameters<typeof ScheduleGrid>[0]> = {},
) {
  const handlers = {
    onCellContextMenu: vi.fn(),
    onClearSelection: vi.fn(),
    onCopy: vi.fn(),
    onCopyMove: vi.fn(),
    onCreate: vi.fn(),
    onDayHeaderClick: vi.fn(),
    onEdit: vi.fn(),
    onFocusShift: vi.fn(),
    onLocationHeaderClick: vi.fn(),
    onMove: vi.fn(),
    onOpenEmployeeCard: vi.fn(),
    onPaste: vi.fn(),
    onPresetCreate: vi.fn(),
    onSelect: vi.fn(),
    onShiftContextMenu: vi.fn(),
  };

  return render(
    <ScheduleGrid
      model={readModel}
      search={new URLSearchParams()}
      selectedDate="2026-08-17"
      view="week"
      layout="separate"
      hideUnscheduled={false}
      showShiftType
      showShiftLabels
      showClockTimes
      showTotalHours
      showUnassignedShifts
      unassignedFrozen={false}
      showJobColorDot
      showRoleSeparators
      showPresetShiftBadges
      employeeSortMode="byJob"
      session={session(readModel)}
      focusedShiftId={null}
      selectedIds={[]}
      clipboard={null}
      pasteArmed={false}
      organizationName="Meyhouse Jazz"
      organizationLogoUrl={null}
      organizationLogoPlacement={null}
      {...handlers}
      {...overrides}
    />,
  );
}

describe("ScheduleGrid hour totals parity", () => {
  it("does not render total columns or rows when disabled", () => {
    renderGrid(model(), { showTotalHours: false });

    expect(
      document.querySelector("[data-schedule-total-hours-header='true']"),
    ).toBeNull();
    expect(
      document.querySelector("[data-schedule-total-hours-week-cell='true']"),
    ).toBeNull();
  });

  it("renders assigned-only employee, day, and week totals", () => {
    renderGrid(
      model({
        shifts: [
          shift({
            id: "shift-assigned",
            employee_id: employeeId,
            start_time: "09:00",
            end_time: "17:00",
            unpaid_break_minutes: 30,
          }),
          shift({
            id: "shift-open",
            employee_id: null,
            start_time: "18:00",
            end_time: "22:00",
            unpaid_break_minutes: 0,
          }),
        ],
      }),
    );

    expect(
      screen.getByRole("columnheader", { name: "Total hours" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("columnheader", { name: "Total hours" })
        .getAttribute("data-schedule-total-column-cell"),
    ).toBe("true");
    expect(
      screen.getByRole("gridcell", {
        name: "Alex Rivera total hours 7h 30m",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("gridcell", {
        name: "Main Dining Mon, Aug 17 total hours 7h 30m",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("gridcell", { name: "Week total hours 7h 30m" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("gridcell", { name: "Week total hours 7h 30m" })
        .getAttribute("data-schedule-total-column-cell"),
    ).toBe("true");
  });

  it("renders visible versus unfiltered comparison labels when filters hide shifts", () => {
    renderGrid(
      model({
        shifts: [
          shift({
            id: "shift-visible",
            location_id: locationA,
            start_time: "09:00",
            end_time: "13:00",
          }),
          shift({
            id: "shift-filtered",
            location_id: locationB,
            start_time: "14:00",
            end_time: "18:00",
          }),
        ],
      }),
      { search: new URLSearchParams(`locations=${locationA}`) },
    );

    expect(
      screen.getByRole("gridcell", {
        name: "Alex Rivera total hours 3h 30m / 7h",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("gridcell", {
        name: "Week total hours 3h 30m / 7h",
      }),
    ).toBeTruthy();
    expect(
      document.querySelectorAll(
        ".schedule-total-value[data-has-comparison='true']",
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("merges unified locations into one total surface", () => {
    renderGrid(
      model({
        shifts: [
          shift({
            id: "main-shift",
            location_id: locationA,
            start_time: "09:00",
            end_time: "13:00",
            unpaid_break_minutes: 0,
          }),
          shift({
            id: "patio-shift",
            location_id: locationB,
            start_time: "14:00",
            end_time: "18:00",
            unpaid_break_minutes: 0,
          }),
        ],
      }),
      { layout: "unified" },
    );

    expect(
      screen.getByRole("gridcell", {
        name: "Main Dining + Patio Mon, Aug 17 total hours 8h",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("gridcell", { name: "Week total hours 8h" }),
    ).toBeTruthy();
  });
});
