import type {
  ScheduleEditableShift,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScheduleGridDragPreviews } from "./ScheduleGridDragPreviews";

const job = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Server",
  color: "#2563eb",
  sort_order: 0,
  department_id: null,
} as ScheduleReadModel["jobs"][number];

const shiftType = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Dinner",
  color: "#7c3aed",
  sort_order: 0,
  default_start_time: "16:00",
  default_end_time: "22:00",
} as ScheduleReadModel["shift_types"][number];

const shift = {
  id: "33333333-3333-4333-8333-333333333333",
  revision: 1,
  location_id: "44444444-4444-4444-8444-444444444444",
  employee_id: "55555555-5555-4555-8555-555555555555",
  job_id: job.id,
  shift_type_id: shiftType.id,
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
} as ScheduleEditableShift;

describe("ScheduleGridDragPreviews", () => {
  it("renders shift and preset drag previews with reference states", () => {
    render(
      <ScheduleGridDragPreviews
        dragPreviewShift={shift}
        jobs={[job]}
        shiftTypes={[shiftType]}
        shiftDragState={{
          activeShiftId: shift.id,
          label: "Dinner",
          pointerX: 10,
          pointerY: 20,
          previewWidth: 120,
          previewHeight: 58,
          targetKey: "target",
          targetStatus: "allowed",
          reason: null,
          copy: true,
        }}
        presetDragState={{
          jobId: job.id,
          shiftTypeId: shiftType.id,
          label: "Dinner-Server",
          color: shiftType.color,
          startTime: "16:00",
          endTime: "22:00",
          pointerX: 30,
          pointerY: 40,
          previewWidth: 126,
          previewHeight: 38,
          targetKey: "target",
          targetStatus: "blocked",
          reason: "Location is closed all day.",
        }}
        showShiftType
        showShiftLabels
        showClockTimes
        timeFormat="12h"
        showJobColorDot
      />,
    );

    expect(document.querySelector(".schedule-shift-drag-preview")).toBeTruthy();
    expect(screen.getByText("+ Copy")).toBeTruthy();
    expect(
      document.querySelector("[data-shift-type-preset-drag-preview='true']"),
    ).toBeTruthy();
    expect(screen.getByText("Location is closed all day.")).toBeTruthy();
  });

  it("omits the shift preview when the active shift cannot be resolved", () => {
    render(
      <ScheduleGridDragPreviews
        dragPreviewShift={undefined}
        jobs={[job]}
        shiftTypes={[shiftType]}
        shiftDragState={{
          activeShiftId: shift.id,
          label: "Dinner",
          pointerX: 10,
          pointerY: 20,
          previewWidth: 120,
          previewHeight: 58,
          targetKey: null,
          targetStatus: null,
          reason: null,
          copy: false,
        }}
        presetDragState={null}
        showShiftType
        showShiftLabels
        showClockTimes
        timeFormat="12h"
        showJobColorDot
      />,
    );

    expect(document.querySelector(".schedule-shift-drag-preview")).toBeNull();
  });
});
