import { describe, expect, it } from "vitest";
import type { ScheduleReadModel, ScheduleShift } from "@newfork/shared/schedule";
import { createScheduleExportSnapshot, exportShiftLines, type ExportGridDisplay } from "./snapshot";

const display: ExportGridDisplay = {
  layout: "unified", employeeSortMode: "alphabetical", hideUnscheduled: false,
  showShiftType: true, showShiftLabels: true, showClockTimes: true,
  showUnassignedShifts: true, showRoleSeparators: true, showTotalHours: false,
};
function shift(id: string, overrides: Partial<ScheduleShift> = {}): ScheduleShift {
  return { id, location_id: "loc-a", employee_id: "person-a", job_id: "job",
    shift_type_id: "type", scheduled_date: "2026-09-14", start_time: "09:00",
    end_time: "13:00", crosses_midnight: false, unpaid_break_minutes: 0,
    hide_time_on_badge: false, label_ids: [], label_names: ["Training", "Opening", "Extra"],
    note: "PRIVATE NOTE", warning_codes: [], ...overrides };
}
function model(): ScheduleReadModel {
  return {
    workspace_id: "workspace-a", week_start: "2026-09-14", week_start_day: "monday",
    settings: { time_format: "24h" }, departments: [], closures: [], important_dates: [],
    locations: ["a", "b"].map((id, index) => ({ id: `loc-${id}`, name: `Location ${id}`,
      short_name: id === "a" ? "MRK" : "SHL", timezone: "America/Los_Angeles",
      sort_order: index, publication_status: "published", published_at: null })),
    jobs: [{ id: "job", name: "Server", color: "#123456", sort_order: 0, department_id: null , system_key: null}],
    shift_types: [{ id: "type", name: "AM", color: "#aabbcc", sort_order: 0,
      default_start_time: "09:00", default_end_time: "13:00" }],
    employees: ["a", "b"].map(id => ({ id: `person-${id}`, display_name: "Same Name",
      employee_code: id, location_ids: ["loc-a", "loc-b"], job_ids: ["job"],
      primary_job_id: "job", is_excluded_from_schedule: false, availability: [] })),
    shifts: [shift("later", { start_time: "15:00", end_time: "18:00", location_id: "loc-b" }),
      shift("early"), shift("next-day", { scheduled_date: "2026-09-15", employee_id: "person-b" })],
  };
}
function input() {
  return { mode: "preview" as const, loading: false, requestedSourceKey: "draft:one:1",
    resolvedSourceKey: "draft:one:1", source: { kind: "draft" as const, id: "one", revision: 1, name: "My draft" },
    model: model(), workspaceName: "Workspace", selectedDate: "2026-09-14", view: "week" as const,
    search: new URLSearchParams(), display, focusedShiftId: null };
}
function ready(value = input()) {
  const result = createScheduleExportSnapshot(value);
  if (result.status !== "ready") throw new Error(result.reason);
  return result.snapshot;
}

describe("Export v2 immutable preview projection", () => {
  it("shares the approved badge line order across output formats", () => {
    const shift = ready().shifts[0]!;
    expect(exportShiftLines(shift, true)).toEqual(["AM-Server", "Training · Opening · Extra", "@Location a", "09:00 - 13:00"]);
    expect(exportShiftLines(shift, false)).toEqual(["AM-Server", "Training · Opening · Extra", "09:00 - 13:00"]);
    expect(exportShiftLines({ ...shift, ghost: true }, false)).toEqual(["Reference: AM-Server", "Training · Opening · Extra", "@Location a", "09:00 - 13:00"]);
    expect(exportShiftLines({ ...shift, label: null, time: null }, true)).toEqual(["AM-Server", "@Location a"]);
  });
  it("keeps both same-name employees, every day and multiple shifts across locations", () => {
    const result = ready();
    expect(result.rows.map(row => row.id)).toEqual(["person-a", "person-b"]);
    expect(result.shifts.map(item => item.id)).toEqual(["early", "next-day", "later"]);
    expect(result.dates).toHaveLength(7);
    expect(result.filename).toBe("MRK_SHL_2026-09-14_2026-09-20");
    expect(result.shifts[0]).toMatchObject({ title: "AM-Server", label: "Training · Opening · Extra", color: "#aabbcc" });
  });
  it("uses the current grid's location/employee filters and daily date", () => {
    const result = createScheduleExportSnapshot({ ...input(), view: "day",
      search: new URLSearchParams("locations=loc-b&employees=person-a") });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.snapshot.shifts.map(item => item.id)).toEqual(["later"]);
    expect(result.snapshot.filename).toBe("SHL_2026-09-14");
    expect(result.snapshot.rows).toHaveLength(1);
  });
  it("does not expose hidden clock/type/label data or private source fields", () => {
    const result = ready({ ...input(), display: { ...display, showShiftType: false, showShiftLabels: false, showClockTimes: false } });
    expect(result.shifts[0]).toMatchObject({ title: "Server", shiftType: null, label: null, start: null, end: null, time: null, overnight: null });
    expect(JSON.stringify(result)).not.toContain("PRIVATE NOTE");
    expect(JSON.stringify(result)).not.toContain("availability");
  });
  it("honors individual hidden clocks and grid badge ordering", () => {
    const value = input();
    value.model.shifts[0] = shift("hidden", { hide_time_on_badge: true, start_time: "23:00" });
    expect(ready(value).shifts.find(item => item.id === "hidden")).toMatchObject({ time: null, start: null, end: null });
  });
  it.each([
    [{ mode: "edit" as const }, "edit"],
    [{ loading: true }, "loading"],
    [{ resolvedSourceKey: "draft:previous:4" }, "source"],
    [{ source: null }, "source"],
  ])("blocks unsafe preview state %j", (override, reason) => {
    expect(createScheduleExportSnapshot({ ...input(), ...override })).toEqual({ status: "blocked", reason });
  });
  it("blocks missing scoped short names but not filtered-out locations", () => {
    const value = input();
    delete value.model.locations[1]!.short_name;
    expect(createScheduleExportSnapshot(value)).toEqual({ status: "blocked", reason: "short_names", locationNames: ["Location b"] });
    value.search.set("locations", "loc-a");
    expect(createScheduleExportSnapshot(value).status).toBe("ready");
  });
  it("does not freeze or retain mutable source references", () => {
    const value = input();
    const first = ready(value);
    value.source.name = "Renamed";
    value.model.employees[0]!.display_name = "Changed";
    value.model.shifts[0]!.label_names!.push("Changed");
    expect(first.source).toMatchObject({ name: "My draft" });
    expect(first.rows[0]!.name).toBe("Same Name");
    expect(Object.isFrozen(first.shifts[0])).toBe(true);
    expect(Object.isFrozen(value.model)).toBe(false);
    expect(ready(value).rows.some(row => row.name === "Changed")).toBe(true);
  });
  it("new preview becomes the source without altering an already captured snapshot", () => {
    const first = ready();
    const result = createScheduleExportSnapshot({ ...input(), requestedSourceKey: "published", resolvedSourceKey: "published", source: { kind: "published" } });
    expect(result.status === "ready" && result.snapshot.source.kind).toBe("published");
    expect(first.source.kind).toBe("draft");
  });
  it("supports an empty saved schedule and unassigned visibility", () => {
    const value = input();
    value.model.shifts = [];
    expect(ready(value).shifts).toEqual([]);
    value.model.shifts = [shift("open", { employee_id: null })];
    expect(ready(value).rows[0]!.id).toBeNull();
    expect(ready({ ...value, display: { ...display, showUnassignedShifts: false } }).shifts).toEqual([]);
  });
  it("preserves separate-grid ghost references without placing them in the assigned/Data shift collection", () => {
    const value = { ...input(), display: { ...display, layout: "separate" as const } };
    value.search.set("locations", "loc-a");
    const result = ready(value);
    expect(result.shifts.map(shift => shift.id)).not.toContain("later");
    expect(result.ghosts).toEqual([expect.objectContaining({ id: "later", locationId: "loc-a", sourceLocationId: "loc-b", location: "Location b", ghost: true })]);
    expect(ready().ghosts).toEqual([]);
    expect(ready({ ...value, display: { ...value.display, showClockTimes: false } }).ghosts?.[0]?.start).toBeNull();
  });
  it("keeps ghosts from locations outside the actor's scope out of the export (T3)", () => {
    // Mina manages only Kadikoy; Ali also works at Besiktas, which she cannot see.
    const value = { ...input(), display: { ...display, layout: "separate" as const } };
    value.model.locations = [{ ...value.model.locations[0]!, name: "Kadikoy" }];
    value.model.shifts = [shift("kadikoy")];
    value.model.ghost_shifts = [{ id: "besiktas", employee_id: "person-a", location_id: "loc-besiktas",
      location_name: "Besiktas", scheduled_date: "2026-09-14", start_time: "15:00", end_time: "18:00", crosses_midnight: false,
      job_id: "job-bar", job_name: "Bartender", shift_type_id: null, shift_type_name: null, label_ids: [], label_names: ["On call"] }];
    const result = ready(value);
    expect(result.shifts.map(item => item.id)).toEqual(["kadikoy"]);
    expect(result.ghosts).toEqual([]);
    expect(result.locations.map(location => location.name)).toEqual(["Kadikoy"]);
    expect(JSON.stringify(result)).not.toContain("Besiktas");
    expect(JSON.stringify(result)).not.toContain("Bartender");
  });
  it("projects current total comparisons, all-day/partial closures and deduplicated important dates", () => {
    const value = input();
    value.display = { ...display, showTotalHours: true };
    value.search.set("locations", "loc-a");
    value.model.closures = [{ id: "closed", location_id: "loc-a", closed_date: "2026-09-14", end_date: null, title: "Maintenance", is_all_day: true, shift_type_ids: [] }];
    value.model.important_dates = [{ id: "special", location_id: null, title: "Opening", type: "event", starts_on: "2026-09-14", ends_on: "2026-09-14", recurrence: "none" }];
    const result = ready(value);
    expect(result.totals?.week).toBe("8h / 11h");
    expect(result.rows[0]?.total).toBe("4h / 7h");
    expect(result.dayDecorations?.find(day => day.locationId === null && day.date === "2026-09-14")).toMatchObject({ closed: true, lines: ["Closed: Maintenance", "event: Opening"] });
    expect(ready({ ...value, display }).totals).toBeUndefined();
  });
});
