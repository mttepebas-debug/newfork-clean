import type {
  ScheduleEmployee,
  ScheduleLocation,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ScheduleTopBar } from "./ScheduleTopBar";

const location = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Main Dining",
  timezone: "America/Los_Angeles",
  sort_order: 0,
  publication_status: "published",
  published_at: "2026-08-17T12:00:00Z",
} satisfies ScheduleLocation;

const job = {
  id: "22222222-2222-4222-8222-222222222222",
  department_id: null,
  system_key: null,
  name: "Server",
  color: "#2563eb",
  
} satisfies ScheduleReadModel["jobs"][number];

const employee = {
  id: "33333333-3333-4333-8333-333333333333",
  employee_code: "NF-001",
  display_name: "Alex Rivera",
  location_ids: [location.id],
  job_ids: [job.id],
  primary_job_id: job.id,
} satisfies ScheduleEmployee;

function buildTopBarProps(
  overrides: Partial<Parameters<typeof ScheduleTopBar>[0]> = {},
): Parameters<typeof ScheduleTopBar>[0] {
  return {
    weekLabel: "Aug 17 - Aug 23",
    view: "week",
    weekStartDate: "2026-08-17",
    weekStartDay: "monday" as const,
    layout: "separate" as const,
    onLayoutChange: vi.fn(),
    onPreviousViewPeriod: vi.fn(),
    onNextViewPeriod: vi.fn(),
    onCurrentViewPeriodClick: vi.fn(),
    isCurrentViewPeriod: false,
    onDayPick: vi.fn(),
    onWeekJump: vi.fn(),
    hideUnscheduled: false,
    onToggleHideUnscheduled: vi.fn(),
    showUnassignedShifts: true,
    onToggleUnassignedShifts: vi.fn(),
    unassignedFrozen: true,
    onToggleUnassignedFrozen: vi.fn(),
    showShiftType: true,
    onToggleShiftType: vi.fn(),
    showShiftLabels: true,
    onToggleShiftLabels: vi.fn(),
    showClockTimes: true,
    onToggleClockTimes: vi.fn(),
    showTotalHours: false,
    onToggleTotalHours: vi.fn(),
    showRoleSeparators: true,
    onToggleRoleSeparators: vi.fn(),
    showPresetShiftBadges: true,
    onTogglePresetShiftBadges: vi.fn(),
    employeeSortMode: "alphabetical" as const,
    onEmployeeSortModeChange: vi.fn(),
    locations: [location],
    selectedLocationIds: [],
    onLocationFilterChange: vi.fn(),
    shiftTypes: [],
    selectedShiftTypeIds: [],
    onShiftTypeFilterChange: vi.fn(),
    jobs: [job],
    departments: [],
    selectedJobIds: [],
    onJobFilterChange: vi.fn(),
    employees: [employee],
    selectedEmployeeIds: [],
    onEmployeeFilterChange: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof ScheduleTopBar>[0];
}

function renderTopBar(
  overrides: Partial<Parameters<typeof ScheduleTopBar>[0]> = {},
) {
  return render(
    <MemoryRouter>
      <ScheduleTopBar {...buildTopBarProps(overrides)} />
    </MemoryRouter>,
  );
}

describe("ScheduleTopBar", () => {
  it("closes an open dropdown when the page sends a dismiss signal", () => {
    const { rerender } = renderTopBar({ dropdownDismissSignal: 0 });
    const jobsDetails = document.querySelector<HTMLElement>(
      '[data-filter-id="jobs"]',
    );
    const jobsTrigger = jobsDetails?.querySelector("summary");
    expect(jobsTrigger).not.toBeNull();
    fireEvent.click(jobsTrigger!);
    expect(jobsDetails?.hasAttribute("open")).toBe(true);

    rerender(
      <MemoryRouter>
        <ScheduleTopBar {...buildTopBarProps({ dropdownDismissSignal: 1 })} />
      </MemoryRouter>,
    );
    expect(jobsDetails?.hasAttribute("open")).toBe(false);
  });

  it("lets non-grid outside pointer actions continue after closing an open dropdown", () => {
    const onUnderlyingPointerDown = vi.fn();
    render(
      <MemoryRouter>
        <ScheduleTopBar {...buildTopBarProps()} />
        <button type="button" onPointerDown={onUnderlyingPointerDown}>
          underlying grid cell
        </button>
      </MemoryRouter>,
    );

    const jobsDetails = document.querySelector<HTMLElement>(
      '[data-filter-id="jobs"]',
    );
    const jobsTrigger = jobsDetails?.querySelector("summary");
    expect(jobsTrigger).not.toBeNull();
    fireEvent.click(jobsTrigger!);
    expect(jobsDetails?.hasAttribute("open")).toBe(true);

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "underlying grid cell" }),
      { pointerType: "mouse" },
    );

    expect(jobsDetails?.hasAttribute("open")).toBe(false);
    expect(onUnderlyingPointerDown).toHaveBeenCalledTimes(1);
  });

  it("swallows the grid pointer that closes an open dropdown", () => {
    const onGridPointerDown = vi.fn();
    render(
      <MemoryRouter>
        <ScheduleTopBar {...buildTopBarProps()} />
        <button
          type="button"
          data-schedule-grid-frame="true"
          onPointerDown={onGridPointerDown}
        >
          underlying grid cell
        </button>
      </MemoryRouter>,
    );

    const jobsDetails = document.querySelector<HTMLElement>(
      '[data-filter-id="jobs"]',
    );
    const jobsTrigger = jobsDetails?.querySelector("summary");
    expect(jobsTrigger).not.toBeNull();
    fireEvent.click(jobsTrigger!);
    expect(jobsDetails?.hasAttribute("open")).toBe(true);

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "underlying grid cell" }),
      { pointerType: "mouse" },
    );

    expect(jobsDetails?.hasAttribute("open")).toBe(false);
    expect(onGridPointerDown).not.toHaveBeenCalled();
  });

  it("does not leave focus on a topbar trigger after Escape closes the dropdown", () => {
    renderTopBar();
    const jobsDetails = document.querySelector<HTMLElement>(
      '[data-filter-id="jobs"]',
    );
    const jobsTrigger = jobsDetails?.querySelector<HTMLElement>("summary");
    expect(jobsTrigger).not.toBeNull();

    act(() => jobsTrigger!.focus());
    fireEvent.click(jobsTrigger!);
    expect(jobsDetails?.hasAttribute("open")).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(jobsDetails?.hasAttribute("open")).toBe(false);
    expect(document.activeElement).not.toBe(jobsTrigger);
  });

  // BL-372: the top bar shares the Schedule windows' Escape rule.
  it("leaves Escape to an armed two-click button and keeps the dropdown open", () => {
    renderTopBar();
    const jobsDetails = document.querySelector<HTMLElement>('[data-filter-id="jobs"]');
    fireEvent.click(jobsDetails!.querySelector<HTMLElement>("summary")!);
    expect(jobsDetails?.hasAttribute("open")).toBe(true);
    const armed = document.createElement("button");
    armed.dataset.confirming = "true";
    document.body.append(armed);

    fireEvent.keyDown(armed, { key: "Escape" });
    armed.remove();

    expect(jobsDetails?.hasAttribute("open")).toBe(true);
  });

  it("renders weekly period navigation and view mode before schedule filters", () => {
    const onPreviousViewPeriod = vi.fn();
    const onNextViewPeriod = vi.fn();
    const onCurrentViewPeriodClick = vi.fn();

    renderTopBar({
      onPreviousViewPeriod,
      onNextViewPeriod,
      onCurrentViewPeriodClick,
    });

    const mainRow = document.querySelector("[data-schedule-top-bar-main-row]");
    const previousWeek = screen.getByRole("button", { name: "Previous week" });
    // BL-449: named by its dates; the title says what it does.
    const weeklyView = screen.getByTitle("Jump to this week");
    const nextWeek = screen.getByRole("button", { name: "Next week" });
    const hideUnscheduled = screen.getByRole("button", {
      name: "Hide Unscheduled",
    });

    expect(mainRow?.firstElementChild).toBe(
      previousWeek.closest(".schedule-view-mode-controls"),
    );
    expect(
      Boolean(
        weeklyView.compareDocumentPosition(hideUnscheduled) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Calendar" })).toBeNull();

    fireEvent.click(previousWeek);
    fireEvent.click(weeklyView);
    fireEvent.click(nextWeek);

    expect(onPreviousViewPeriod).toHaveBeenCalledTimes(1);
    expect(onCurrentViewPeriodClick).toHaveBeenCalledTimes(1);
    expect(onNextViewPeriod).toHaveBeenCalledTimes(1);
  });

  it("wires A-Z and Job/Position sort actions from the settings menu", () => {
    const onEmployeeSortModeChange = vi.fn();
    const { rerender } = renderTopBar({ onEmployeeSortModeChange });

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const settingsPanel = document.querySelector<HTMLElement>(
      ".schedule-settings-menu-panel",
    );
    expect(settingsPanel).not.toBeNull();
    const settingsMenu = within(settingsPanel!);

    expect(settingsMenu.queryByText(/Job color dot in badges/)).toBeNull();
    expect(settingsMenu.queryByText("Schedule")).toBeNull();
    expect(settingsMenu.queryByRole("button", { name: "Today" })).toBeNull();
    expect(settingsMenu.queryByRole("link", { name: "Requests" })).toBeNull();

    const alphabetical = screen.getByRole("menuitemradio", { name: /A-Z/ });
    const byJob = screen.getByRole("menuitemradio", {
      name: /Job\/Position/,
    });
    const presetBadges = screen.getByRole("button", {
      name: "Hide Preset badges",
    });
    const roleSeparators = screen.getByRole("button", {
      name: "Hide Role Separators",
    });

    expect(alphabetical.getAttribute("aria-checked")).toBe("true");
    expect(byJob.getAttribute("aria-checked")).toBe("false");
    expect(presetBadges.getAttribute("aria-disabled")).toBe("true");
    expect(roleSeparators.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(byJob);
    expect(onEmployeeSortModeChange).toHaveBeenCalledWith("byJob");

    rerender(
      <MemoryRouter>
        <ScheduleTopBar
          {...buildTopBarProps({
            employeeSortMode: "byJob",
            onEmployeeSortModeChange,
          })}
        />
      </MemoryRouter>,
    );

    if (!screen.queryByRole("menuitemradio", { name: /A-Z/ })) {
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    }
    const alphabeticalAfterSort = screen.getByRole("menuitemradio", {
      name: /A-Z/,
    });
    const byJobAfterSort = screen.getByRole("menuitemradio", {
      name: /Job\/Position/,
    });

    expect(alphabeticalAfterSort.getAttribute("aria-checked")).toBe("false");
    expect(byJobAfterSort.getAttribute("aria-checked")).toBe("true");
    expect(
      screen.getByRole("button", { name: "Hide Preset badges" }).getAttribute("aria-disabled"),
    ).toBe(null);
    expect(
      screen.getByRole("button", { name: "Hide Role Separators" }).getAttribute("aria-disabled"),
    ).toBe(null);

    fireEvent.click(alphabeticalAfterSort);
    expect(onEmployeeSortModeChange).toHaveBeenCalledWith("alphabetical");
  });

  it("hides and shows the availability marks from the Settings menu in edit mode only (KARARLAR Schedule, 2026-10-06)", () => {
    const onToggleAvailability = vi.fn();
    const { rerender } = renderTopBar({ showAvailability: true, onToggleAvailability, unassignedRowSettingsDisabled: true });
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const passive = screen.getByRole("button", { name: "Hide Availability" });
    expect(passive.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(passive);
    expect(onToggleAvailability).not.toHaveBeenCalled();
    rerender(
      <MemoryRouter>
        <ScheduleTopBar {...buildTopBarProps({ showAvailability: true, onToggleAvailability, unassignedRowSettingsDisabled: false })} />
      </MemoryRouter>,
    );
    const row = screen.getByRole("button", { name: "Hide Availability" });
    // QA 48: the label already says the action, so "pressed" would read as its opposite.
    expect(row.hasAttribute("aria-pressed")).toBe(false);
    expect(row.getAttribute("data-pressed")).toBe("true");
    expect(row.getAttribute("aria-disabled")).toBe(null);
    fireEvent.click(row);
    expect(onToggleAvailability).toHaveBeenCalledOnce();
    rerender(
      <MemoryRouter>
        <ScheduleTopBar {...buildTopBarProps({ showAvailability: false, onToggleAvailability })} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Show Availability" }).hasAttribute("aria-pressed")).toBe(false);
  });

  it("says why a passive Settings row cannot be used (QA 47)", () => {
    const onToggleRoleSeparators = vi.fn();
    const onToggleUnassignedShifts = vi.fn();
    const onToggleAvailability = vi.fn();
    renderTopBar({
      employeeSortMode: "alphabetical",
      unassignedRowSettingsDisabled: true,
      onToggleRoleSeparators,
      onToggleUnassignedShifts,
      showAvailability: true,
      onToggleAvailability,
    });
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const reason = (row: HTMLElement) =>
      document.getElementById(row.getAttribute("aria-describedby") ?? "")?.textContent ?? null;
    const rows = {
      "Hide Preset badges": "Sort by Job/Position to use this.",
      "Hide Role Separators": "Sort by Job/Position to use this.",
      "Hide Unassigned Shifts Row": "Available while editing.",
      "Unfreeze Unassigned Shifts Row": "Available while editing.",
      "Hide Availability": "Available while editing.",
    };
    for (const [name, why] of Object.entries(rows)) {
      const row = screen.getByRole("button", { name });
      // It stays reachable so the reason can be read, but does nothing (BL-308).
      expect(row.getAttribute("aria-disabled")).toBe("true");
      expect(reason(row)).toBe(why);
      fireEvent.click(row);
    }
    expect(onToggleRoleSeparators).not.toHaveBeenCalled();
    expect(onToggleUnassignedShifts).not.toHaveBeenCalled();
    expect(onToggleAvailability).not.toHaveBeenCalled();
    // A row that works has no reason to give.
    expect(screen.getByRole("button", { name: "Hide Shift type in badges" }).hasAttribute("aria-describedby")).toBe(false);
  });

  it("keeps the Unassigned Shifts Row settings passive outside edit mode", () => {
    const onToggleUnassignedShifts = vi.fn();
    const onToggleUnassignedFrozen = vi.fn();
    const { rerender } = renderTopBar({
      unassignedRowSettingsDisabled: true,
      onToggleUnassignedShifts,
      onToggleUnassignedFrozen,
    });

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const showHide = screen.getByRole("button", {
      name: "Hide Unassigned Shifts Row",
    });
    const freeze = screen.getByRole("button", {
      name: /freeze Unassigned Shifts Row/i,
    });
    expect(showHide.getAttribute("aria-disabled")).toBe("true");
    expect(freeze.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(showHide);
    fireEvent.click(freeze);
    expect(onToggleUnassignedShifts).not.toHaveBeenCalled();
    expect(onToggleUnassignedFrozen).not.toHaveBeenCalled();

    rerender(
      <MemoryRouter>
        <ScheduleTopBar
          {...buildTopBarProps({
            unassignedRowSettingsDisabled: false,
            onToggleUnassignedShifts,
            onToggleUnassignedFrozen,
          })}
        />
      </MemoryRouter>,
    );
    if (!screen.queryByRole("button", { name: "Hide Unassigned Shifts Row" })) {
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Hide Unassigned Shifts Row" }),
    );
    if (!screen.queryByRole("button", { name: /freeze Unassigned Shifts Row/i })) {
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    }
    fireEvent.click(
      screen.getByRole("button", { name: /freeze Unassigned Shifts Row/i }),
    );
    expect(onToggleUnassignedShifts).toHaveBeenCalledTimes(1);
    expect(onToggleUnassignedFrozen).toHaveBeenCalledTimes(1);
  });

  it("puts a Week | Day switch right after the date; the date never changes the view (S-228)", () => {
    const onViewChange = vi.fn();
    const onCurrentViewPeriodClick = vi.fn();
    const { rerender } = renderTopBar({ isCurrentViewPeriod: true, onViewChange, onCurrentViewPeriodClick });

    const views = screen.getByRole("group", { name: "Schedule view" });
    expect(views.previousElementSibling?.classList.contains("schedule-view-mode-controls")).toBe(true);
    const week = within(views).getByRole("button", { name: "Week" });
    const day = within(views).getByRole("button", { name: "Day" });
    expect(week.getAttribute("aria-pressed")).toBe("true");
    expect(day.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(week);
    expect(onViewChange).not.toHaveBeenCalled();
    fireEvent.click(day);
    expect(onViewChange).toHaveBeenCalledWith("day");

    // This week: the date opens the calendar instead of switching to the daily view.
    expect(screen.queryByTitle("Switch to daily view")).toBeNull();
    const date = screen.getByRole("button", { name: "Aug 17 - Aug 23" });
    expect(date.getAttribute("title")).toBe("Open calendar");
    fireEvent.click(date);
    expect(screen.getByRole("dialog", { name: "Schedule calendar" })).toBeTruthy();
    expect(onCurrentViewPeriodClick).not.toHaveBeenCalled();

    // Another week: the orange date goes back to this week.
    rerender(
      <MemoryRouter>
        <ScheduleTopBar
          {...buildTopBarProps({ isCurrentViewPeriod: false, onViewChange, onCurrentViewPeriodClick })}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTitle("Jump to this week"));
    expect(onCurrentViewPeriodClick).toHaveBeenCalledTimes(1);
  });
});
