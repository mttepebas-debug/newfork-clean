import type {
  ScheduleEditSession,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleGrid } from "./ScheduleGrid";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const locationId = "11111111-1111-4111-8111-111111111111";
const jobId = "33333333-3333-4333-8333-333333333333";
const shiftTypeId = "44444444-4444-4444-8444-444444444444";
const employeeId = "55555555-5555-4555-8555-555555555555";

function scheduleModel(
  overrides: Partial<ScheduleReadModel> = {},
): ScheduleReadModel {
  return {
    workspace_id: workspaceId,
    week_start: "2026-08-17",
    week_start_day: "monday",
    settings: { time_format: "12h" },
    locations: [
      {
        id: locationId,
        name: "Main Dining",
        timezone: "America/Los_Angeles",
        sort_order: 0,
        publication_status: "published",
        published_at: "2026-08-17T12:00:00Z",
      },
    ],
    departments: [],
    jobs: [
      {
        id: jobId,
        department_id: null,
        name: "Server",
        color: "#2563EB",
        sort_order: 0,
      },
    ],
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
        location_ids: [locationId],
        job_ids: [jobId],
        primary_job_id: jobId,
        availability: null,
      },
    ],
    shifts: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        location_id: locationId,
        employee_id: employeeId,
        job_id: jobId,
        shift_type_id: shiftTypeId,
        scheduled_date: "2026-08-17",
        start_time: "16:00",
        end_time: "22:30",
        crosses_midnight: false,
        unpaid_break_minutes: 0,
        hide_time_on_badge: false,
        label_ids: [],
        label_names: [],
        note: "",
        warning_codes: [],
      },
    ],
    closures: [],
    important_dates: [],
    ...overrides,
  };
}

function editSession(model: ScheduleReadModel): ScheduleEditSession {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    workspace_id: model.workspace_id,
    week_start: model.week_start,
    source_kind: "published",
    source_draft_id: null,
    source_revision: 1,
    holder_user_id: "88888888-8888-4888-8888-888888888888",
    holder_name: "Development Owner",
    revision: 1,
    dirty: false,
    last_heartbeat: "2026-08-17T12:00:00Z",
    expires_at: "2026-08-17T12:04:00Z",
    shifts: model.shifts.map((shift) => ({
      ...shift,
      revision: 1,
    })),
  };
}

function renderGrid(
  overrides: Partial<Parameters<typeof ScheduleGrid>[0]> = {},
) {
  const model = scheduleModel();
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
      model={model}
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
      unassignedFrozen
      showJobColorDot
      showRoleSeparators
      showPresetShiftBadges
      useDefaultTimesForScheduling={false}
      employeeSortMode="byJob"
      session={editSession(model)}
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

describe("ScheduleGrid", () => {
  it("renders the no-location state through the schedule state component", () => {
    renderGrid({
      model: scheduleModel({ locations: [] }),
      session: null,
    });

    expect(screen.getByRole("status").textContent).toContain(
      "No locations match",
    );
  });

  it("renders the editable grid shell and preset shift badges in job sort mode", () => {
    const { container } = renderGrid();

    expect(
      screen.getByRole("grid", { name: "Weekly editable schedule" }),
    ).toBeTruthy();
    const presetBadges = screen.getAllByRole("button", {
      name: "Dinner-Server",
    });
    expect(presetBadges.length).toBeGreaterThan(0);
    expect(presetBadges[0]?.getAttribute("data-schedule-preset-chip")).toBe(
      "true",
    );
    expect(presetBadges[0]?.getAttribute("data-job-id")).toBe(jobId);
    expect(presetBadges[0]?.getAttribute("data-shift-type-id")).toBe(
      shiftTypeId,
    );
    expect(
      container.querySelector("[data-schedule-role-employee-seam='true']"),
    ).toBeTruthy();
    expect(
      container.querySelector("[data-schedule-role-location-seam]"),
    ).toBeNull();
  });

  it("renders preset shift badges per visible location in real job separators only", () => {
    const secondLocationId = "99999999-9999-4999-8999-999999999999";
    const noRoleEmployeeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const model = scheduleModel({
      locations: [
        ...scheduleModel().locations,
        {
          id: secondLocationId,
          name: "Patio",
          timezone: "America/Los_Angeles",
          sort_order: 1,
          publication_status: "unpublished",
          published_at: null,
        },
      ],
      shift_types: [
        ...scheduleModel().shift_types,
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "Lunch",
          color: "#F97316",
          sort_order: 1,
          default_start_time: "11:00",
          default_end_time: "15:00",
        },
      ],
      employees: [
        ...scheduleModel().employees,
        {
          id: noRoleEmployeeId,
          employee_code: "NF-002",
          display_name: "No Role",
          location_ids: [secondLocationId],
          job_ids: [],
          primary_job_id: null,
          availability: null,
        },
      ],
    });
    const { container } = renderGrid({
      model,
      session: editSession(model),
    });

    expect(screen.getAllByRole("button", { name: "Dinner-Server" })).toHaveLength(
      2,
    );
    expect(screen.getAllByRole("button", { name: "Lunch-Server" })).toHaveLength(
      2,
    );
    expect(
      screen.queryByRole("button", { name: "Dinner-No job/position" }),
    ).toBeNull();
    expect(
      screen.getByTestId(`schedule-employee-group-${jobId}`).textContent,
    ).toContain("Server");
    expect(
      container.querySelector("[data-schedule-employee-group='none']")
        ?.textContent,
    ).toContain("No job/position");

    expect(
      container.querySelector("[data-schedule-role-location-seam]"),
    ).toBeNull();
  });

  it("hides preset shift badges when role separators are disabled", () => {
    const { container } = renderGrid({ showRoleSeparators: false });

    expect(
      container.querySelector("[data-schedule-preset-chip='true']"),
    ).toBeNull();
  });

  it("widens day columns when preset badge measurement needs more space", async () => {
    const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollWidth",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get(this: HTMLElement) {
        if (
          this.getAttribute("data-schedule-badge-width-measure") === "true" &&
          this.getAttribute("data-measure-label") === "Dinner-Server"
        ) {
          return 260;
        }
        return 0;
      },
    });

    try {
      renderGrid({ model: scheduleModel({ shifts: [] }) });

      await waitFor(() =>
        expect(
          screen
            .getByRole("grid", { name: "Weekly editable schedule" })
            .style.getPropertyValue("--schedule-day-column-min"),
        ).toBe("273px"),
      );

      const presetBadge = screen.getByRole("button", {
        name: "Dinner-Server",
      });
      expect(presetBadge.getAttribute("data-schedule-preset-chip")).toBe(
        "true",
      );
      expect(presetBadge.style.width).toBe("100%");
      expect(presetBadge.style.height).toBe("calc(100% - 4px)");
      expect(presetBadge.className).toBe("schedule-preset-chip");
    } finally {
      if (scrollWidthDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollWidth",
          scrollWidthDescriptor,
        );
      } else {
        delete (HTMLElement.prototype as unknown as { scrollWidth?: number })
          .scrollWidth;
      }
    }
  });
});
