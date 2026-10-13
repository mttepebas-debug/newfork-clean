import type {
  ScheduleEditableShift,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ShiftDragPreview, ShiftTypePresetDragPreview } from "./ShiftDragPreview";

const shiftType: ScheduleReadModel["shift_types"][number] = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Dinner",
  color: "#7c3aed",
  sort_order: 0,
  default_start_time: "16:00",
  default_end_time: "22:00",
};

const shift: ScheduleEditableShift = {
  id: "22222222-2222-4222-8222-222222222222",
  location_id: "33333333-3333-4333-8333-333333333333",
  employee_id: "44444444-4444-4444-8444-444444444444",
  job_id: "55555555-5555-4555-8555-555555555555",
  shift_type_id: shiftType.id,
  scheduled_date: "2026-08-17",
  start_time: "16:00",
  end_time: "22:00",
  crosses_midnight: false,
  unpaid_break_minutes: 30,
  hide_time_on_badge: false,
  label_ids: [],
  label_names: [],
  note: "",
  warning_codes: [],
  revision: 1,
};

describe("ShiftDragPreview", () => {
  it("renders the dragged shift card with copy and blocked indicators", () => {
    render(
      <ShiftDragPreview
        dragState={{
          pointerX: 100,
          pointerY: 120,
          previewWidth: 140,
          previewHeight: 58,
          grabX: 70,
          grabY: 29,
          targetStatus: "blocked",
          reason: "Drop on a different cell.",
          copy: true,
        }}
        shift={shift}
        job="Server"
        type={shiftType}
        showShiftType
        showShiftLabels
        showClockTimes
        timeFormat="12h"
        showJobColorDot
      />,
    );

    const preview = document.querySelector(".schedule-shift-drag-preview");
    expect(preview?.getAttribute("data-copy")).toBe("true");
    expect(preview?.getAttribute("data-status")).toBe("blocked");
    expect(screen.getByText("+ Paste")).toBeTruthy();
    expect(screen.getByText("Drop on a different cell.")).toBeTruthy();
    expect(screen.getByText("Dinner-Server")).toBeTruthy();
  });

  it("keeps the card where it was pressed, under the mouse, not beside it", () => {
    render(
      <ShiftDragPreview
        dragState={{
          pointerX: 1083,
          pointerY: 570,
          previewWidth: 126,
          previewHeight: 60,
          grabX: 63,
          grabY: 30,
          targetStatus: null,
          reason: null,
          copy: false,
        }}
        shift={shift}
        job="Server"
        type={shiftType}
        showShiftType
        showShiftLabels
        showClockTimes
        timeFormat="12h"
        showJobColorDot
      />,
    );

    const preview = document.querySelector<HTMLElement>(".schedule-shift-drag-preview");
    expect(preview?.style.left).toBe("1020px");
    expect(preview?.style.top).toBe("540px");
  });
});

describe("ShiftTypePresetDragPreview", () => {
  it("renders the preset drag preview with target state and reason", () => {
    render(
      <ShiftTypePresetDragPreview
        dragState={{
          jobId: "job-server",
          shiftTypeId: shiftType.id,
          label: "Dinner-Server",
          color: shiftType.color,
          startTime: "16:00",
          endTime: "22:00",
          pointerX: 40,
          pointerY: 64,
          previewWidth: 126,
          previewHeight: 28,
          grabX: 10,
          grabY: 14,
          targetKey: "employee|location|date",
          targetStatus: "allowed",
          reason: "Ready",
        }}
      />,
    );

    const preview = document.querySelector(
      "[data-shift-type-preset-drag-preview='true']",
    );
    expect(preview?.getAttribute("data-status")).toBe("allowed");
    expect(screen.getByText("Dinner-Server")).toBeTruthy();
    const card = preview?.querySelector<HTMLElement>(
      ".schedule-shift-type-preset-drag-preview-card",
    );
    expect(card?.style.getPropertyValue("--schedule-preset-chip-hover-glow")).toBe(
      "color-mix(in srgb, #7c3aed 52%, #000)",
    );
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(preview?.getAttribute("style")).toContain("left: 30px; top: 50px;");
  });
});
