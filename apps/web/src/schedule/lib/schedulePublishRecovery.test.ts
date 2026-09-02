import type { SchedulePublicationPreview } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import { ScheduleRequestError } from "../schedule-data";
import {
  parsePublishPreflightError,
  parsePublishRecoveryError,
  parsePublishScheduleConflict,
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
});
