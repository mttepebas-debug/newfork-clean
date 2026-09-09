import {
  schedulePublicationPreviewSchema,
  type SchedulePublicationPreview,
} from "@newfork/shared/schedule";

import { ScheduleRequestError } from "../schedule-data";
import type { PublishPreflightBlockReason } from "../components/PublishPreflightPanel";
import { isWeeklyAvailabilityFinding } from "../components/PublishPreflightPanel";

export function canContinueWarnOnlyPublication(previous: SchedulePublicationPreview, next: SchedulePublicationPreview): boolean {
  if (!["publish_ready", "override_required"].includes(next.status) || previous.fingerprint === next.fingerprint) return false;
  const isWarn = (finding: SchedulePublicationPreview["findings"][number]) => isWeeklyAvailabilityFinding(finding) && finding.warning_policy === "warn";
  // Normalize both schema shapes before comparing. Only warn findings may differ;
  // draft, publication baseline, recipients and every other decision stay fixed.
  const comparable = (value: SchedulePublicationPreview) => {
    const { fingerprint: _fingerprint, status: _status, findings, locations, ...scope } = schedulePublicationPreviewSchema.parse(value);
    return JSON.stringify({ ...scope,
      locations: locations.map(location => ({ ...location, affected_employee_ids: [...location.affected_employee_ids].sort() })).sort((a, b) => a.location_id.localeCompare(b.location_id)),
      findings: findings.filter(finding => !isWarn(finding)).sort((a, b) => a.id.localeCompare(b.id)),
    });
  };
  const warnFindings = (value: SchedulePublicationPreview) => JSON.stringify(schedulePublicationPreviewSchema.parse(value).findings.filter(isWarn).sort((a, b) => a.id.localeCompare(b.id)));
  return warnFindings(previous) !== warnFindings(next) && comparable(previous) === comparable(next);
}

export interface PublishScheduleConflictSummary {
  readonly kind?: "shift_overlap";
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

export interface PublishDocumentScheduleConflictSummary {
  readonly kind: "document_expiry";
  readonly employee_id: string;
  readonly employee_name: string | null;
  readonly shift_id: string;
  readonly location_id: string;
  readonly location_name: string;
  readonly date: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly document_type_id: string;
  readonly requirement_id: string;
  readonly document_id: string;
  readonly document_title: string;
  readonly expiry_date: string;
  readonly expiry_policy_version: number;
  readonly pending_document_id: string | null;
  readonly review_action: "review_document" | null;
  readonly severity: "soft" | "hard";
  readonly overrideable: boolean;
  readonly warning_text: string;
  readonly conflict_fingerprint?: string;
}

export type PublishScheduleConflict =
  | PublishScheduleConflictSummary
  | PublishDocumentScheduleConflictSummary;

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
  | PublishScheduleConflict
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
    typeof record.employee_id === "string" &&
    typeof record.date === "string" &&
    typeof record.shift_id === "string" &&
    typeof record.location_id === "string" &&
    typeof record.location_name === "string" &&
    typeof record.start_time === "string" &&
    typeof record.end_time === "string" &&
    typeof record.document_type_id === "string" &&
    typeof record.requirement_id === "string" &&
    typeof record.document_id === "string" &&
    typeof record.document_title === "string" &&
    typeof record.expiry_date === "string" &&
    typeof record.expiry_policy_version === "number" &&
    (record.severity === "soft" || record.severity === "hard") &&
    typeof record.overrideable === "boolean" &&
    typeof record.warning_text === "string"
  ) {
    return {
      kind: "document_expiry",
      employee_id: record.employee_id,
      employee_name:
        typeof record.employee_name === "string" ? record.employee_name : null,
      shift_id: record.shift_id,
      location_id: record.location_id,
      location_name: record.location_name,
      date: record.date,
      start_time: record.start_time,
      end_time: record.end_time,
      document_type_id: record.document_type_id,
      requirement_id: record.requirement_id,
      document_id: record.document_id,
      document_title: record.document_title,
      expiry_date: record.expiry_date,
      expiry_policy_version: record.expiry_policy_version,
      pending_document_id:
        typeof record.pending_document_id === "string"
          ? record.pending_document_id
          : null,
      review_action:
        record.review_action === "review_document" ? "review_document" : null,
      severity: record.severity,
      overrideable: record.overrideable,
      warning_text: record.warning_text,
      conflict_fingerprint:
        typeof record.conflict_fingerprint === "string"
          ? record.conflict_fingerprint
          : undefined,
    };
  }
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
      readonly conflicts: readonly PublishScheduleConflict[];
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
            ): conflict is PublishScheduleConflict =>
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
  conflict: PublishScheduleConflict,
) {
  if (conflict.kind === "document_expiry") {
    return `${conflict.employee_name ?? "Employee"}: ${conflict.date}, ${
      conflict.warning_text
    }`;
  }
  return `${conflict.employee_name ?? "Employee"}: ${conflict.date}, ${
    conflict.first.time_range
  } and ${conflict.second.time_range}`;
}

export function publishScheduleConflictKey(conflict: PublishScheduleConflict) {
  if (conflict.kind === "document_expiry") {
    return `document-${conflict.employee_id}-${conflict.shift_id}-${conflict.requirement_id}-${conflict.document_id}`;
  }
  return `shift-${conflict.employee_id}-${conflict.first.shift_id}-${conflict.second.shift_id}`;
}
