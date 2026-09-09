import type { SchedulePublicationPreview } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import { ScheduleRequestError } from "../schedule-data";
import {
  parsePublishPreflightError,
  canContinueWarnOnlyPublication,
  parsePublishRecoveryError,
  parsePublishScheduleConflict,
  publishScheduleConflictKey,
  publishScheduleConflictLabel,
} from "./schedulePublishRecovery";

const preview: SchedulePublicationPreview = {
  status: "publish_ready",
  workspace_id: "11111111-1111-4111-8111-111111111111",
  week_start: "2026-08-17",
  draft_id: "22222222-2222-4222-8222-222222222222",
  draft_revision: 2,
  fingerprint: "a".repeat(64),
  locations: [
    {
      location_id: "33333333-3333-4333-8333-333333333333",
      location_name: "Main Dining",
      active_publication_id: null,
      active_version: null,
      current_shift_count: 0,
      next_shift_count: 1,
      added: 1,
      updated: 0,
      removed: 0,
      unchanged: 0,
      affected_employee_ids: ["44444444-4444-4444-8444-444444444444"],
    },
  ],
  findings: [],
};

describe("schedulePublishRecovery", () => {
  const warn = { id: "warn-finding-0001", code: "availability" as const, severity: "soft" as const, overrideable: true,
    availability_state: "new" as const, warning_policy: "warn" as const, tier: "note" as const, message: "Unavailable hours",
    location_id: preview.locations[0]!.location_id, employee_id: null, scheduled_date: preview.week_start, shift_ids: [] };
  it("allows only a changed weekly warn finding while keeping other accepted decisions identical", () => {
    const confirmed = { ...warn, id: "confirm-finding-0001", warning_policy: "confirm" as const, tier: "risk" as const };
    const before = { ...preview, status: "override_required" as const, findings: [confirmed] };
    const next = { ...before, fingerprint: "b".repeat(64), findings: [confirmed, warn] };
    expect(canContinueWarnOnlyPublication(before, next)).toBe(true);
    expect(canContinueWarnOnlyPublication(before, { ...next, findings: [{ ...confirmed, id: "confirm-finding-0002" }, warn] })).toBe(false);
    expect(canContinueWarnOnlyPublication(before, { ...next, findings: [confirmed] })).toBe(false);
  });
  it("rejects recipient, workspace or publication scope changes even with a new warn finding", () => {
    const next = { ...preview, fingerprint: "b".repeat(64), findings: [warn] };
    expect(canContinueWarnOnlyPublication(preview, next)).toBe(true);
    for (const changed of [
      { ...next, workspace_id: preview.draft_id }, { ...next, draft_id: preview.workspace_id },
      { ...next, locations: [] }, { ...next, locations: [{ ...next.locations[0]!, affected_employee_ids: [] }] },
    ]) expect(canContinueWarnOnlyPublication(preview, changed)).toBe(false);
  });
  it("parses preflight schedule request errors with a validated preview", () => {
    const error = new ScheduleRequestError("preflight", 409, {
      status: "preflight",
      preflight: preview,
      preflight_block_reason: "stale_fingerprint",
    });

    expect(parsePublishPreflightError(error)).toEqual({
      preview,
      blockReason: "stale_fingerprint",
    });
  });

  it("falls back to unacknowledged for unknown preflight block reasons", () => {
    const error = new ScheduleRequestError("preflight", 409, {
      status: "preflight",
      preflight: preview,
      preflight_block_reason: "unknown",
    });

    expect(parsePublishPreflightError(error)?.blockReason).toBe(
      "unacknowledged",
    );
  });

  it("parses stale baseline recovery errors", () => {
    const error = new ScheduleRequestError("stale", 409, {
      status: "stale_baseline",
    });

    expect(parsePublishRecoveryError(error)).toEqual({
      type: "stale_baseline",
      message:
        "The published schedule changed while this dialog was open. Review the locations again.",
    });
  });

  it("parses and labels schedule conflict recovery errors", () => {
    const conflict = {
      employee_id: "44444444-4444-4444-8444-444444444444",
      employee_name: "Alex Rivera",
      date: "2026-08-17",
      first: {
        shift_id: "55555555-5555-4555-8555-555555555555",
        time_range: "4:00 PM - 7:00 PM",
      },
      second: {
        shift_id: "66666666-6666-4666-8666-666666666666",
        time_range: "6:00 PM - 10:00 PM",
      },
    };

    expect(parsePublishScheduleConflict(conflict)).toEqual(conflict);
    expect(
      parsePublishRecoveryError(
        new ScheduleRequestError("conflict", 409, {
          status: "schedule_conflicts",
          schedule_conflicts: [conflict, { employee_id: "broken" }],
        }),
      ),
    ).toEqual({
      type: "schedule_conflicts",
      conflicts: [conflict],
    });
    expect(publishScheduleConflictLabel(conflict)).toBe(
      "Alex Rivera: 2026-08-17, 4:00 PM - 7:00 PM and 6:00 PM - 10:00 PM",
    );
  });

  it("parses and labels document schedule conflicts for review actions", () => {
    const conflict = {
      employee_id: "44444444-4444-4444-8444-444444444444",
      employee_name: "Alex Rivera",
      shift_id: "55555555-5555-4555-8555-555555555555",
      location_id: "33333333-3333-4333-8333-333333333333",
      location_name: "Main Dining",
      date: "2026-08-17",
      start_time: "16:00",
      end_time: "19:00",
      document_type_id: "77777777-7777-4777-8777-777777777777",
      requirement_id: "88888888-8888-4888-8888-888888888888",
      document_id: "99999999-9999-4999-8999-999999999999",
      document_title: "Food handler card",
      expiry_date: "2026-08-01",
      expiry_policy_version: 3,
      pending_document_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      review_action: "review_document",
      severity: "soft",
      overrideable: true,
      warning_text: "Food handler card is expired.",
      conflict_fingerprint: "document-fingerprint",
    } as const;

    expect(parsePublishScheduleConflict(conflict)).toEqual({
      ...conflict,
      kind: "document_expiry",
    });
    expect(
      parsePublishRecoveryError(
        new ScheduleRequestError("conflict", 409, {
          status: "schedule_conflicts",
          schedule_conflicts: [conflict],
        }),
      ),
    ).toEqual({
      type: "schedule_conflicts",
      conflicts: [{ ...conflict, kind: "document_expiry" }],
    });
    expect(publishScheduleConflictLabel({ ...conflict, kind: "document_expiry" })).toBe(
      "Alex Rivera: 2026-08-17, Food handler card is expired.",
    );
    expect(publishScheduleConflictKey({ ...conflict, kind: "document_expiry" })).toBe(
      "document-44444444-4444-4444-8444-444444444444-55555555-5555-4555-8555-555555555555-88888888-8888-4888-8888-888888888888-99999999-9999-4999-8999-999999999999",
    );
  });
});
