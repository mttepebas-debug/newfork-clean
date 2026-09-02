import type {
  ScheduleEditableShift,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import { fireEvent, render, screen } from "@testing-library/react";
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

function renderShiftCard(overrides: Partial<Parameters<typeof ShiftCard>[0]> = {}) {
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
  it("renders the schedule badge with title, labels, location, time, and sizing data", () => {
    renderShiftCard({ selected: true, focused: true });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    expect(screen.getByText("Trainer")).toBeTruthy();
    expect(screen.getByText("Main")).toBeTruthy();
    expect(screen.getByText("5p to 10:30p")).toBeTruthy();
    expect(badge.getAttribute("data-shift-badge")).toBe("true");
    expect(badge.getAttribute("data-selected")).toBe("true");
    expect(badge.getAttribute("data-focused")).toBe("true");
    expect(badge.getAttribute("aria-pressed")).toBe("true");
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
    const onFocus = vi.fn();
    const onSelect = vi.fn();
    const onCopy = vi.fn();
    renderShiftCard({ onFocus, onSelect, onCopy });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    fireEvent.click(badge);
    fireEvent.click(badge, { ctrlKey: true });
    fireEvent.keyDown(badge, { key: "c", ctrlKey: true });

    expect(onFocus).toHaveBeenCalledWith(shift);
    expect(onSelect).toHaveBeenCalledWith(shift.id, true);
    expect(onCopy).toHaveBeenCalledWith(shift);
  });

  it("does not let an unpaired modifier pointerdown swallow the next normal click", () => {
    const onFocus = vi.fn();
    const onSelect = vi.fn();
    renderShiftCard({ onFocus, onSelect });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    fireEvent.mouseDown(badge, { ctrlKey: true });
    fireEvent.mouseDown(badge);
    fireEvent.click(badge);

    expect(onSelect).toHaveBeenCalledWith(shift.id, true);
    expect(onFocus).toHaveBeenCalledWith(shift);
  });

  it("opens editing from double click and exposes publication state", () => {
    const onEdit = vi.fn();
    renderShiftCard({ onEdit, publicationState: "locked" });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    fireEvent.doubleClick(badge, { clientX: 10, clientY: 20 });

    expect(badge.getAttribute("data-publication-state")).toBe("locked");
    expect(onEdit).toHaveBeenCalledWith(shift, { x: 10, y: 20 });
  });

  it("formats shift badge titles and times like the schedule grid", () => {
    expect(formatScheduleShiftBadgeTitle(shiftType, "Server", true)).toBe(
      "Dinner-Server",
    );
    expect(formatScheduleShiftBadgeTitle(shiftType, "Server", false)).toBe(
      "Server",
    );
    expect(formatScheduleBadgeTime("00:00")).toBe("12a");
    expect(formatScheduleBadgeTime("12:15")).toBe("12:15p");
    expect(formatScheduleBadgeTime("17:30", "24h")).toBe("17:30");
    expect(formatScheduleBadgeTimeRange("09:00", "17:00")).toBe(
      "9a to 5p",
    );
    expect(formatScheduleBadgeTimeRange("09:00", "17:00", "24h")).toBe(
      "09:00 to 17:00",
    );
  });

  it("renders badge clock text with the schedule time format", () => {
    renderShiftCard({ timeFormat: "24h" });

    expect(screen.getByText("17:00 to 22:30")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /17:00 to 22:30/i }),
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
    expect(document.querySelector(".schedule-shift-color-dot")).toBeNull();
    expect(screen.getByText("Patio")).toBeTruthy();
    expect(screen.getByText("5p to 10:30p")).toBeTruthy();
    expect(badge.getAttribute("title")).toContain("Also scheduled at Patio");
    expect(badge.getAttribute("aria-label")).toContain(
      "also scheduled at Patio",
    );
  });
});
