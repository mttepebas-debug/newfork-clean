import { describe, expect, it } from "vitest";
import {
  defaultDocumentLifecycleSettings,
  type DocumentDetail,
} from "@newfork/shared";
import {
  documentFacts,
  fileMeta,
  firstName,
  formatCalendarDay,
  formatDate,
  formatDateIn,
  formatDay,
  formatMoment,
  headSub,
  keptRenewal,
  shownVersion,
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
  // mockup tur2-a2.js (expired): "Expired on Thu, Oct 15", like every other day in the drawer.
  it("says a calendar date with its weekday, the year only when it is another one", () => {
    expect(formatCalendarDay("2026-10-14", now)).toBe("Wed, Oct 14");
    expect(formatCalendarDay("2025-12-31", now)).toBe("Wed, Dec 31, 2025");
  });
  // mockup tur2-a2.js (Last approved): "approved Oct 11, 2024", the day in the document's zone.
  it("says the day of a moment in the document's zone as a plain date", () => {
    expect(formatDateIn("2024-10-12T03:00:00Z", zone)).toBe("Oct 11, 2024");
    expect(formatDateIn("2026-10-21T23:12:00Z", zone)).toBe("Oct 21, 2026");
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
  // A2 Tur 6 (mockup-spec 4.4): once decided in this sitting the decision takes the Due row's place, so the files
  // under the facts never jump at Save. "You" only for a decision made here (the API names nobody).
  it("puts a decision made in this sitting where the due date was", () => {
    const doc = detail();
    doc.obligation.status = "rejected";
    doc.obligation.settings.suspend_on_overdue = true;
    doc.submissions[0]!.state = "rejected";
    expect(documentFacts(doc, now, { label: "Sent back", at: "2026-10-23T18:00:00Z" })).toEqual([
      ["Name", "Maria Lopez"],
      ["Document", "Food Handler Card"],
      ["Locations", "Downtown, Midtown"],
      ["Sent", "Wed, Oct 21, 4:12 PM"],
      ["Expires", "Sep 30, 2029"],
      ["Card number", "FH-448812"],
      ["Sent back", "Fri, Oct 23 · You"],
    ]);
  });
});

// K1 fix pass (gaps A2): a renewal sent back while the approved copy is still valid leaves the document Completed;
// what the document is (sent, expires, its fields) is the copy on file, and the renewal stands as its own version.
describe("a renewal sent back while the approved copy still counts", () => {
  function lena(status: "completed" | "timezone_required" = "completed"): DocumentDetail {
    const doc = detail();
    doc.obligation.status = status;
    doc.obligation.approved_id = "v1";
    doc.obligation.deadline_at = null;
    doc.submissions[0]!.state = "rejected";
    doc.submissions.push({
      id: "v1",
      version: 1,
      state: "accepted",
      submitted_at: "2025-11-28T18:00:00Z",
      reviewed_at: "2025-12-02T18:00:00Z",
      expiry_date: "2026-12-31",
      metadata: { card: "FH-100200" },
      rejection_reason: null,
      files: [],
    });
    return doc;
  }
  it("shows the copy on file and keeps the renewal apart", () => {
    const doc = lena();
    expect(shownVersion(doc)?.id).toBe("v1");
    expect(keptRenewal(doc)?.id).toBe("v2");
    expect(keptRenewal(lena("timezone_required"))?.id).toBe("v2");
    expect(documentFacts(doc, now)).toEqual([
      ["Name", "Maria Lopez"],
      ["Document", "Food Handler Card"],
      ["Locations", "Downtown, Midtown"],
      ["Sent", "Fri, Nov 28, 2025, 10:00 AM"],
      ["Expires", "Dec 31, 2026"],
      ["Card number", "FH-100200"],
    ]);
  });
  it("is no renewal when the version sent is the one on file, waits for review, or nothing is on file", () => {
    const same = lena();
    same.obligation.submitted_id = "v1";
    expect(keptRenewal(same)).toBeNull();
    expect(shownVersion(same)?.id).toBe("v1");
    const waiting = lena();
    waiting.obligation.status = "pending_review";
    waiting.submissions[0]!.state = "pending_review";
    expect(keptRenewal(waiting)).toBeNull();
    expect(shownVersion(waiting)?.id).toBe("v2");
    const sentBack = detail();
    sentBack.obligation.status = "rejected";
    sentBack.submissions[0]!.state = "rejected";
    expect(keptRenewal(sentBack)).toBeNull();
    expect(shownVersion(sentBack)?.id).toBe("v2");
  });
});

// A file's row says what it is and how big (mockup-spec 5.3: "JPG · 471 KB").
describe("fileMeta", () => {
  const file = (media_type: string, size_bytes: number, filename = "card") => ({ media_type, size_bytes, filename });
  it("names the type and the size in the units people read", () => {
    expect(fileMeta(file("image/jpeg", 482_304))).toBe("JPG · 471 KB");
    expect(fileMeta(file("application/pdf", 100))).toBe("PDF · 100 B");
    expect(fileMeta(file("image/png", 2_048))).toBe("PNG · 2 KB");
    expect(fileMeta(file("image/webp", 3_407_872))).toBe("WebP · 3.3 MB");
    expect(fileMeta(file("image/png", 10_485_760))).toBe("PNG · 10 MB");
    expect(fileMeta(file("application/octet-stream", 10, "scan.tiff"))).toBe("TIFF · 10 B");
    expect(fileMeta(file("application/octet-stream", 10, "scan"))).toBe("File · 10 B");
  });
});
