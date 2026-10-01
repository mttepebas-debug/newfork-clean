import { describe, expect, it } from "vitest";

import {
  formatSchedulePasteConflictContext,
  scheduleJobName,
  scheduleShiftTypeOf,
} from "./scheduleCatalogNames";

const liveJob = { id: "10000000-0000-4000-8000-000000000001", name: "Server", color: "#4478A8", sort_order: 0, department_id: null, system_key: null };
const liveType = { id: "20000000-0000-4000-8000-000000000001", name: "Dinner", color: "#A84478", sort_order: 0, default_start_time: null, default_end_time: null };
const archivedJob = { id: "10000000-0000-4000-8000-000000000002", name: "Line Cook" };
const archivedType = { id: "20000000-0000-4000-8000-000000000002", name: "Brunch" };
const unknownId = "90000000-0000-4000-8000-000000000009";

const catalog = {
  jobs: [liveJob],
  shift_types: [liveType],
  referenced_jobs: [archivedJob],
  referenced_shift_types: [archivedType],
};

describe("schedule catalog names (K8)", () => {
  it("names a live job from the list and an archived one from the referenced list", () => {
    expect(scheduleJobName(catalog, liveJob.id)).toBe("Server");
    expect(scheduleJobName(catalog, archivedJob.id)).toBe("Line Cook");
  });

  it("knows no name for an id in neither list, so the caller's fallback stays", () => {
    expect(scheduleJobName(catalog, unknownId)).toBeUndefined();
    expect(scheduleShiftTypeOf(catalog, unknownId)).toBeUndefined();
  });

  it("gives a live type with its color and an archived type by name only", () => {
    expect(scheduleShiftTypeOf(catalog, liveType.id)).toEqual(liveType);
    expect(scheduleShiftTypeOf(catalog, archivedType.id)).toEqual(archivedType);
    expect(scheduleShiftTypeOf(catalog, null)).toBeUndefined();
  });

  it("names an archived job and type in the paste conflict window, and falls back only for unknown ids", () => {
    const model = {
      ...catalog,
      employees: [{ id: "30000000-0000-4000-8000-000000000001", display_name: "Ayse" }],
      locations: [{ id: "40000000-0000-4000-8000-000000000001", name: "Moda" }],
    };
    const target = { employeeId: "30000000-0000-4000-8000-000000000001", locationId: "40000000-0000-4000-8000-000000000001", date: "2026-09-21" };
    expect(
      formatSchedulePasteConflictContext(model, {
        ...target,
        snapshot: { job_id: archivedJob.id, shift_type_id: archivedType.id },
      }),
    ).toBe("Brunch / Line Cook / Ayse / Moda / 2026-09-21");
    expect(
      formatSchedulePasteConflictContext(model, {
        employeeId: null,
        locationId: unknownId,
        date: "2026-09-21",
        snapshot: { job_id: unknownId, shift_type_id: unknownId },
      }),
    ).toBe("Shift / Job / Open shift / Selected location / 2026-09-21");
  });
});
