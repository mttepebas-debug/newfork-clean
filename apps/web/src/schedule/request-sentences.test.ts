import type { ExchangeCase, TimeOffRequest } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import { exchangeSentence, exchangeStatus, rowExpires, rowKind, rowStatus, sentenceText, timeOffSentence } from "./request-sentences";
import type { RequestRow } from "./requests-list";

// TAKAS-RELEASE: one sentence per row, as the approved mockup writes them
// (Mert, 2026-10-14 00:53): who comes on first, whose shift it is, what and where.

const shift = {
  id: "22000000-0000-4000-8000-000000000001", source_id: "22000000-0000-4000-8000-000000000001",
  location_id: "11000000-0000-4000-8000-000000000001", location_name: "Downtown", timezone: "America/Los_Angeles",
  job_id: null, job_name: "Server", scheduled_date: "2026-10-16", start_time: "16:00", end_time: "22:00",
  starts_at: "2026-10-16T23:00:00Z", ends_at: "2026-10-17T05:00:00Z",
  employee_id: "15000000-0000-4000-8000-000000000001", employee_name: "Maria Lopez",
};
const person = (name: string, status = "pending_manager") => ({
  id: `a-${name}`, employee_id: `e-${name}`, employee_name: name, status, created_at: "2026-10-14T10:00:00Z", reason: "", eligibility: null,
});
const release = (applications: ReturnType<typeof person>[], change: Partial<ExchangeCase> = {}) =>
  ({
    id: "c", kind: "cover", audience: "eligible_pool", status: "open", stage: applications.length ? "ready_for_manager" : "seeking_candidates",
    revision: 2, created_at: "2026-10-14T09:00:00Z", expires_at: "2026-10-16T19:00:00Z", owner_id: shift.employee_id, owner_name: "Maria Lopez",
    shift, requested_shift: null, applications, candidate_count: applications.length, can_manage: true, is_owner: false,
    teammate_note: "", history: [], ...change,
  }) as unknown as ExchangeCase;
const row = (request: ExchangeCase, state: RequestRow["state"] = "needs_review"): RequestRow => ({
  source: "exchange", id: request.id, type: request.kind, state, decideBy: state === "closed" ? null : request.expires_at, closedAt: null, request,
});

describe("exchangeSentence", () => {
  it("starts a pickup with who wants it and says whose shift it is", () => {
    const text = sentenceText(exchangeSentence(release([person("Jake Miller"), person("Ana Torres"), person("Sam Reed")]), "12h"));
    expect(text).toBe("Jake Miller and 2 others want to take over Maria Lopez’s 4:00 PM Server shift at Downtown on Fri, Oct 16.");
  });

  it("writes one or two names in full", () => {
    expect(sentenceText(exchangeSentence(release([person("Jake Miller")]), "12h"))).toBe(
      "Jake Miller wants to take over Maria Lopez’s 4:00 PM Server shift at Downtown on Fri, Oct 16.");
    expect(sentenceText(exchangeSentence(release([person("Jake Miller"), person("Ana Torres")]), "24h"))).toBe(
      "Jake Miller and Ana Torres want to take over Maria Lopez’s 16:00 Server shift at Downtown on Fri, Oct 16.");
  });

  it("turns to the past once approved, naming only who took it", () => {
    const done = release([person("Ana Torres", "approved"), person("Jake Miller", "closed_other_selected")], { status: "completed", stage: "closed" });
    expect(sentenceText(exchangeSentence(done, "12h"))).toBe("Ana Torres took over Maria Lopez’s 4:00 PM Server shift at Downtown on Fri, Oct 16.");
  });

  it("says a cover was offered, and a release nobody asked for yet", () => {
    expect(sentenceText(exchangeSentence(release([person("Leo Park")], { audience: "direct" }), "12h"))).toBe(
      "Leo Park offered to cover Maria Lopez’s 4:00 PM Server shift at Downtown on Fri, Oct 16.");
    expect(sentenceText(exchangeSentence(release([]), "12h"))).toBe("Maria Lopez released their 4:00 PM Server shift at Downtown on Fri, Oct 16.");
  });

  it("names both people in a swap", () => {
    const swap = release([person("Priya Shah", "pending_manager")], {
      kind: "swap", audience: "direct", owner_name: "Daniel Brooks",
      requested_shift: { ...shift, employee_name: "Priya Shah" },
    });
    expect(sentenceText(exchangeSentence(swap, "12h"))).toBe("Daniel Brooks and Priya Shah want to swap their Server shifts.");
  });

  // Bug 31: after approval the requested shift's live holder is the owner, so
  // the other name comes from the request itself.
  it("keeps both names once a swap is approved", () => {
    const swapped = release([person("Priya Shah", "approved")], {
      kind: "swap", audience: "direct", status: "completed", stage: "closed", owner_name: "Daniel Brooks",
      requested_shift: { ...shift, employee_name: "Daniel Brooks" },
    });
    expect(sentenceText(exchangeSentence(swapped, "12h"))).toBe("Daniel Brooks and Priya Shah swapped their Server shifts.");
  });

  it("puts names in bold", () => {
    expect(exchangeSentence(release([person("Jake Miller")]), "12h")[0]).toEqual({ strong: "Jake Miller" });
  });
});

describe("timeOffSentence", () => {
  const request = { employee_name: "Maria Lopez", request_type: "time_off", start_date: "2026-10-19", end_date: "2026-10-21" } as TimeOffRequest;
  it("says who asked for which days, and the shifts that become open", () => {
    expect(sentenceText(timeOffSentence(request, 0))).toBe("Maria Lopez asked for time off Mon, Oct 19 – Wed, Oct 21.");
    expect(sentenceText(timeOffSentence(request, 2))).toBe("Maria Lopez asked for time off Mon, Oct 19 – Wed, Oct 21. 2 shifts become open.");
    expect(sentenceText(timeOffSentence({ ...request, request_type: "time_off_cancellation", end_date: "2026-10-19" }, 0))).toBe(
      "Maria Lopez asked to cancel approved time off Mon, Oct 19.");
  });
});

describe("rowKind and rowStatus", () => {
  it("calls a release a pickup and a direct cover a cover", () => {
    expect(rowKind(row(release([person("Jake Miller")])))).toBe("pickup");
    expect(rowKind(row(release([person("Leo Park")], { audience: "direct" })))).toBe("cover");
  });

  it("keeps to the short words", () => {
    expect(rowStatus(row(release([person("Jake Miller")])))).toEqual({ label: "Needs decision", tone: "amber" });
    expect(rowStatus(row(release([], { status: "completed" }), "closed"))).toEqual({ label: "Approved", tone: "green" });
    expect(rowStatus(row(release([], { status: "expired" }), "closed"))).toEqual({ label: "Expired", tone: "gray" });
  });

  // Mert, 2026-10-18: four words only. Somebody waiting on a manager is Needs
  // decision, whoever votes first; the details say who else has to approve.
  it("calls every open request somebody asked for Needs decision", () => {
    expect(rowStatus(row(release([person("Jake Miller")], { can_manage: false }), "in_progress"))).toEqual({ label: "Needs decision", tone: "amber" });
  });

  it("closes a request without a decision quietly, with no word", () => {
    expect(exchangeStatus(release([person("Jake Miller", "rejected_by_manager")], { status: "cancelled", stage: "closed" }))).toBeNull();
    expect(exchangeStatus(release([], { status: "invalidated", stage: "closed" }))).toBeNull();
  });

  it("calls a direct request the manager turned down Declined", () => {
    expect(exchangeStatus(release([person("Leo Park", "rejected_by_manager")], { audience: "direct", status: "cancelled", stage: "closed" }))).toEqual({
      label: "Declined", tone: "red",
    });
  });

  it("calls a release nobody waits on an open shift", () => {
    expect(exchangeStatus(release([]))).toEqual({ label: "Open", tone: "gray" });
    expect(exchangeStatus(release([person("Jake Miller", "withdrawn")], { stage: "seeking_candidates" }))).toEqual({ label: "Open", tone: "gray" });
    expect(exchangeStatus(release([person("Jake Miller", "rejected_by_manager")], { stage: "seeking_candidates" }))).toEqual({ label: "Open", tone: "gray" });
  });

  // Mert, 2026-10-18: a swap one location approved is still Needs decision; the drawer says who else approves.
  it("calls a half-approved swap Needs decision", () => {
    const swap = release([person("Priya Shah")], {
      kind: "swap", stage: "awaiting_other_manager",
      requested_shift: { ...shift, location_id: "11000000-0000-4000-8000-000000000002", location_name: "Midtown" },
    });
    expect(rowStatus(row(swap, "needs_review"))).toEqual({ label: "Needs decision", tone: "amber" });
  });
});

describe("time off status", () => {
  const request = (change: Partial<TimeOffRequest>) =>
    ({ id: "t", employee_name: "Maria Lopez", request_type: "time_off", status: "pending", start_date: "2026-10-19", end_date: "2026-10-19", events: [], ...change }) as TimeOffRequest;
  const timeOffRow = (item: TimeOffRequest, state: RequestRow["state"]): RequestRow => ({
    source: "time_off", id: item.id, type: "time_off", state, decideBy: null, closedAt: null, request: item,
  });

  // Mert, 2026-10-18: another approver voting first is still Needs decision; revoked leave ends Declined.
  it("calls a request another approver votes on first Needs decision, and revoked leave Declined", () => {
    expect(rowStatus(timeOffRow(request({}), "in_progress"))).toEqual({ label: "Needs decision", tone: "amber" });
    expect(rowStatus(timeOffRow(request({ status: "revoked" }), "closed"))).toEqual({ label: "Declined", tone: "red" });
  });
});

describe("rowExpires", () => {
  it("is red in the last 12 hours and empty once decided", () => {
    const open = row(release([person("Jake Miller")]));
    expect(rowExpires(open, Date.parse("2026-10-16T08:00:00Z"))).toEqual({ at: open.decideBy, soon: true });
    expect(rowExpires(open, Date.parse("2026-10-15T08:00:00Z"))?.soon).toBe(false);
    expect(rowExpires(row(release([], { status: "completed" }), "closed"))).toBeNull();
  });
});
