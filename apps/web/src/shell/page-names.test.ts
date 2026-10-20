import { describe, expect, it } from "vitest";
import { pageName } from "./page-names";

describe("pageName", () => {
  it.each([
    ["/app/workspace", "Home"],
    ["/app/schedule", "Schedule"],
    ["/app/schedule/export", "Schedule"],
    ["/app/schedule/lineup", "Lineup"],
    ["/app/employees", "Employees"],
    ["/app/employees/documents", "Documents"],
    ["/app/settings/locations", "Locations"],
    ["/app/settings/scheduling/shift-types", "Shift types"],
    ["/app/settings/roles", "Roles & permissions"],
  ])("%s is %s", (path, name) => {
    expect(pageName(path)).toBe(name);
  });

  it("falls back to 'this page'", () => {
    expect(pageName("/app/unknown")).toBe("this page");
  });
});
