import { defaultDocumentLifecycleSettings, type DocumentDetail } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import { documentTimeline } from "./review-history";

// History in the manager's review drawer (A2 Tur 6, mockup-spec 14; K1 decision 8): one timeline, newest first, in
// plain words, from the API's history. Nobody is named as having done it (the API says no one), and a draft's
// uploads are not events of the document.

const now = new Date("2026-10-23T18:00:00Z");
const pdf = { media_type: "application/pdf", size_bytes: 100, note: "" };

function doc(): DocumentDetail {
  return {
    obligation: {
      id: "00000000-0000-4000-8000-000000000001",
      workspace_id: "00000000-0000-4000-8000-000000000002",
      employee_id: "00000000-0000-4000-8000-000000000003",
      employee_name: "Maria Lopez",
      title: "Food handler card",
      source_id: null,
      kind: "document",
      mode: "required",
      status: "pending_review",
      revision: 4,
      requires_review: true,
      deadline_at: "2026-10-30T06:59:00Z",
      remaining_seconds: 600_000,
      rejection_reason: null,
      suspended: false,
      submitted_id: "v2",
      approved_id: null,
      location_ids: [],
      location_names: [],
      timezone: "America/Los_Angeles",
      settings: {
        ...defaultDocumentLifecycleSettings,
        period_days: 14,
        extra_fields: [{ key: "card", label: "Card number", kind: "text", required: true }],
      },
      accepted_formats: ["pdf", "jpeg"],
      tracks_expiry: true,
    },
    submissions: [
      {
        id: "v2",
        version: 2,
        state: "pending_review",
        submitted_at: "2026-10-21T23:12:00Z",
        reviewed_at: null,
        expiry_date: "2029-09-30",
        metadata: { card: "FH-448812" },
        rejection_reason: null,
        files: [
          { ...pdf, id: "front", filename: "front.jpg", media_type: "image/jpeg", decision: "keep" },
          { ...pdf, id: "back", filename: "back.jpg", media_type: "image/jpeg", decision: "keep" },
        ],
      },
      {
        id: "v1",
        version: 1,
        state: "rejected",
        submitted_at: "2026-10-16T17:02:00Z",
        reviewed_at: "2026-10-17T16:30:00Z",
        expiry_date: null,
        metadata: {},
        rejection_reason: "The photo is blurry.",
        files: [
          { ...pdf, id: "old", filename: "card.jpg", media_type: "image/jpeg", decision: "discard", note: "Blurry" },
          { ...pdf, id: "kept", filename: "receipt.pdf", decision: "keep" },
        ],
      },
    ],
    history: [
      { id: "e7", action: "document.submitted", occurred_at: "2026-10-21T23:12:00Z", metadata: { submission_id: "v2" } },
      { id: "e6", action: "document.draft_file_added", occurred_at: "2026-10-21T23:10:00Z", metadata: { submission_id: "v2" } },
      {
        id: "e5",
        action: "document.reject",
        occurred_at: "2026-10-17T16:30:00Z",
        metadata: {
          submission_id: "v1",
          reason: "The photo is blurry.",
          correction_period: "full",
          new_deadline: "2026-10-31T16:30:00Z",
          files: [
            { id: "old", decision: "discard", note: "Blurry" },
            { id: "kept", decision: "keep", note: "" },
          ],
        },
      },
      { id: "e4", action: "document.submitted", occurred_at: "2026-10-16T17:02:00Z", metadata: { submission_id: "v1" } },
      { id: "e3", action: "document.draft_file_removed", occurred_at: "2026-10-16T17:00:00Z", metadata: {} },
      {
        id: "e2",
        action: "document.deadline_extended",
        occurred_at: "2026-10-15T20:00:00Z",
        metadata: { reason: "Clinic closed", additional_days: 3, new_deadline: "2026-10-25T06:59:00Z" },
      },
      { id: "e1", action: "document.assignment_created", occurred_at: "2026-10-15T16:00:00Z", metadata: { actor_kind: "system" } },
    ],
  };
}

describe("the timeline", () => {
  it("tells each event in plain words, newest first, without a draft's uploads", () => {
    const events = documentTimeline(doc(), now);
    expect(events.map((event) => [event.title, event.when])).toEqual([
      ["Version 2 sent", "Wed, Oct 21, 4:12 PM"],
      ["Version 1 sent back", "Sat, Oct 17, 9:30 AM"],
      ["Version 1 sent", "Fri, Oct 16, 10:02 AM"],
      ["Deadline extended 3 days", "Thu, Oct 15, 1:00 PM"],
      ["Asked of Maria", "Thu, Oct 15, 9:00 AM"],
    ]);
    expect(events.map((event) => [event.icon, event.tone])).toEqual([
      ["sent", "muted"],
      ["rejected", "red"],
      ["sent", "muted"],
      ["extended", "warn"],
      ["asked", "muted"],
    ]);
    // K1 decision 8: no one is named as having done it, the API names no one.
    expect(JSON.stringify(events)).not.toMatch(/Rachel|You|Newfork/);
  });
  it("marks the version waiting for review, with its files by name and what was entered", () => {
    const [sent] = documentTimeline(doc(), now);
    expect(sent!.waiting).toBe(true);
    expect(sent!.files.map((file) => [file.name, file.chip, file.open, file.submissionId])).toEqual([
      ["front.jpg", null, true, "v2"],
      ["back.jpg", null, true, "v2"],
    ]);
    expect(sent!.entered).toEqual([
      ["Expires", "Sep 30, 2029"],
      ["Card number", "FH-448812"],
    ]);
    expect(documentTimeline(doc(), now)[2]!.waiting).toBe(false);
  });
  it("says what was decided on each file of a version sent back, its reason and the time given", () => {
    const back = documentTimeline(doc(), now)[1]!;
    expect(back.note).toBe("The photo is blurry.");
    expect(back.files.map((file) => [file.name, file.chip, file.note, file.open])).toEqual([
      ["card.jpg", { label: "Rejected", tone: "red" }, "Blurry", false],
      ["receipt.pdf", { label: "Kept", tone: "grey" }, "", true],
    ]);
    expect(back.meta).toBe("A new 14 days to send it again · Due Sat, Oct 31");
  });
  it("says an approval, an extension's new date, an excuse and an excuse taken back", () => {
    const detail = doc();
    detail.obligation.status = "completed";
    detail.submissions[0]!.state = "accepted";
    detail.history = [
      { id: "a4", action: "document.exemption_removed", occurred_at: "2026-10-23T17:00:00Z", metadata: { reason: "Back on the line", new_deadline: "2026-11-06T17:00:00Z" } },
      { id: "a3", action: "document.exempted", occurred_at: "2026-10-23T16:00:00Z", metadata: { reason: "Role exception" } },
      {
        id: "a2",
        action: "document.approve",
        occurred_at: "2026-10-22T16:00:00Z",
        metadata: { submission_id: "v2", files: [{ id: "front", decision: "keep", note: "" }, { id: "back", decision: "keep", note: "" }] },
      },
      ...doc().history.slice(3, 4),
    ];
    const events = documentTimeline(detail, now);
    expect(events.map((event) => [event.title, event.note, event.meta])).toEqual([
      ["Asked for it again", "Back on the line", "Due Fri, Nov 6"],
      ["Maria excused", "Role exception", null],
      ["Version 2 approved", null, null],
      ["Version 1 sent", null, null],
    ]);
    expect(events[2]!.files.map((file) => file.chip?.label)).toEqual(["Approved", "Approved"]);
    expect(events[2]!.entered).toEqual([["Expires", "Sep 30, 2029"]]);
    expect(events[2]!.tone).toBe("ok");
    expect(events[0]!.waiting || events[3]!.waiting).toBe(false);
  });
  it("gives the time that was left, or none, to a version sent back", () => {
    const detail = doc();
    detail.submissions = detail.submissions.slice(1);
    detail.history = [
      {
        id: "r2",
        action: "document.reject",
        occurred_at: "2026-10-17T16:30:00Z",
        metadata: { submission_id: "v1", reason: "Blurry.", correction_period: "remaining", new_deadline: "2026-10-20T20:30:00Z" },
      },
      { id: "r1", action: "document.reject", occurred_at: "2026-10-12T16:30:00Z", metadata: { reason: "Wrong card.", correction_period: "full", new_deadline: null } },
    ];
    const [left, none] = documentTimeline(detail, now);
    expect(left!.meta).toBe("What was left: 3 days · Due Tue, Oct 20");
    expect([none!.title, none!.meta]).toEqual(["Sent back", "No due date to send it again"]);
  });
  it("keeps every version sent, even one the history does not tell", () => {
    const detail = doc();
    detail.history = [];
    expect(documentTimeline(detail, now).map((event) => [event.title, event.files.map((file) => file.name)])).toEqual([
      ["Version 2 sent", ["front.jpg", "back.jpg"]],
      ["Version 1 sent", ["card.jpg", "receipt.pdf"]],
    ]);
  });
  it("says every other event in words, never by its code", () => {
    const detail = doc();
    detail.submissions = [];
    const actions = [
      ["document.initial_deferred", { reason: "Embassy appointment" }],
      ["document.policy_acknowledged", {}],
      ["document.policy_withdrawn", {}],
      ["document.publication_paused", { reason: "Rewording" }],
      ["document.definition_applied", { reason: "New rule" }],
      ["document.assignment_removed", { reason: "target_changed" }],
      ["document.assignment_reopened", { deadline: "2026-11-06T17:00:00Z" }],
      ["document.reference_timezone_changed", { timezone: "America/Denver" }],
      ["document.something_new", {}],
    ] as const;
    detail.history = actions.map(([action, metadata], index) => ({
      id: `x${index}`,
      action,
      occurred_at: "2026-10-20T16:00:00Z",
      metadata,
    }));
    const events = documentTimeline(detail, now);
    expect(events.map((event) => [event.title, event.note, event.meta])).toEqual([
      ["Maria will send it later", "Embassy appointment", null],
      ["Maria signed the policy", null, null],
      ["Signature withdrawn", null, null],
      ["Changes paused", "Rewording", null],
      ["Document updated", "New rule", null],
      ["No longer asked", null, null],
      ["Asked again", null, "Due Fri, Nov 6"],
      ["Document time zone changed", null, "Mountain Time"],
      ["Updated", null, null],
    ]);
    expect(JSON.stringify(events)).not.toMatch(/document\.|_/);
  });
});
