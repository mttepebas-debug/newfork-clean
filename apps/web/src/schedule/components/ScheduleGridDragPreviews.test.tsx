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

const catalog = {
  jobs: [job],
  shift_types: [shiftType],
  referenced_jobs: [] as ScheduleReadModel["referenced_jobs"],
  referenced_shift_types: [] as ScheduleReadModel["referenced_shift_types"],
};

describe("ScheduleGridDragPreviews", () => {
  it("renders shift and preset drag previews with reference states", () => {
    render(
      <ScheduleGridDragPreviews
        dragPreviewShift={shift}
        catalog={catalog}
        shiftDragState={{
          activeShiftId: shift.id,
          label: "Dinner",
          pointerX: 10,
          pointerY: 20,
          previewWidth: 120,
          previewHeight: 58,
          grabX: 0,
          grabY: 0,
          targetKey: "target",
          targetLocationId: shift.location_id,
          targetDate: shift.scheduled_date,
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
          grabX: 0,
          grabY: 0,
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
    expect(screen.getByText("+ Paste")).toBeTruthy();
    expect(
      document.querySelector("[data-shift-type-preset-drag-preview='true']"),
    ).toBeTruthy();
    expect(screen.getByText("Location is closed all day.")).toBeTruthy();
  });

  it("omits the shift preview when the active shift cannot be resolved", () => {
    render(
      <ScheduleGridDragPreviews
        dragPreviewShift={undefined}
        catalog={catalog}
        shiftDragState={{
          activeShiftId: shift.id,
          label: "Dinner",
          pointerX: 10,
          pointerY: 20,
          previewWidth: 120,
          previewHeight: 58,
          grabX: 0,
          grabY: 0,
          targetKey: null,
          targetLocationId: null,
          targetDate: null,
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

  it("names a dragged shift whose job and type were archived (K8)", () => {
    render(
      <ScheduleGridDragPreviews
        dragPreviewShift={shift}
        catalog={{
          jobs: [],
          shift_types: [],
          referenced_jobs: [{ id: job.id, name: "Line Cook" }],
          referenced_shift_types: [{ id: shiftType.id, name: "Brunch" }],
        }}
        shiftDragState={{
          activeShiftId: shift.id,
          label: "Brunch",
          pointerX: 10,
          pointerY: 20,
          previewWidth: 120,
          previewHeight: 58,
          grabX: 0,
          grabY: 0,
          targetKey: null,
          targetLocationId: null,
          targetDate: null,
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

    expect(screen.getByText("Brunch-Line Cook")).toBeTruthy();
  });
});
