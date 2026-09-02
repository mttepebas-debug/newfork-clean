import {
  schedulePublicationPreviewSchema,
  type SchedulePublicationPreview,
} from "@newfork/shared/schedule";

import { ScheduleRequestError } from "../schedule-data";
import type { PublishPreflightBlockReason } from "../components/PublishPreflightPanel";

export interface PublishScheduleConflictSummary {
  readonly employee_id: string;
  readonly employee_name: string | null;
  readonly date: string;
  readonly first: {
    readonly shift_id: string;
    readonly time_range: string;
  };
  readonly second: {
    readonly shift_id: string;
    readonly time_range: string;
  };
}

export function isPublishPreflightBlockReason(
  value: unknown,
): value is PublishPreflightBlockReason {
  return (
    value === "unacknowledged" ||
    value === "stale_fingerprint" ||
    value === "not_overrideable" ||
    value === "missing_reason"
  );
}

export function parsePublishPreflightError(error: unknown):
  | {
      readonly preview: SchedulePublicationPreview;
      readonly blockReason: PublishPreflightBlockReason;
    }
  | null {
  if (!(error instanceof ScheduleRequestError)) return null;
  const body = error.body;
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (record.status !== "preflight") return null;
  const parsedPreview = schedulePublicationPreviewSchema.safeParse(
    record.preflight,
  );
  if (!parsedPreview.success) return null;
  return {
    preview: parsedPreview.data,
    blockReason: isPublishPreflightBlockReason(record.preflight_block_reason)
      ? record.preflight_block_reason
      : "unacknowledged",
  };
}

export function parsePublishScheduleConflict(value: unknown):
  | PublishScheduleConflictSummary
  | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const first =
    record.first && typeof record.first === "object"
      ? (record.first as Record<string, unknown>)
      : null;
  const second =
    record.second && typeof record.second === "object"
      ? (record.second as Record<string, unknown>)
      : null;
  if (
    typeof record.employee_id !== "string" ||
    typeof record.date !== "string" ||
    !first ||
    typeof first.shift_id !== "string" ||
    typeof first.time_range !== "string" ||
    !second ||
    typeof second.shift_id !== "string" ||
    typeof second.time_range !== "string"
  ) {
    return null;
  }
  return {
    employee_id: record.employee_id,
    employee_name:
      typeof record.employee_name === "string" ? record.employee_name : null,
    date: record.date,
    first: {
      shift_id: first.shift_id,
      time_range: first.time_range,
    },
    second: {
      shift_id: second.shift_id,
      time_range: second.time_range,
    },
  };
}

export function parsePublishRecoveryError(error: unknown):
  | {
      readonly type: "stale_baseline";
      readonly message: string;
    }
  | {
      readonly type: "schedule_conflicts";
      readonly conflicts: readonly PublishScheduleConflictSummary[];
    }
  | null {
  if (!(error instanceof ScheduleRequestError)) return null;
  const body = error.body;
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (record.status === "stale_baseline") {
    return {
      type: "stale_baseline",
      message:
        "The published schedule changed while this dialog was open. Review the locations again.",
    };
  }
  if (record.status === "schedule_conflicts") {
    const conflicts = Array.isArray(record.schedule_conflicts)
      ? record.schedule_conflicts
          .map(parsePublishScheduleConflict)
          .filter(
            (
              conflict,
            ): conflict is PublishScheduleConflictSummary =>
              Boolean(conflict),
          )
      : [];
    return {
      type: "schedule_conflicts",
      conflicts,
    };
  }
  return null;
}

export function publishScheduleConflictLabel(
  conflict: PublishScheduleConflictSummary,
) {
  return `${conflict.employee_name ?? "Employee"}: ${conflict.date}, ${
    conflict.first.time_range
  } and ${conflict.second.time_range}`;
}
