import type { TimeOffRequest } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import { alsoOffDays, alsoOffThese } from "./time-off-overlap";

function request(id: string, employee: string, start: string, end: string, extra: Partial<TimeOffRequest> = {}): TimeOffRequest {
  return {
    id, employee_id: employee, employee_name: `${employee} Person`, request_type: "time_off", reason: "", status: "approved",
    start_date: start, end_date: end, revision: 1, created_at: "2026-10-01T09:00:00Z", decide_by: null, conflict_count: 0,
    segments: [], events: [], progress: null, ...extra,
  } as TimeOffRequest;
}

// Mert, 2026-10-11: the time off drawer says who else is already off.
describe("alsoOffThese", () => {
  const ethan = request("e", "Ethan", "2026-10-13", "2026-10-14", { status: "pending" });

  it("lists other people's approved time off on the asked days, only the overlapping days", () => {
    const rows = alsoOffThese(ethan, [
      ethan,
      request("m", "Maria", "2026-10-14", "2026-10-20"),
      request("j", "Jake", "2026-10-10", "2026-10-13"),
    ]);
    expect(rows.map((row) => [row.name, alsoOffDays(row)])).toEqual([["Jake Person", "Oct 13"], ["Maria Person", "Oct 14"]]);
  });

  it("leaves out pending, denied and cancellation requests, days that do not touch, and the asker's own time off", () => {
    expect(alsoOffThese(ethan, [
      request("p", "Pia", "2026-10-13", "2026-10-13", { status: "pending" }),
      request("d", "Dan", "2026-10-13", "2026-10-13", { status: "denied" }),
      request("c", "Cem", "2026-10-13", "2026-10-13", { request_type: "time_off_cancellation" }),
      request("l", "Lea", "2026-10-15", "2026-10-16"),
      request("own", "Ethan", "2026-10-13", "2026-10-13"),
    ])).toEqual([]);
  });

  it("gives one person one line, keeping days apart that are apart", () => {
    // Maria works Oct 14: the line must not say she is off then.
    const rows = alsoOffThese(request("x", "Ethan", "2026-10-13", "2026-10-16", { status: "pending" }), [
      request("a", "Maria", "2026-10-15", "2026-10-15"),
      request("b", "Maria", "2026-10-13", "2026-10-13"),
    ]);
    expect(rows.map(alsoOffDays)).toEqual(["Oct 13, Oct 15"]);
  });

  it("joins one person's days that run on", () => {
    const rows = alsoOffThese(request("x", "Ethan", "2026-10-13", "2026-10-16", { status: "pending" }), [
      request("a", "Maria", "2026-10-14", "2026-10-15"),
      request("b", "Maria", "2026-10-13", "2026-10-13"),
    ]);
    expect(rows.map(alsoOffDays)).toEqual(["Oct 13 – Oct 15"]);
  });
});
