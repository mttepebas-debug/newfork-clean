import { describe, expect, it } from "vitest";

import {
  canExportSchedule,
  filterScheduleExportEmployees,
  filterScheduleExportIds,
  filterScheduleExportLocations,
} from "./exportAccess";

const locations = [
  { id: "loc-1", name: "Main Dining" },
  { id: "loc-2", name: "Patio" },
];

const employees = [
  { id: "emp-1", location_ids: ["loc-1"] },
  { id: "emp-2", location_ids: ["loc-2"] },
];

describe("schedule export access helpers", () => {
  it("keeps all export scope options when the schedule export permission exists", () => {
    const permissions = ["schedule.export"] as const;

    expect(canExportSchedule(permissions)).toBe(true);
    expect(filterScheduleExportLocations(locations, permissions)).toEqual(
      locations,
    );
    expect(filterScheduleExportEmployees(employees, permissions)).toEqual(
      employees,
    );
    expect(filterScheduleExportIds(["loc-1", "loc-2"], locations, permissions))
      .toEqual(["loc-1", "loc-2"]);
  });

  it("removes export scope options without schedule export permission", () => {
    const permissions = ["schedule.read"] as const;

    expect(canExportSchedule(permissions)).toBe(false);
    expect(filterScheduleExportLocations(locations, permissions)).toEqual([]);
    expect(filterScheduleExportEmployees(employees, permissions)).toEqual([]);
    expect(filterScheduleExportIds(["loc-1", "loc-2"], locations, permissions))
      .toEqual([]);
  });
});
