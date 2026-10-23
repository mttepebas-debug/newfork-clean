import type { ExchangeCase, TimeOffDeciderView } from "@newfork/shared";
import { describe, expect, it } from "vitest";

import { RequestError } from "../lib/request-error";
import {
  openCounts,
  pageOf,
  readRequestsParams,
  requestFailureKind,
  requestRows,
  requestTypesFor,
} from "./requests-list";

// EKRAN-02 (K-S8 – K-S10; KARARLAR Schedule → Requests, Ek 2026-10-07): Requests
// is one list. Time off and shift changes are read from their own lists and
// joined here: open requests first, then closed ones; the tabs are request types.

const kadikoy = "22222222-2222-4222-8222-222222222222";
const besiktas = "33333333-3333-4333-8333-333333333333";

// D7: a request of the new time off, as the answerers' list sends it.
function timeOff(id: string, startsAt: string, change: Partial<TimeOffDeciderView> = {}): TimeOffDeciderView {
  return {
    id, kind: "leave", kind_of_leave: "vacation", status: "pending", starts_at: startsAt, ends_at: "2026-11-30T12:00:00Z", all_day: true,
    time_timezone: "America/Los_Angeles", start_date: startsAt.slice(0, 10), end_date: "2026-11-30", start_time: null, end_time: null,
    note: null, revision: 1, created_at: "2026-10-01T09:00:00Z", decided_at: null, decided_by_name: null, decision_note: null,
    ended_at: null, ended_note: null, cancels_id: null, ended_by_name: null, used_until: null, cancellation: null, added_by_name: null,
    employee_id: "44444444-4444-4444-8444-444444444444", employee_name: "Ali Person", location_names: ["Kadikoy"], shifts_opened: 0,
    ...change,
  };
}

function exchange(id: string, kind: ExchangeCase["kind"], stage: ExchangeCase["stage"], expiresAt: string, extra: Partial<ExchangeCase> = {}): ExchangeCase {
  return {
    id, kind, audience: "eligible_pool", status: stage === "closed" ? "completed" : "open", stage, revision: 1,
    created_at: "2026-10-01T09:00:00Z", expires_at: expiresAt, owner_id: "15000000-0000-4000-8000-0000000000e1", owner_name: "Emre Person",
    shift: { location_id: kadikoy, employee_name: "Emre Person" }, requested_shift: null, applications: [],
    candidate_count: 0, can_manage: true, is_owner: false, history: [], ...extra,
  } as ExchangeCase;
}

function closedTimeOff(id: string, status: TimeOffDeciderView["status"], decidedAt: string): TimeOffDeciderView {
  return timeOff(id, "2026-10-13T07:00:00Z", { status, decided_at: decidedAt, decided_by_name: "Ayse Person" });
}

const all = { type: "all" as const, locationId: "", search: "" };
// The list is read at this moment; every time off below starts after it unless it says otherwise.
const now = new Date("2026-10-01T12:00:00Z");

describe("requestRows", () => {
  // D7: time off has one answer from whoever may give it, so time off waiting is the reader's to decide.
  it("marks what the reader decides Needs review and what waits on somebody else In progress", () => {
    const rows = requestRows(
      [timeOff("t-mine", "2026-10-10T12:00:00Z")],
      [
        exchange("x-ready", "swap", "ready_for_manager", "2026-10-09T12:00:00Z"),
        exchange("x-not-mine", "cover", "ready_for_manager", "2026-10-14T12:00:00Z", { can_manage: false }),
      ],
      all,
      now,
    );
    expect(rows.map((row) => [row.id, row.state])).toEqual([
      ["x-ready", "needs_review"],
      ["t-mine", "needs_review"],
      ["x-not-mine", "in_progress"],
    ]);
  });

  // Time off waits until it starts; a cancellation until the time off ends (D6).
  it("decides time off by its start and a cancellation by the time off's end; one past it is closed", () => {
    const rows = requestRows(
      [
        timeOff("t-cancel", "2026-09-20T07:00:00Z", { kind: "cancel", ends_at: "2026-10-05T07:00:00Z" }),
        timeOff("t-started", "2026-09-30T07:00:00Z"),
      ],
      [],
      all,
      now,
    );
    expect(rows.map((row) => [row.id, row.state, row.decideBy])).toEqual([
      ["t-cancel", "needs_review", "2026-10-05T07:00:00Z"],
      ["t-started", "closed", null],
    ]);
  });

  it("orders open requests by Decide by, nearest first", () => {
    const rows = requestRows(
      [timeOff("t-late", "2026-10-20T12:00:00Z"), timeOff("t-mid", "2026-10-12T12:00:00Z")],
      [exchange("x-soon", "swap", "ready_for_manager", "2026-10-09T12:00:00Z")],
      all,
      now,
    );
    expect(rows.map((row) => row.id)).toEqual(["x-soon", "t-mid", "t-late"]);
  });

  // Times are compared as instants, whatever offset the API writes them with.
  it("orders Decide by as instants, not as text", () => {
    const rows = requestRows(
      [timeOff("t-istanbul", "2026-10-13T12:00:00+03:00")],
      [exchange("x-utc", "swap", "ready_for_manager", "2026-10-13T10:00:00Z")],
      all,
      now,
    );
    expect(rows.map((row) => row.id)).toEqual(["t-istanbul", "x-utc"]);
  });

  // KARARLAR Schedule → Requests, Ek 2026-10-07: one list, no status tabs.
  it("lists closed requests under the open ones, the newest decision first", () => {
    const rows = requestRows(
      [
        closedTimeOff("t-old", "approved", "2026-09-22T09:00:00Z"),
        timeOff("t-open", "2026-10-30T12:00:00Z"),
        closedTimeOff("t-new", "declined", "2026-10-01T11:00:00Z"),
      ],
      [
        exchange("x-closed", "cover", "closed", "2026-10-08T12:00:00Z", {
          history: [{ id: "88888888-8888-4888-8888-888888888888", action: "completed", created_at: "2026-10-01T10:00:00Z", message: "" }],
        }),
      ],
      all,
      now,
    );
    expect(rows.map((row) => [row.id, row.state])).toEqual([
      ["t-open", "needs_review"],
      ["t-new", "closed"],
      ["x-closed", "closed"],
      ["t-old", "closed"],
    ]);
  });

  it("keeps only the chosen tab, open and closed; shift changes are every swap, cover and pickup", () => {
    const rows = requestRows(
      [timeOff("t", "2026-10-10T12:00:00Z")],
      [
        exchange("s", "swap", "ready_for_manager", "2026-10-10T12:00:00Z"),
        exchange("s-done", "swap", "closed", "2026-10-01T12:00:00Z"),
        exchange("o", "cover", "ready_for_manager", "2026-10-10T12:00:00Z"),
      ],
      { ...all, type: "shift_changes" },
      now,
    );
    expect(rows.map((row) => row.id)).toEqual(["s", "o", "s-done"]);
  });

  // Mert, 2026-10-18: a shift change reaches the table only when somebody wants
  // the shift and a manager has to decide. A release nobody asks for (nobody yet,
  // the only asker withdrew, or the manager declined them) stays an open shift
  // off the table; a request that closed without a decision leaves quietly.
  it("lists a shift change only while somebody waits for a decision, and how it ended", () => {
    const person = (status: string) => ({ id: `a-${status}`, employee_id: "e", employee_name: "Ali Person", status, created_at: "2026-10-01T10:00:00Z", reason: "", eligibility: null });
    const rows = requestRows(
      [],
      [
        exchange("asked", "cover", "ready_for_manager", "2026-10-10T12:00:00Z", { applications: [person("pending_manager")] as ExchangeCase["applications"] }),
        exchange("nobody", "cover", "seeking_candidates", "2026-10-10T12:00:00Z"),
        exchange("withdrew", "cover", "seeking_candidates", "2026-10-10T12:00:00Z", { applications: [person("withdrawn")] as ExchangeCase["applications"] }),
        exchange("declined-one", "cover", "seeking_candidates", "2026-10-10T12:00:00Z", { applications: [person("rejected_by_manager")] as ExchangeCase["applications"] }),
        exchange("peer", "swap", "awaiting_peer", "2026-10-10T12:00:00Z", { audience: "direct" }),
        exchange("half", "swap", "awaiting_other_manager", "2026-10-10T12:00:00Z", { audience: "direct" }),
        exchange("taken-back", "cover", "closed", "2026-10-08T12:00:00Z", { status: "cancelled", applications: [person("rejected_by_manager")] as ExchangeCase["applications"] }),
        exchange("changed", "cover", "closed", "2026-10-08T12:00:00Z", { status: "invalidated" }),
        exchange("refused", "cover", "closed", "2026-10-08T12:00:00Z", { status: "cancelled", audience: "direct", applications: [person("rejected_by_manager")] as ExchangeCase["applications"] }),
        exchange("ran-out", "cover", "closed", "2026-10-08T12:00:00Z", { status: "expired" }),
        exchange("done", "cover", "closed", "2026-10-08T12:00:00Z"),
      ],
      all,
    );
    expect(rows.map((row) => row.id).sort()).toEqual(["asked", "done", "half", "ran-out", "refused"]);
  });

  it("filters shift changes by location, either side of a swap, and by a name", () => {
    const cases = [
      exchange("k", "cover", "ready_for_manager", "2026-10-10T12:00:00Z"),
      exchange("b", "swap", "ready_for_manager", "2026-10-11T12:00:00Z", {
        shift: { location_id: kadikoy, employee_name: "Deniz Person" } as ExchangeCase["shift"],
        requested_shift: { location_id: besiktas, employee_name: "Zeynep Person" } as ExchangeCase["shift"],
        owner_name: "Deniz Person",
      }),
      exchange("e", "cover", "ready_for_manager", "2026-10-12T12:00:00Z", {
        shift: { location_id: kadikoy, employee_name: "Emre Person" } as ExchangeCase["shift"],
      }),
    ];
    expect(requestRows([], cases, { ...all, locationId: besiktas }).map((row) => row.id)).toEqual(["b"]);
    expect(requestRows([], cases, { ...all, search: "  zEYNep " }).map((row) => row.id)).toEqual(["b"]);
  });
});

describe("openCounts", () => {
  // Mert, 2026-10-11: two tabs, Time off and every shift change together.
  it("counts the open requests of each tab and of All; closed ones are not counted", () => {
    const rows = requestRows(
      [timeOff("t", "2026-10-10T12:00:00Z"), closedTimeOff("t-done", "approved", "2026-09-22T09:00:00Z")],
      [
        exchange("s", "swap", "ready_for_manager", "2026-10-10T12:00:00Z"),
        exchange("c", "cover", "ready_for_manager", "2026-10-11T12:00:00Z"),
        exchange("c-done", "cover", "closed", "2026-10-01T12:00:00Z"),
      ],
      all,
      now,
    );
    expect(openCounts(rows)).toEqual({ all: 3, time_off: 1, shift_changes: 2 });
  });
});

describe("requestTypesFor", () => {
  it("offers only the request types the reader may read", () => {
    expect(requestTypesFor({ timeOff: true, shiftChanges: false })).toEqual(["time_off"]);
    expect(requestTypesFor({ timeOff: false, shiftChanges: true })).toEqual(["swap", "cover"]);
  });
});

describe("readRequestsParams", () => {
  const allowed = ["time_off", "swap", "cover"] as const;

  it("reads the request type tab and the page from the address, All and 50 rows by default", () => {
    expect(readRequestsParams(new URLSearchParams("type=shift_changes&page=2&size=25"), [...allowed])).toEqual({ type: "shift_changes", page: 2, pageSize: 25 });
    expect(readRequestsParams(new URLSearchParams(""), [...allowed])).toEqual({ type: "all", page: 1, pageSize: 50 });
  });

  it("lands an old one-type address (?type=swap, cover) on the shift changes tab", () => {
    for (const type of ["swap", "cover"])
      expect(readRequestsParams(new URLSearchParams(`type=${type}`), [...allowed]).type).toBe("shift_changes");
  });

  it("ignores what the address cannot ask for: a type the reader may not read, an odd page size", () => {
    expect(readRequestsParams(new URLSearchParams("type=time_off&page=-3&size=30"), ["swap", "cover"])).toEqual({
      type: "all", page: 1, pageSize: 50,
    });
  });
});

describe("pageOf", () => {
  const rows = Array.from({ length: 120 }, (_, index) => index);

  it("cuts the list into pages and counts them", () => {
    expect(pageOf(rows, 3, 50)).toEqual({ rows: rows.slice(100), page: 3, pageCount: 3, total: 120 });
    expect(pageOf(rows, 1, 100).pageCount).toBe(2);
  });

  it("falls back to the last page when the list shrank under the address", () => {
    expect(pageOf(rows.slice(0, 10), 4, 50)).toEqual({ rows: rows.slice(0, 10), page: 1, pageCount: 1, total: 10 });
  });
});

describe("requestFailureKind", () => {
  it("tells no access, a dropped connection and a server failure apart (R2-11)", () => {
    expect(requestFailureKind(new RequestError("Not allowed", "authz.out_of_scope", undefined, 403))).toBe("no_access");
    expect(requestFailureKind(new TypeError("Failed to fetch"))).toBe("connection");
    expect(requestFailureKind(new RequestError("Internal server error", undefined, undefined, 500))).toBe("server");
  });
});
