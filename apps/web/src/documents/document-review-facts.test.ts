import { describe, expect, it } from "vitest";
import {
  defaultDocumentLifecycleSettings,
  type DocumentDetail,
} from "@newfork/shared";
import {
  documentFacts,
  firstName,
  formatDate,
  formatDay,
  formatMoment,
  headSub,
  timeLeft,
} from "./document-review-facts";

// Friday, Oct 23, 2026, noon Pacific Time.
const now = new Date("2026-10-23T19:00:00Z");
const zone = "America/Los_Angeles";
// Friday, Oct 30, 11:59 PM and Wednesday, Oct 21, 4:12 PM, Pacific Time.
const due = "2026-10-31T06:59:00Z";
const sent = "2026-10-21T23:12:00Z";

function detail(): DocumentDetail {
  return {
    obligation: {
      id: "requirement",
      workspace_id: "workspace",
      employee_id: "employee",
      employee_name: "Maria Lopez",
      title: "Food Handler Card",
      source_id: "definition",
      kind: "document",
      mode: "required",
      status: "pending_review",
      revision: 1,
      requires_review: true,
      deadline_at: due,
      remaining_seconds: 3600,
      rejection_reason: null,
      suspended: false,
      submitted_id: "v2",
      approved_id: null,
      location_ids: ["l1", "l2"],
      location_names: ["Downtown", "Midtown"],
      timezone: zone,
      settings: {
        ...defaultDocumentLifecycleSettings,
        mode: "required",
        period_days: 14,
        extra_fields: [{ key: "card", label: "Card number", kind: "text", required: true }],
      },
      accepted_formats: ["pdf"],
      tracks_expiry: true,
    },
    submissions: [
      {
        id: "v2",
        version: 2,
        state: "pending_review",
        submitted_at: sent,
        reviewed_at: null,
        expiry_date: "2029-09-30",
        metadata: { card: "FH-448812" },
        rejection_reason: null,
        files: [],
      },
    ],
    history: [],
  };
}

describe("dates in the document's zone", () => {
  it("says a moment with its weekday and time, and the year only when it is another one", () => {
    expect(formatMoment(sent, zone, now)).toBe("Wed, Oct 21, 4:12 PM");
    expect(formatMoment("2025-10-11T17:00:00Z", zone, now)).toBe("Sat, Oct 11, 2025, 10:00 AM");
  });
  it("says a day without the time", () => {
    expect(formatDay(due, zone, now)).toBe("Fri, Oct 30");
    expect(formatDay("2027-01-04T20:00:00Z", zone, now)).toBe("Mon, Jan 4, 2027");
  });
  it("says a calendar date as written, whatever the zone", () => {
    expect(formatDate("2029-09-30")).toBe("Sep 30, 2029");
  });
});

describe("timeLeft", () => {
  it("counts whole days left, then less than a day, then overdue", () => {
    expect(timeLeft(due, now)).toBe("7 days left");
    expect(timeLeft("2026-10-24T20:00:00Z", now)).toBe("1 day left");
    expect(timeLeft("2026-10-23T23:00:00Z", now)).toBe("less than a day left");
    expect(timeLeft("2026-10-22T23:00:00Z", now)).toBe("overdue");
  });
});

describe("firstName", () => {
  it("is the name's first word", () => {
    expect(firstName("Maria Lopez")).toBe("Maria");
    expect(firstName("  Cher ")).toBe("Cher");
  });
});

// The head's line under the document title (mockup-spec 2.4).
describe("headSub", () => {
  it("says when a document waiting for review was sent", () => {
    const doc = detail();
    expect(headSub(doc.obligation, doc, { phone: false, now })).toBe("Sent: Wed, Oct 21, 4:12 PM");
  });
  it("cannot say when it was sent before the document has loaded", () => {
    expect(headSub(detail().obligation, undefined, { phone: false, now })).toBeNull();
  });
  it("says when a missing document is due, with the zone on a desktop only", () => {
    const doc = detail();
    doc.obligation.status = "missing";
    expect(headSub(doc.obligation, undefined, { phone: false, now })).toBe(
      "Due: Fri, Oct 30, 11:59 PM Pacific Time",
    );
    expect(headSub(doc.obligation, undefined, { phone: true, now })).toBe("Due: Fri, Oct 30, 11:59 PM");
    doc.obligation.deadline_at = null;
    expect(headSub(doc.obligation, undefined, { phone: false, now })).toBe("No due date");
  });
  it("says when an expired document ran out unless a new due date lies ahead", () => {
    const doc = detail();
    doc.obligation.status = "expired";
    doc.obligation.expiry_date = "2026-10-15";
    doc.obligation.deadline_at = "2026-10-01T06:59:00Z";
    expect(headSub(doc.obligation, undefined, { phone: false, now })).toBe("Expired: Oct 15, 2026");
    doc.obligation.deadline_at = due;
    expect(headSub(doc.obligation, undefined, { phone: true, now })).toBe("Due: Fri, Oct 30, 11:59 PM");
  });
  it("says when an approved document was approved", () => {
    const doc = detail();
    doc.obligation.status = "completed";
    doc.obligation.approved_id = "v2";
    doc.submissions[0]!.state = "accepted";
    doc.submissions[0]!.reviewed_at = "2026-10-22T18:00:00Z";
    expect(headSub(doc.obligation, doc, { phone: false, now })).toBe("Approved: Thu, Oct 22");
    doc.submissions[0]!.reviewed_at = null;
    expect(headSub(doc.obligation, doc, { phone: false, now })).toBe("Approved");
  });
  it("says when an excused document was excused", () => {
    const doc = detail();
    doc.obligation.status = "exempt";
    doc.history = [
      { id: "h2", action: "document.exempted", occurred_at: "2026-10-20T16:00:00Z", metadata: {} },
      { id: "h1", action: "document.exempted", occurred_at: "2026-09-01T16:00:00Z", metadata: {} },
    ];
    expect(headSub(doc.obligation, doc, { phone: false, now })).toBe("Excused: Tue, Oct 20");
    doc.history = [];
    expect(headSub(doc.obligation, doc, { phone: false, now })).toBe("Excused");
  });
});

// Details' facts (mockup-spec 4.3): who, what, where, what was sent, and when it is due.
describe("documentFacts", () => {
  it("lists a document waiting for review with what was sent and when it is due", () => {
    expect(documentFacts(detail(), now)).toEqual([
      ["Name", "Maria Lopez"],
      ["Document", "Food Handler Card"],
      ["Locations", "Downtown, Midtown"],
      ["Sent", "Wed, Oct 21, 4:12 PM"],
      ["Expires", "Sep 30, 2029"],
      ["Card number", "FH-448812"],
      ["Due", "Fri, Oct 30 · 7 days left"],
    ]);
  });
  it("leaves out what is not there", () => {
    const doc = detail();
    doc.obligation.location_names = [];
    doc.obligation.deadline_at = null;
    doc.submissions[0]!.expiry_date = null;
    doc.submissions[0]!.metadata = { card: null };
    expect(documentFacts(doc, now)).toEqual([
      ["Name", "Maria Lopez"],
      ["Document", "Food Handler Card"],
      ["Sent", "Wed, Oct 21, 4:12 PM"],
    ]);
  });
  it("says what happens when a missing document that suspends runs late", () => {
    const doc = detail();
    doc.obligation.status = "missing";
    doc.obligation.submitted_id = null;
    doc.submissions = [];
    doc.obligation.settings.suspend_on_overdue = true;
    expect(documentFacts(doc, now)).toEqual([
      ["Name", "Maria Lopez"],
      ["Document", "Food Handler Card"],
      ["Locations", "Downtown, Midtown"],
      ["Due", "Fri, Oct 30 · 7 days left"],
      ["If it's late", "Maria can open only their documents until it's in"],
    ]);
  });
  it("shows no old due date on an expired document", () => {
    const doc = detail();
    doc.obligation.status = "expired";
    doc.obligation.submitted_id = null;
    doc.obligation.approved_id = "v2";
    doc.obligation.deadline_at = "2026-10-01T06:59:00Z";
    doc.submissions[0]!.state = "accepted";
    expect(documentFacts(doc, now)).toEqual([
      ["Name", "Maria Lopez"],
      ["Document", "Food Handler Card"],
      ["Locations", "Downtown, Midtown"],
    ]);
  });
  it("lists an approved document's version and no due date", () => {
    const doc = detail();
    doc.obligation.status = "completed";
    doc.obligation.submitted_id = null;
    doc.obligation.approved_id = "v2";
    doc.submissions[0]!.state = "accepted";
    expect(documentFacts(doc, now).map(([label]) => label)).toEqual([
      "Name",
      "Document",
      "Locations",
      "Sent",
      "Expires",
      "Card number",
    ]);
  });
});
