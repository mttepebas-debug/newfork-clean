import type {
  ScheduleEditableShift,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  GhostShiftCard,
  ShiftCard,
  formatScheduleBadgeTime,
  formatScheduleBadgeTimeRange,
  formatScheduleShiftBadgeTitle,
} from "./ShiftCard";

const shiftType: ScheduleReadModel["shift_types"][number] = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Dinner",
  color: "#f97316",
  sort_order: 0,
  default_start_time: "17:00",
  default_end_time: "22:00",
};

const shift: ScheduleEditableShift = {
  id: "22222222-2222-4222-8222-222222222222",
  location_id: "33333333-3333-4333-8333-333333333333",
  employee_id: "44444444-4444-4444-8444-444444444444",
  job_id: "55555555-5555-4555-8555-555555555555",
  shift_type_id: shiftType.id,
  scheduled_date: "2026-08-17",
  start_time: "17:00",
  end_time: "22:30",
  crosses_midnight: false,
  unpaid_break_minutes: 30,
  hide_time_on_badge: false,
  label_ids: [],
  label_names: ["Trainer"],
  note: "",
  warning_codes: [],
  revision: 1,
};

function renderShiftCard(
  overrides: Partial<Parameters<typeof ShiftCard>[0]> = {},
) {
  const props: Parameters<typeof ShiftCard>[0] = {
    shift,
    job: "Server",
    type: shiftType,
    locationName: "Main",
    editing: true,
    showShiftType: true,
    showShiftLabels: true,
    showClockTimes: true,
    showJobColorDot: true,
    rowKey: "row-1",
    badgeHeight: 52,
    publicationState: null,
    ...overrides,
  };

  render(<ShiftCard {...props} />);
  return props;
}

describe("ShiftCard", () => {
  it("keeps warning context without a warning icon or reserved marker space", () => {
    renderShiftCard({ shift: { ...shift, warning_codes: ["overlap"] } });
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    expect(badge.getAttribute("data-has-markers")).toBe("false");
    expect(badge.querySelector(".schedule-shift-badge-markers")).toBeNull();
    expect(badge.getAttribute("aria-label")).toContain("conflicts with another shift");
  });
  it("shows saving feedback only on its optimistic badge", () => {
    renderShiftCard({ shift: { ...shift, optimistic: true, saving_state: "delayed" } });
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Still saving — please wait");
    expect(status.closest("button")?.disabled).toBe(true);
    expect(status.closest("button")?.getAttribute("aria-busy")).toBe("true");
  });
  it("renders the schedule badge with title, labels, location, time, and sizing data", () => {
    renderShiftCard({ selected: true, focused: true });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    expect(screen.getByText("Trainer")).toBeTruthy();
    expect(screen.getByText("Main")).toBeTruthy();
    expect(screen.getByText("5:00 PM - 10:30 PM")).toBeTruthy();
    expect(badge.getAttribute("data-shift-badge")).toBe("true");
    expect(badge.getAttribute("data-selected")).toBe("true");
    expect(badge.getAttribute("data-focused")).toBe("true");
    expect(badge.getAttribute("aria-pressed")).toBe("true");
    expect(badge.getAttribute("draggable")).toBeNull();
    expect(badge.style.getPropertyValue("--schedule-row-badge-height")).toBe(
      "52px",
    );
    expect(screen.getByText("Trainer").closest(".schedule-shift-badge")).toBe(
      badge,
    );
    expect(screen.getByText("Dinner-Server")).toBeTruthy();
    expect(screen.getByText("Main")).toBeTruthy();
    expect(
      document
        .querySelector("[data-shift-selection-ring='true']")
        ?.getAttribute("data-multi-selected"),
    ).toBe("true");
    expect(document.querySelector(".schedule-shift-color-dot")).toBeNull();
  });

  it("reads title, labels, then time, with no location pin", () => {
    renderShiftCard({ locationName: null });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    const parts = [...badge.querySelectorAll("[data-shift-badge-content] > *")].map(
      (node) => node.textContent,
    );
    expect(parts).toEqual(["Dinner-Server", "Trainer", "5:00 PM - 10:30 PM"]);
    expect(badge.querySelector(".schedule-ghost-location")).toBeNull();
    expect(screen.queryByRole("button", { name: "Location" })).toBeNull();
  });

  it("keeps focused shift semantics separate from multi-select pressed state", () => {
    renderShiftCard({ selected: false, focused: true });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    expect(badge.getAttribute("data-focused")).toBe("true");
    expect(badge.getAttribute("aria-pressed")).toBe("false");
    expect(
      document
        .querySelector("[data-shift-selection-ring='true']")
        ?.getAttribute("data-multi-selected"),
    ).toBe("false");
    expect(document.querySelector(".schedule-shift-color-dot")).toBeNull();
  });

  it("focuses on normal click, multi-selects on modifier click, and copies from keyboard", () => {
    vi.useFakeTimers();
    const onFocus = vi.fn();
    const onSelect = vi.fn();
    const onCopy = vi.fn();
    renderShiftCard({ onFocus, onSelect, onCopy });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    fireEvent.click(badge);
    expect(onFocus).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    fireEvent.click(badge, { ctrlKey: true });
    fireEvent.click(badge, { shiftKey: true });
    fireEvent.keyDown(badge, { key: "c", ctrlKey: true });

    expect(onFocus).toHaveBeenCalledWith(shift);
    expect(onSelect).toHaveBeenCalledWith(shift.id, true);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onCopy).toHaveBeenCalledWith(shift);
    vi.useRealTimers();
  });

  it("does not let an unpaired modifier pointerdown swallow the next normal click", () => {
    vi.useFakeTimers();
    const onFocus = vi.fn();
    const onSelect = vi.fn();
    renderShiftCard({ onFocus, onSelect });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    fireEvent.mouseDown(badge, { ctrlKey: true });
    fireEvent.mouseDown(badge);
    fireEvent.click(badge);
    vi.advanceTimersByTime(250);

    expect(onSelect).toHaveBeenCalledWith(shift.id, true);
    expect(onFocus).toHaveBeenCalledWith(shift);
    vi.useRealTimers();
  });

  it("opens editing once from a full double-click sequence without transient focus", () => {
    vi.useFakeTimers();
    const onFocus = vi.fn();
    const onEdit = vi.fn();
    renderShiftCard({ onEdit, onFocus, publicationState: "locked" });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    fireEvent.click(badge, { detail: 1, clientX: 10, clientY: 20 });
    fireEvent.click(badge, { detail: 2, clientX: 10, clientY: 20 });
    fireEvent.doubleClick(badge, { clientX: 10, clientY: 20 });
    vi.runAllTimers();

    expect(badge.getAttribute("data-publication-state")).toBe("locked");
    expect(onEdit).toHaveBeenCalledWith(shift, { x: 10, y: 20 });
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onFocus).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("keeps an already-current badge current while opening it on double click", () => {
    vi.useFakeTimers();
    const onFocus = vi.fn();
    const onEdit = vi.fn();
    renderShiftCard({ focused: true, onEdit, onFocus });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    fireEvent.click(badge, { detail: 1 });
    fireEvent.click(badge, { detail: 2 });
    fireEvent.doubleClick(badge);
    vi.runAllTimers();

    expect(badge.getAttribute("data-current")).toBe("true");
    expect(onFocus).not.toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("formats shift badge titles and times like the schedule grid", () => {
    expect(formatScheduleShiftBadgeTitle(shiftType, "Server", true)).toBe(
      "Dinner-Server",
    );
    expect(formatScheduleShiftBadgeTitle(shiftType, "Server", false)).toBe(
      "Server",
    );
    expect(formatScheduleBadgeTime("00:00")).toBe("12:00 AM");
    expect(formatScheduleBadgeTime("12:15")).toBe("12:15 PM");
    expect(formatScheduleBadgeTime("17:30", "24h")).toBe("17:30");
    expect(formatScheduleBadgeTimeRange("09:00", "17:00")).toBe(
      "9:00 AM - 5:00 PM",
    );
    expect(formatScheduleBadgeTimeRange("09:00", "17:00", "24h")).toBe(
      "09:00 - 17:00",
    );
  });

  it("renders badge clock text with the schedule time format", () => {
    renderShiftCard({ timeFormat: "24h" });

    expect(screen.getByText("17:00 - 22:30")).toBeTruthy();
    expect(screen.getByRole("button", { name: /17:00 - 22:30/i })).toBeTruthy();
  });

  it("shows every label without compacting the visible list", () => {
    renderShiftCard({
      shift: {
        ...shift,
        label_names: ["Training", "Lead Server", "Close"],
      },
    });

    const labels = screen.getByText("Training · Lead Server · Close");
    expect(labels.getAttribute("title")).toBe("Training · Lead Server · Close");
    expect(
      screen.getByRole("button", {
        name: /Training · Lead Server · Close/i,
      }),
    ).toBeTruthy();
  });
});

describe("GhostShiftCard", () => {
  it("renders duplicate-location ghost badges with warning context", () => {
    const ghostShift = {
      ...shift,
      warning_codes: ["overlap"],
      ghost: true,
      ghost_location_name: "Patio",
    } as ScheduleShift & {
      readonly ghost: boolean;
      readonly ghost_location_name: string;
    };

    render(
      <GhostShiftCard
        shift={ghostShift}
        job="Server"
        type={shiftType}
        showShiftType
        showShiftLabels
        showClockTimes
        showJobColorDot
        rowKey="row-1"
        badgeHeight={52}
      />,
    );

    const badge = screen.getByTestId("ghost-shift-badge");
    expect(badge.getAttribute("data-ghost")).toBe("true");
    // The location pin takes the marker corner, so the title keeps clear of it.
    expect(badge.getAttribute("data-has-markers")).toBe("true");
    expect(document.querySelector(".schedule-shift-color-dot")).toBeNull();
    // The place is behind the pin, not on its own line.
    expect(screen.queryByText("Patio")).toBeNull();
    expect(badge.querySelector("[data-shift-badge-location]")).toBeNull();
    expect(screen.getByRole("button", { name: "Location" })).toBeTruthy();
    expect(screen.getByText("5:00 PM - 10:30 PM")).toBeTruthy();
    expect(badge.getAttribute("aria-label")).toContain(
      "also scheduled at Patio",
    );
    // Every ghost wears the same gray: no type color rides along.
    expect(badge.style.getPropertyValue("--shift-color")).toBe("");
  });

  it("names the place in a tooltip on keyboard focus and hides it on Escape", async () => {
    const ghostShift = {
      ...shift,
      ghost: true,
      ghost_location_name: "Besiktas",
    } as ScheduleShift;
    render(
      <GhostShiftCard
        shift={ghostShift}
        job="Server"
        type={shiftType}
        showShiftType
        showShiftLabels
        showClockTimes
        showJobColorDot
        rowKey="row-1"
        badgeHeight={52}
      />,
    );

    const pin = screen.getByRole("button", { name: "Location" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(pin);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe("Besiktas");
    expect(pin.getAttribute("aria-describedby")).toBe(tooltip.id);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(pin);
    expect(screen.getByRole("tooltip").textContent).toBe("Besiktas");
    fireEvent.mouseLeave(pin);
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("titles an out-of-scope ghost with the job, type and labels it carries", () => {
    // Besiktas is outside the reader's scope: its job and type are not in the model's lists.
    const ghostShift = {
      ...shift,
      job_id: "55555555-5555-4555-8555-555555555599",
      shift_type_id: "11111111-1111-4111-8111-111111111199",
      label_names: ["On call"],
      note: "",
      ghost: true,
      ghost_location_name: "Besiktas",
      ghost_job_name: "Bartender",
      ghost_shift_type_name: "Late",
    } as ScheduleShift;

    render(
      <GhostShiftCard
        shift={ghostShift}
        job="Shift"
        type={undefined}
        showShiftType
        showShiftLabels
        showClockTimes
        showJobColorDot
        rowKey="row-1"
        badgeHeight={52}
      />,
    );

    const badge = screen.getByTestId("ghost-shift-badge");
    const parts = [...badge.querySelectorAll("[data-shift-badge-content] > *")].map(
      (node) => node.textContent,
    );
    // Same lines, same order as the real card: title, labels as text, time.
    expect(parts).toEqual(["Late-Bartender", "On call", "5:00 PM - 10:30 PM"]);
    expect(badge.getAttribute("aria-label")).toContain("Late-Bartender");
  });

  it("falls back to Shift when the ghost carries no job or type name", () => {
    const ghostShift = {
      ...shift,
      label_names: [],
      ghost: true,
      ghost_location_name: "Besiktas",
      ghost_job_name: "  ",
      ghost_shift_type_name: null,
    } as ScheduleShift;

    render(
      <GhostShiftCard
        shift={ghostShift}
        job="Shift"
        type={undefined}
        showShiftType
        showShiftLabels
        showClockTimes
        showJobColorDot
        rowKey="row-1"
        badgeHeight={52}
      />,
    );

    const badge = screen.getByTestId("ghost-shift-badge");
    expect(badge.querySelector("strong")?.textContent).toBe("Shift");
  });
});
