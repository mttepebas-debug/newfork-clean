import type {
  ScheduleEditableShift,
  ScheduleReadModel,
  ScheduleShiftMutationInput,
} from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import {
  applyScheduleShiftTypeDefaults,
  buildScheduleShiftEditorInitialValue,
} from "./shiftEditorState";
import type { ShiftClipboardSnapshot } from "./shiftClipboard";

const model: ScheduleReadModel = {
  workspace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  week_start: "2026-08-17",
  week_start_day: "monday",
  settings: { time_format: "12h" },
  locations: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Main",
      timezone: "America/Los_Angeles",
      sort_order: 0,
      publication_status: "published",
      published_at: null,
    },
  ],
  departments: [],
  jobs: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Server",
      color: "#0f766e",
      sort_order: 0,
      department_id: null,
      system_key: null,
    },
  ],
  shift_types: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Dinner",
      color: "#f97316",
      sort_order: 0,
      default_start_time: "16:00",
      default_end_time: "22:00",
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Clock off",
      color: "#64748b",
      sort_order: 1,
      default_start_time: null,
      default_end_time: null,
    },
  ],
  shift_labels: [],
  employees: [],
  shifts: [],
  closures: [],
  important_dates: [],
};

const editShift: ScheduleEditableShift = {
  id: "55555555-5555-4555-8555-555555555555",
  location_id: model.locations[0]!.id,
  employee_id: null,
  job_id: model.jobs[0]!.id,
  shift_type_id: model.shift_types[0]!.id,
  scheduled_date: "2026-08-17",
  start_time: "17:00",
  end_time: "23:00",
  crosses_midnight: false,
  unpaid_break_minutes: 45,
  hide_time_on_badge: false,
  label_ids: [],
  label_names: [],
  note: "Keep close",
  warning_codes: [],
  revision: 2,
};

describe("shiftEditorState", () => {
  it("retains historical reference evidence when only the type label changes", () => {
    const value = buildScheduleShiftEditorInitialValue({ state: { mode: "edit", shift: editShift }, model });
    const snapshot = { shift_type_id: model.shift_types[0]!.id, default_revision: 3,
      start_time: "17:00", end_time: "23:00", timezone: "America/Los_Angeles" };
    const result = applyScheduleShiftTypeDefaults({ value: { ...value, time_basis: "type_default", time_snapshot: snapshot },
      shiftType: model.shift_types[1], shiftTypeId: model.shift_types[1]!.id, preserveTimes: true,
      clockOffFallbackStartTime: "", clockOffFallbackEndTime: "" });
    expect(result.time_snapshot).toEqual(snapshot);
    expect(result.time_basis).toBe("type_default");
    expect(result.start_time).toBe("17:00");
  });
  it("keeps a hidden badge time a display choice", () => {
    const value = buildScheduleShiftEditorInitialValue({ state: { mode: "edit", shift: { ...editShift, hide_time_on_badge: true } }, model });
    expect(value.time_basis).toBe("explicit");
  });
  it("builds edit initial values from the existing shift", () => {
    expect(
      buildScheduleShiftEditorInitialValue({
        state: { mode: "edit", shift: editShift },
        model,
      }),
    ).toEqual(
      expect.objectContaining({
        location_id: model.locations[0]!.id,
        employee_id: null,
        job_id: model.jobs[0]!.id,
        shift_type_id: model.shift_types[0]!.id,
        start_time: "17:00",
        end_time: "23:00",
        unpaid_break_minutes: 45,
        note: "Keep close",
      }),
    );
  });

  it("retargets copied shift snapshots for paste create mode", () => {
    const copy: ShiftClipboardSnapshot = {
      id: "55555555-5555-4555-8555-555555555555",
      source_employee_id: null,
      source_location_id: model.locations[0]!.id,
      location_id: model.locations[0]!.id,
      employee_id: null,
      job_id: model.jobs[0]!.id,
      shift_type_id: model.shift_types[0]!.id,
      scheduled_date: "2026-08-17",
      start_time: "16:00",
      end_time: "22:00",
      unpaid_break_minutes: 30,
      hide_time_on_badge: false,
      label_ids: [],
      label_names: [],
      note: "Copied",
    };

    expect(
      buildScheduleShiftEditorInitialValue({
        state: {
          mode: "create",
          locationId: "66666666-6666-4666-8666-666666666666",
          employeeId: "77777777-7777-4777-8777-777777777777",
          date: "2026-08-19",
          copy,
        },
        model,
      }),
    ).toEqual(
      expect.objectContaining({
        location_id: "66666666-6666-4666-8666-666666666666",
        employee_id: "77777777-7777-4777-8777-777777777777",
        scheduled_date: "2026-08-19",
        start_time: "16:00",
        end_time: "22:00",
        note: "Copied",
      }),
    );
  });

  // BL-199: the quick editor sends the note it holds, and the edit service
  // empties a note the payload leaves out.
  it("keeps the note whichever way the shift type is changed in the editor", () => {
    const value = buildScheduleShiftEditorInitialValue({ state: { mode: "edit", shift: editShift }, model });
    const changes = [
      { shiftType: model.shift_types[0], shiftTypeId: model.shift_types[0]!.id },
      { shiftType: model.shift_types[1], shiftTypeId: model.shift_types[1]!.id },
      { shiftType: undefined, shiftTypeId: null },
      { shiftType: model.shift_types[1], shiftTypeId: model.shift_types[1]!.id, preserveTimes: true },
    ];
    expect(
      changes.map((change) =>
        applyScheduleShiftTypeDefaults({ value, clockOffFallbackStartTime: "", clockOffFallbackEndTime: "", ...change }).note,
      ),
    ).toEqual(["Keep close", "Keep close", "Keep close", "Keep close"]);
  });

  it("starts a new shift with an empty note, not a missing one", () => {
    expect(
      buildScheduleShiftEditorInitialValue({
        state: { mode: "create", locationId: model.locations[0]!.id, employeeId: null, date: "2026-08-18" },
        model,
      }).note,
    ).toBe("");
  });

  it("uses preset times when creating from a preset badge", () => {
    expect(
      buildScheduleShiftEditorInitialValue({
        state: {
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: null,
          date: "2026-08-18",
          preset: {
            jobId: model.jobs[0]!.id,
            shiftTypeId: model.shift_types[0]!.id,
            startTime: "11:00",
            endTime: "15:00",
          },
        },
        model,
      }),
    ).toEqual(
      expect.objectContaining({
        job_id: model.jobs[0]!.id,
        shift_type_id: model.shift_types[0]!.id,
        start_time: "11:00",
        end_time: "15:00",
        hide_time_on_badge: false,
      }),
    );
  });

  it("marks preset clock-off shifts as hidden-time badges", () => {
    expect(
      buildScheduleShiftEditorInitialValue({
        state: {
          mode: "create",
          locationId: model.locations[0]!.id,
          employeeId: null,
          date: "2026-08-18",
          preset: {
            jobId: model.jobs[0]!.id,
            shiftTypeId: model.shift_types[1]!.id,
            startTime: null,
            endTime: null,
          },
        },
        model,
      }).hide_time_on_badge,
    ).toBe(true);
  });

  it("applies selected shift type defaults and clock-off fallback ranges", () => {
    const value: ScheduleShiftMutationInput = {
      location_id: model.locations[0]!.id,
      employee_id: null,
      job_id: model.jobs[0]!.id,
      shift_type_id: null,
      scheduled_date: "2026-08-17",
      start_time: "09:00",
      end_time: "17:00",
      unpaid_break_minutes: 30,
      hide_time_on_badge: false,
      label_ids: [],
      label_names: [],
      note: "",
    };

    expect(
      applyScheduleShiftTypeDefaults({
        value,
        shiftType: model.shift_types[0],
        shiftTypeId: model.shift_types[0]!.id,
        clockOffFallbackStartTime: "",
        clockOffFallbackEndTime: "",
      }),
    ).toEqual(
      expect.objectContaining({
        start_time: "16:00",
        end_time: "22:00",
        hide_time_on_badge: false,
      }),
    );

    expect(
      applyScheduleShiftTypeDefaults({
        value,
        shiftType: model.shift_types[1],
        shiftTypeId: model.shift_types[1]!.id,
        clockOffFallbackStartTime: "",
        clockOffFallbackEndTime: "",
      }),
    ).toEqual(
      expect.objectContaining({
        start_time: "",
        end_time: "",
        hide_time_on_badge: true,
        time_basis: "explicit",
      }),
    );
  });
});

describe("the job a new shift starts with (BL-218)", () => {
  const management = "d0000000-0000-4000-8000-000000000001";
  const kitchen = "d0000000-0000-4000-8000-000000000002";
  // Real order: setup makes Owner first (sort_order 0).
  const ownerJob = { id: "0f000000-0000-4000-8000-000000000001", name: "Owner", color: "#4478A8", sort_order: 0, department_id: management, system_key: "owner" as const };
  const cook = { id: "00000000-0000-4000-8000-00000000000c", name: "Cook", color: "#D39A36", sort_order: 1, department_id: kitchen, system_key: null };
  const manager = { id: "0f000000-0000-4000-8000-000000000002", name: "Manager", color: "#4478A8", sort_order: 2, department_id: management, system_key: null };
  // Archived: still in job_ids, gone from the Schedule's job list.
  const archivedId = "00000000-0000-4000-8000-000000000001";
  const person = (id: string, jobIds: string[], primary: string | null) => ({
    id, employee_code: id.slice(-4), display_name: id, location_ids: [model.locations[0]!.id], job_ids: jobIds, primary_job_id: primary,
  });
  const bl218: ScheduleReadModel = {
    ...model,
    departments: [
      { id: kitchen, name: "Kitchen", color: "#3C7A68", sort_order: 0, system_key: null },
      { id: management, name: "Leadership", color: "#3C7A68", sort_order: 1, system_key: "management" },
    ],
    jobs: [ownerJob, cook, manager],
    employees: [
      person("e0000000-0000-4000-8000-000000000001", [ownerJob.id], null),
      person("e0000000-0000-4000-8000-000000000002", [cook.id, manager.id], null),
      person("e0000000-0000-4000-8000-000000000003", [archivedId, manager.id], null),
      person("e0000000-0000-4000-8000-000000000004", [cook.id, manager.id], cook.id),
    ],
  };
  const jobFor = (employeeId: string | null) =>
    buildScheduleShiftEditorInitialValue({
      state: { mode: "create", locationId: model.locations[0]!.id, employeeId, date: "2026-08-18" },
      model: bl218,
    }).job_id;

  it("is the row's job: the primary outside Management, else their first Management job", () => {
    expect(jobFor(bl218.employees[0]!.id)).toBe(ownerJob.id); // the owner who only works Owner
    expect(jobFor(bl218.employees[1]!.id)).toBe(manager.id); // no primary: Management, not Cook
    expect(jobFor(bl218.employees[2]!.id)).toBe(manager.id); // never an archived job
    expect(jobFor(bl218.employees[3]!.id)).toBe(cook.id);
  });

  it("never starts the unassigned row on Owner, which only the owner works", () => {
    expect(jobFor(null)).toBe(cook.id);
    expect(
      buildScheduleShiftEditorInitialValue({
        state: { mode: "create", locationId: model.locations[0]!.id, employeeId: null, date: "2026-08-18" },
        model: { ...bl218, jobs: [ownerJob] },
      }).job_id,
    ).toBe("");
  });
});
