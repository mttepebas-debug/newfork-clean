import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import { filterScheduleModel } from "./scheduleFilterModel";
import { scheduleSearchTerm, searchScheduleModel } from "./scheduleSearch";

const shift = (
  id: string,
  employee_id: string | null,
  job_id: string,
  shift_type_id: string | null,
  scheduled_date = "2026-10-19",
  location_id = "loc-1",
) => ({ id, employee_id, job_id, shift_type_id, scheduled_date, location_id });

const model = {
  locations: [
    { id: "loc-1", name: "Main Dining", publication_status: "published" },
    { id: "loc-2", name: "Patio", publication_status: "published" },
  ],
  shift_types: [
    { id: "type-dinner", name: "Dinner", color: "#123456" },
    { id: "type-lunch", name: "Lunch", color: "#abcdef" },
  ],
  jobs: [
    { id: "job-server", name: "Server", color: "#f97316" },
    { id: "job-host", name: "Host", color: "#22c55e" },
  ],
  employees: [
    { id: "ali", display_name: "Ali Kaya", job_ids: ["job-server", "job-host"], location_ids: ["loc-1"], shift_type_ids: [] },
    { id: "ayse", display_name: "Ayşe Demir", job_ids: ["job-host"], location_ids: ["loc-1"], shift_type_ids: [] },
    { id: "emre", display_name: "Emre Hosten", job_ids: ["job-server"], location_ids: ["loc-2"], shift_type_ids: [] },
  ],
  shifts: [
    shift("ali-server", "ali", "job-server", "type-dinner"),
    shift("ali-host", "ali", "job-host", "type-lunch", "2026-10-20"),
    shift("ayse-host", "ayse", "job-host", "type-lunch"),
    shift("emre-server", "emre", "job-server", null, "2026-10-19", "loc-2"),
    shift("open-server", null, "job-server", "type-lunch"),
    shift("open-host", null, "job-host", null),
  ],
  closures: [],
  important_dates: [],
} as unknown as ScheduleReadModel;

const ids = (items: readonly { readonly id: string }[]) => items.map((item) => item.id);

describe("searchScheduleModel (S-228)", () => {
  it("changes nothing without a term", () => {
    const result = searchScheduleModel(model, "  ");
    expect(result.model).toBe(model);
    expect(result.marks.size).toBe(0);
  });

  it("keeps a person whose name matches, with every shift and no marks", () => {
    const result = searchScheduleModel(model, "ayşe");
    expect(ids(result.model.employees)).toEqual(["ayse"]);
    expect(ids(result.model.shifts)).toEqual(["ayse-host"]);
    expect(result.marks.size).toBe(0);
  });

  it("keeps the people with a shift whose job matches, framing those cards and fading the rest", () => {
    const result = searchScheduleModel(model, "SERVER");
    expect(ids(result.model.employees)).toEqual(["ali", "emre"]);
    expect(ids(result.model.shifts)).toEqual(["ali-server", "ali-host", "emre-server", "open-server"]);
    expect(Object.fromEntries(result.marks)).toEqual({
      "ali-server": "match",
      "ali-host": "dim",
      "emre-server": "match",
      "open-server": "match",
    });
  });

  it("matches a shift type name the same way", () => {
    const result = searchScheduleModel(model, "lunch");
    expect(ids(result.model.employees)).toEqual(["ali", "ayse"]);
    expect(result.marks.get("ali-host")).toBe("match");
    expect(result.marks.get("ali-server")).toBe("dim");
    expect(result.marks.get("ayse-host")).toBe("match");
  });

  it("does not fade the cards of a person whose own name matches", () => {
    // "host" is Emre's name and a job: his server card stays plain.
    const result = searchScheduleModel(model, "host");
    expect(ids(result.model.employees)).toEqual(["ali", "ayse", "emre"]);
    expect(result.marks.get("emre-server")).toBeUndefined();
    expect(result.marks.get("ali-server")).toBe("dim");
    expect(result.marks.get("ali-host")).toBe("match");
  });

  it("counts only the shown day in day view", () => {
    // Ali's lunch is on the 20th; on the 19th only Ayşe has one.
    const result = searchScheduleModel(model, "lunch", { day: "2026-10-19" });
    expect(ids(result.model.employees)).toEqual(["ayse"]);
  });

  it("works with the filters: both must match", () => {
    const filtered = filterScheduleModel(model, new URLSearchParams({ locations: "loc-1" }));
    const result = searchScheduleModel(filtered, "emre");
    expect(result.model.employees).toEqual([]);
    expect(ids(searchScheduleModel(filtered, "server").model.employees)).toEqual(["ali"]);
  });

  it("reads the term from ?q=, trimmed", () => {
    expect(scheduleSearchTerm(new URLSearchParams({ q: "  ali " }))).toBe("ali");
    expect(scheduleSearchTerm(new URLSearchParams())).toBe("");
  });
});
