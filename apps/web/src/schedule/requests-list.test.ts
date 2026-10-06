import type { ExchangeCase, TimeOffRequest } from "@newfork/shared";
import { describe, expect, it } from "vitest";

import { RequestError } from "../lib/request-error";
import {
  openRequestRows,
  pageOf,
  readRequestsParams,
  requestFailureKind,
  requestTypesFor,
  tabOfRequest,
} from "./requests-list";

// EKRAN-02 B1 (K-S8, K-S9, K-S10): Requests is one table. Time off and shift
// changes are read from their own two lists and joined here, in the open tabs.

const kadikoy = "22222222-2222-4222-8222-222222222222";
const besiktas = "33333333-3333-4333-8333-333333333333";

function timeOff(id: string, decideBy: string | null, progress: Partial<NonNullable<TimeOffRequest["progress"]>> | null): TimeOffRequest {
  return {
    id, employee_id: "44444444-4444-4444-8444-444444444444", employee_name: "Ali Person",
    request_type: "time_off", reason: "", status: "pending", start_date: "2026-10-13", end_date: "2026-10-13",
    revision: 1, created_at: "2026-10-01T09:00:00Z", decide_by: decideBy, conflict_count: 0, segments: [], events: [],
    progress: progress && {
      remaining: 1, fallback: false, decide_by: decideBy, can_vote: true, can_decide_alone: false, my_vote: null,
      my_approval_finalizes: true, locations: [], impact: null, ...progress,
    },
  } as TimeOffRequest;
}

function exchange(id: string, kind: ExchangeCase["kind"], stage: ExchangeCase["stage"], expiresAt: string, extra: Partial<ExchangeCase> = {}): ExchangeCase {
  return {
    id, kind, audience: "eligible_pool", status: stage === "closed" ? "completed" : "open", stage, revision: 1,
    created_at: "2026-10-01T09:00:00Z", expires_at: expiresAt, owner_id: null, owner_name: "Emre Person",
    shift: { location_id: kadikoy, employee_name: "Emre Person" }, requested_shift: null, applications: [],
    candidate_count: 0, can_manage: true, is_owner: false, history: [], ...extra,
  } as ExchangeCase;
}

const everyType = ["time_off", "swap", "cover", "open_pickup"] as const;
const all = { types: [...everyType], locationId: "", search: "" };

describe("openRequestRows", () => {
  it("puts what the reader decides in Needs review and what waits on somebody else in In progress", () => {
    const rows = openRequestRows(
      [
        timeOff("t-mine", "2026-10-10T12:00:00Z", { can_vote: true, my_vote: null }),
        timeOff("t-voted", "2026-10-11T12:00:00Z", { can_vote: false, my_vote: "approve" }),
      ],
      [
        exchange("x-ready", "swap", "ready_for_manager", "2026-10-09T12:00:00Z"),
        exchange("x-finding", "cover", "seeking_candidates", "2026-10-12T12:00:00Z"),
        exchange("x-peer", "swap", "awaiting_peer", "2026-10-13T12:00:00Z"),
        exchange("x-not-mine", "open_pickup", "ready_for_manager", "2026-10-14T12:00:00Z", { can_manage: false }),
        exchange("x-closed", "cover", "closed", "2026-10-08T12:00:00Z"),
      ],
      all,
    );
    expect(rows.map((row) => [row.id, row.tab])).toEqual([
      ["x-ready", "needs_review"],
      ["t-mine", "needs_review"],
      ["t-voted", "in_progress"],
      ["x-finding", "in_progress"],
      ["x-peer", "in_progress"],
      ["x-not-mine", "in_progress"],
    ]);
  });

  // An admin or owner who decides alone has nobody before them: the request is theirs now (EKRAN-02 C1).
  it("puts a request the reader decides alone in Needs review", () => {
    const rows = openRequestRows(
      [timeOff("t-alone", "2026-10-10T12:00:00Z", { can_vote: false, can_decide_alone: true, my_vote: null })],
      [],
      all,
    );
    expect(rows.map((row) => [row.id, row.tab])).toEqual([["t-alone", "needs_review"]]);
  });

  it("orders by Decide by, nearest first, with no deadline last", () => {
    const rows = openRequestRows(
      [timeOff("t-none", null, { can_vote: true }), timeOff("t-late", "2026-10-20T12:00:00Z", { can_vote: true })],
      [exchange("x-soon", "swap", "ready_for_manager", "2026-10-09T12:00:00Z")],
      all,
    );
    expect(rows.map((row) => row.id)).toEqual(["x-soon", "t-late", "t-none"]);
  });

  it("keeps only the chosen request types", () => {
    const rows = openRequestRows(
      [timeOff("t", "2026-10-10T12:00:00Z", { can_vote: true })],
      [exchange("s", "swap", "ready_for_manager", "2026-10-10T12:00:00Z"), exchange("o", "open_pickup", "ready_for_manager", "2026-10-10T12:00:00Z")],
      { ...all, types: ["swap", "open_pickup"] },
    );
    expect(rows.map((row) => row.type)).toEqual(["swap", "open_pickup"]);
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
    expect(openRequestRows([], cases, { ...all, locationId: besiktas }).map((row) => row.id)).toEqual(["b"]);
    expect(openRequestRows([], cases, { ...all, search: "  zEYNep " }).map((row) => row.id)).toEqual(["b"]);
  });
});

describe("requestTypesFor", () => {
  it("offers only the request types the reader may read", () => {
    expect(requestTypesFor({ timeOff: true, shiftChanges: false })).toEqual(["time_off"]);
    expect(requestTypesFor({ timeOff: false, shiftChanges: true })).toEqual(["swap", "cover", "open_pickup"]);
  });
});

describe("readRequestsParams", () => {
  const allowed = ["time_off", "swap", "cover", "open_pickup"] as const;

  it("reads tab, types and page from the address, 50 rows a page by default", () => {
    expect(readRequestsParams(new URLSearchParams("tab=in_progress&types=swap,cover&page=2&size=25"), [...allowed])).toEqual({
      tab: "in_progress", types: ["swap", "cover"], page: 2, pageSize: 25,
    });
    expect(readRequestsParams(new URLSearchParams(""), [...allowed])).toEqual({
      tab: "needs_review", types: [...allowed], page: 1, pageSize: 50,
    });
  });

  it("ignores what the address cannot ask for: a type the reader may not read, an odd page size", () => {
    expect(readRequestsParams(new URLSearchParams("tab=x&types=time_off,bogus&page=-3&size=30"), ["swap", "cover", "open_pickup"])).toEqual({
      tab: "needs_review", types: ["swap", "cover", "open_pickup"], page: 1, pageSize: 50,
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

describe("tabOfRequest", () => {
  it("opens a linked request in its tab, and in Closed once it is no longer open (R2-09)", () => {
    const rows = openRequestRows([], [exchange("x", "cover", "seeking_candidates", "2026-10-10T12:00:00Z")], all);
    expect(tabOfRequest("x", rows)).toBe("in_progress");
    expect(tabOfRequest("gone", rows)).toBe("closed");
  });
});

describe("requestFailureKind", () => {
  it("tells no access, a dropped connection and a server failure apart (R2-11)", () => {
    expect(requestFailureKind(new RequestError("Not allowed", "authz.out_of_scope", undefined, 403))).toBe("no_access");
    expect(requestFailureKind(new TypeError("Failed to fetch"))).toBe("connection");
    expect(requestFailureKind(new RequestError("Internal server error", undefined, undefined, 500))).toBe("server");
  });
});
