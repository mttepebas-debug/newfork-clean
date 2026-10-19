import type {
  ScheduleEditSession,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
        location_ids: [locationId],
        job_ids: [jobId],
        primary_job_id: jobId,
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
    location_ids: ["11111111-1111-4111-8111-111111111111"],
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
  const availabilityModel = (unavailableDays: readonly number[], withShifts: boolean) => {
    const base = scheduleModel();
    return scheduleModel({
      employees: [{ ...base.employees[0]!, weekly_availability: [{ location_id: locationId, location_name: "Main Dining", timezone: "America/Los_Angeles",
        week_start: base.week_start, status: "ready",
        unavailable_intervals: unavailableDays.map((index) => ({ start_at: `2026-08-${17 + index}T07:00:00Z`, end_at: `2026-08-${18 + index}T07:00:00Z` })),
        employee_intervals: [],
        leave_intervals: [{ start_at: "2026-08-23T07:00:00Z", end_at: "2026-08-24T07:00:00Z" }],
        clock_segments: [{ start_at: "2026-08-10T07:00:00Z", end_at: "2026-08-31T07:00:00Z", offset_seconds: -7 * 3600 }],
        days: Array.from({ length: 7 }, (_, index) => ({ date: `2026-08-${17 + index}`, has_unavailable: unavailableDays.includes(index), all_day: unavailableDays.includes(index) })) }] }],
      shifts: withShifts ? base.shifts.map((shift) => ({ ...shift, warning_codes: ["availability" as const] })) : [],
    });
  };

  it.each([
    [false, false],
    [true, true],
  ])("with editing = %s, the Unassigned row shows = %s, open shifts or not (BL-681, KARARLAR Schedule 2026-10-05)", (editing, rowShows) => {
    const base = scheduleModel();
    const model = scheduleModel({
      shifts: [...base.shifts, { ...base.shifts[0]!, id: "66666666-6666-4666-8666-666666666667", employee_id: null }],
    });
    const { container } = renderGrid({ model, session: editing ? editSession(model) : null });
    expect(container.querySelector(".schedule-employee-cell[data-unassigned='true']") !== null).toBe(rowShows);
  });

  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])("with availability shown = %s and editing = %s, the orange \"!\" shows only while editing with the switch on; red time off stays (KARARLAR Schedule, 2026-10-06)", (showAvailability, editing) => {
    const model = availabilityModel([0], true);
    const { container } = renderGrid({ model, session: editing ? editSession(model) : null, showAvailability });
    expect(container.querySelector(".schedule-availability-mark") !== null).toBe(showAvailability && editing);
    expect(container.querySelector('[data-availability-kind="time_off"]')).not.toBeNull();
  });

  // Mert, 2026-10-10: a cell of full-day approved time off opens no Add shift;
  // a partial day keeps it (the server still refuses any overlapping hours).
  it.each([
    ["the whole day", "2026-08-23T07:00:00Z", "2026-08-24T07:00:00Z", false],
    ["part of the day", "2026-08-23T16:00:00Z", "2026-08-23T20:00:00Z", true],
  ] as const)("time off for %s (%s to %s): Add shift shows = %s", (_label, start_at, end_at, addShows) => {
    const marked = availabilityModel([], false);
    const model = { ...marked, employees: marked.employees.map((employee) => ({ ...employee,
      weekly_availability: employee.weekly_availability?.map((week) => ({ ...week, leave_intervals: [{ start_at, end_at }] })) })) };
    const { container } = renderGrid({ model, session: editSession(model) });
    const cell = container.querySelector('[data-availability-kind="time_off"][data-date="2026-08-23"]');
    expect(cell).not.toBeNull();
    expect(cell!.querySelector("[data-schedule-add-shift-control]") !== null).toBe(addShows);
  });

  // Time off belongs to the person, not a location (KARARLAR §1.1): the read
  // model only projects the locations they work at, yet another location's
  // section must not offer the day either.
  it("full-day time off opens no Add shift in a location the person is not assigned to", () => {
    const patioId = "11111111-1111-4111-8111-111111111112";
    const marked = availabilityModel([], false);
    const model = { ...marked, locations: [...marked.locations, { ...marked.locations[0]!, id: patioId, name: "Patio", sort_order: 1 }] };
    const { container } = renderGrid({ model, session: { ...editSession(model), location_ids: [locationId, patioId] } });
    const cell = (id: string) => container.querySelector(`.schedule-cell[data-display-location-id="${id}"][data-employee-id="${employeeId}"][data-date="2026-08-23"]`);
    const free = container.querySelector(`.schedule-cell[data-display-location-id="${patioId}"][data-employee-id="${employeeId}"][data-date="2026-08-22"]`);
    expect(free?.querySelector("[data-schedule-add-shift-control]")).not.toBeNull();
    expect(cell(locationId)?.getAttribute("data-availability-kind")).toBe("time_off");
    expect(cell(patioId)?.getAttribute("data-availability-kind")).toBe("time_off");
    expect(cell(patioId)!.querySelector("[data-schedule-add-shift-control]")).toBeNull();
  });

  it.each([
    ["(a) some clash", [true, false], 1, false],
    ["(b) none clash", [false, false, false], 0, true],
    ["(c) all clash", [true, true], 2, false],
  ] as const)("in a cell with two or more shifts, %s: the \"!\" sits on the clashing cards, else by the name (Mert, 2026-10-06)", (_case, clashes, cardMarks, nameMark) => {
    const marked = availabilityModel([0], true);
    const model = { ...marked, shifts: clashes.map((clash, index) => ({
      ...marked.shifts[0]!,
      id: `66666666-6666-4666-8666-66666666666${index}`,
      start_time: `${10 + index * 4}:00`,
      end_time: `${13 + index * 4}:00`,
      warning_codes: clash ? ["availability" as const] : [],
    })) };
    const { container } = renderGrid({ model, session: editSession(model) });
    expect(container.querySelectorAll(".schedule-availability-mark-card")).toHaveLength(cardMarks);
    expect(container.querySelector(".schedule-availability-mark-corner")).toBeNull();
    expect(container.querySelector(".schedule-availability-mark-name") !== null).toBe(nameMark);
  });

  // Mert, 2026-10-12: while editing, a live shift's card says LIVE, so its
  // "!" moves to the name cell; a shift not live yet keeps it on its card.
  it.each([
    ["a live shift", true, 0, true],
    ["a shift not live yet", false, 1, false],
  ] as const)("while editing, %s that runs into an unavailable day: LIVE = %s, card \"!\" marks = %s, name \"!\" = %s", (_case, live, cardMarks, nameMark) => {
    const marked = availabilityModel([0], true);
    const model = { ...marked, shifts: marked.shifts.map((shift) => ({
      ...shift,
      ...(live ? { source_published_shift_id: "99999999-9999-4999-8999-999999999999" } : {}),
    })) };
    const { container } = renderGrid({ model, session: editSession(model) });
    expect(container.querySelectorAll(".schedule-availability-mark-card")).toHaveLength(cardMarks);
    expect(container.querySelector(".schedule-shift-live-mark") !== null).toBe(live);
    expect(container.querySelector(".schedule-availability-mark-name") !== null).toBe(nameMark);
  });

  // K18, M11: the window the "!" opens says "Changed after publishing", so
  // the name's window says it under that day once the "!" moves there.
  it.each([
    ["came after the first publish", true],
    ["was there before it", false],
  ] as const)("while editing, a live shift whose mark %s: the name window says so = %s", (_case, changed) => {
    const marked = availabilityModel([0, 4], true);
    const model = { ...marked, shifts: marked.shifts.map((shift) => ({
      ...shift,
      source_published_shift_id: "99999999-9999-4999-8999-999999999999",
      availability_changed_after_publish: changed,
    })) };
    renderGrid({ model, session: editSession(model) });
    fireEvent.click(screen.getByRole("button", { name: /unavailable days this week/ }));
    const lines = [...screen.getByRole("dialog").querySelectorAll("p")].map((line) => line.textContent);
    const day = lines.indexOf("Changed after publishing");
    expect(day > 0).toBe(changed);
    expect(lines.filter((line) => line === "Changed after publishing")).toHaveLength(changed ? 1 : 0);
    if (changed) expect(lines[day - 1]).toMatch(/^Marked unavailable /);
  });

  it("puts the \"!\" in an empty cell's corner, and by the name only once two days are marked (KARARLAR Schedule, 2026-10-06)", () => {
    const one = availabilityModel([4], false);
    const first = renderGrid({ model: one, session: editSession(one) });
    expect(first.container.querySelectorAll(".schedule-availability-mark-corner")).toHaveLength(1);
    expect(first.container.querySelector(".schedule-availability-mark-name")).toBeNull();
    first.unmount();

    const two = availabilityModel([1, 4], false);
    renderGrid({ model: two, session: editSession(two) });
    const name = screen.getByRole("button", { name: /unavailable days this week/ });
    fireEvent.click(name);
    expect([...screen.getByRole("dialog").querySelectorAll("p")].map((line) => line.textContent)).toEqual([
      "Marked unavailable Tue, Aug 18 · All day",
      "Marked unavailable Fri, Aug 21 · All day",
    ]);
  });

  it.each(["separate", "unified"] as const)(
    "fits one visible location into seven columns in %s mode",
    (layout) => {
      renderGrid({ layout });
      const grid = screen.getByTestId("schedule-grid");
      expect(grid.getAttribute("data-schedule-fit-visible-columns")).toBe("true");
      expect(grid.getAttribute("data-schedule-column-count")).toBe("7");
      expect(
        screen.queryByRole("navigation", {
          name: "Schedule horizontal navigation",
        }),
      ).toBeNull();
    },
  );

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
      screen.queryByRole("button", { name: "Dinner-Unassigned job" }),
    ).toBeNull();
    expect(
      screen.getByTestId(`schedule-employee-group-${jobId}`).textContent,
    ).toContain("Server");
    expect(
      container.querySelector("[data-schedule-employee-group='none']")
        ?.textContent,
    ).toContain("Unassigned job");

    expect(
      container.querySelector("[data-schedule-role-location-seam]"),
    ).toBeNull();
  });

  it("keeps the blank band below employees in its muted colour", () => {
    const { container } = renderGrid();

    const fillerDayCells = container.querySelectorAll(
      "[data-schedule-filler-location-cell='true']",
    );
    expect(fillerDayCells.length).toBeGreaterThan(0);
    expect(
      container.querySelector("[data-schedule-grid-empty]"),
    ).toBeNull();
  });

  it("hides preset shift badges when role separators are disabled", () => {
    const { container } = renderGrid({ showRoleSeparators: false });

    expect(
      container.querySelector("[data-schedule-preset-chip='true']"),
    ).toBeNull();
  });

  it("fills an empty employee grid down to the sticky totals row", () => {
    const emptyModel = scheduleModel({ employees: [], shifts: [] });
    const { container } = renderGrid({
      model: emptyModel,
      session: null,
      employeeSortMode: "alphabetical",
      showPresetShiftBadges: false,
      showRoleSeparators: false,
      showUnassignedShifts: false,
    });

    const grid = screen.getByRole("grid", {
      name: "Weekly published schedule",
    });
    const gridChildren = Array.from(grid.children);
    const fillerIndex = gridChildren.findIndex(
      (element) =>
        element.getAttribute("data-schedule-filler-height-px") === "true",
    );
    const totalIndex = gridChildren.findIndex(
      (element) =>
        element.getAttribute("data-schedule-total-hours-row-label") === "true",
    );

    expect(screen.getByText("No employees").className).toBe("sr-only");
    expect(fillerIndex).toBeGreaterThan(-1);
    expect(totalIndex).toBeGreaterThan(fillerIndex);
    const fillerDayCells = container.querySelectorAll(
      "[data-schedule-filler-location-cell='true']",
    );
    expect(fillerDayCells.length).toBeGreaterThan(0);
    for (const cell of fillerDayCells) {
      expect(cell.getAttribute("data-schedule-grid-empty")).toBe("true");
    }
    const weekTotal = container.querySelector(
      "[data-schedule-total-hours-week-cell='true']",
    );
    expect(weekTotal?.getAttribute("aria-label")).toBe("Week total hours 0h");
    expect(weekTotal?.textContent).toBe("0h");
  });

  it("blocks single-shift drag while multiple shifts are selected", async () => {
    const onMove = vi.fn();
    const { container } = renderGrid({
      selectedIds: [
        "66666666-6666-4666-8666-666666666666",
        "77777777-7777-4777-8777-777777777779",
      ],
      onMove,
    });
    const badge = container.querySelector<HTMLElement>(
      ".schedule-shift-badge[data-shift-badge='true']",
    );
    const targetCellSelector =
      ".schedule-cell[data-drop-cell='true'][data-date='2026-08-18']";
    const targetCell = container.querySelector<HTMLElement>(targetCellSelector);
    expect(badge).toBeTruthy();
    expect(targetCell).toBeTruthy();
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => container.querySelector(targetCellSelector)),
    });

    fireEvent.mouseDown(badge!, {
      button: 0,
      buttons: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.mouseMove(window, {
      buttons: 1,
      clientX: 40,
      clientY: 40,
    });
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    expect(container.querySelector(".schedule-shift-drag-preview")).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("hides people who cannot take the dragged shift at its location until the drop (Mert, 2026-10-09, item 4 B)", async () => {
    const busyEmployeeId = "99999999-9999-4999-8999-999999999997";
    const wrongLocationEmployeeId = "99999999-9999-4999-8999-999999999998";
    const model = scheduleModel({
      locations: [
        ...scheduleModel().locations,
        {
          id: "99999999-9999-4999-8999-999999999999",
          name: "Patio",
          timezone: "America/Los_Angeles",
          sort_order: 1,
          publication_status: "published",
          published_at: null,
        },
      ],
      employees: [
        ...scheduleModel().employees,
        {
          id: busyEmployeeId,
          employee_code: "NF-002",
          display_name: "Busy Server",
          location_ids: [locationId],
          job_ids: [jobId],
          primary_job_id: jobId,
        },
        {
          id: wrongLocationEmployeeId,
          employee_code: "NF-003",
          display_name: "Patio Server",
          location_ids: ["99999999-9999-4999-8999-999999999999"],
          job_ids: [jobId],
          primary_job_id: jobId,
        },
      ],
      shifts: [
        ...scheduleModel().shifts,
        {
          ...scheduleModel().shifts[0]!,
          id: "99999999-9999-4999-8999-999999999996",
          employee_id: busyEmployeeId,
          start_time: "17:00",
          end_time: "18:00",
        },
      ],
    });
    const { container } = renderGrid({
      model,
      session: editSession(model),
      employeeSortMode: "alphabetical",
      showRoleSeparators: false,
      showPresetShiftBadges: false,
    });
    const badge = container.querySelector<HTMLElement>(
      ".schedule-shift-badge[data-shift-id='66666666-6666-4666-8666-666666666666']",
    );
    const targetCell = container.querySelector<HTMLElement>(
      ".schedule-cell[data-drop-cell='true'][data-date='2026-08-17']",
    );
    expect(badge).toBeTruthy();
    expect(targetCell).toBeTruthy();
    expect(screen.getByText("Alex Rivera")).toBeTruthy();
    expect(screen.getByText("Busy Server")).toBeTruthy();
    expect(screen.getByText("Patio Server")).toBeTruthy();
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => targetCell),
    });

    fireEvent.mouseDown(badge!, {
      button: 0,
      buttons: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.mouseMove(window, {
      buttons: 1,
      clientX: 40,
      clientY: 40,
    });
    await waitFor(() =>
      expect(container.querySelector(".schedule-shift-drag-preview")).toBeTruthy(),
    );

    expect(await screen.findByText("Alex Rivera")).toBeTruthy();
    expect(screen.getByText("Busy Server")).toBeTruthy();
    expect(screen.queryByText("Patio Server")).toBeNull();

    fireEvent.mouseUp(window, {
      button: 0,
      buttons: 0,
      clientX: 40,
      clientY: 40,
    });
    await waitFor(() => expect(screen.getByText("Busy Server")).toBeTruthy());
    expect(screen.getByText("Patio Server")).toBeTruthy();
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
        ).toBe("269px"),
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
