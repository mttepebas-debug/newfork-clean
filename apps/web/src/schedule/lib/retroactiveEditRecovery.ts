import {
  ScheduleRequestError,
  type PastEditFinding,
} from "../schedule-data";

export type RetroactiveEditRecovery =
  | {
      readonly mode: "blocked" | "confirm";
      readonly findings: readonly PastEditFinding[];
      readonly messages: readonly string[];
    }
  | null;

function isPastEditReason(value: unknown): value is PastEditFinding["reason"] {
  return value === "shift_started" || value === "past_week";
}

export function parsePastEditFinding(value: unknown): PastEditFinding | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    record.op_type !== "create" &&
    record.op_type !== "update" &&
    record.op_type !== "delete"
  ) {
    return null;
  }
  if (
    typeof record.scheduled_date !== "string" ||
    typeof record.location_name !== "string" ||
    !isPastEditReason(record.reason) ||
    (record.severity !== "blocked" && record.severity !== "warning")
  ) {
    return null;
  }
  return {
    op_type: record.op_type,
    shift_id: typeof record.shift_id === "string" ? record.shift_id : null,
    scheduled_date: record.scheduled_date,
    location_name: record.location_name,
    employee_name:
      typeof record.employee_name === "string" ? record.employee_name : null,
    reason: record.reason,
    severity: record.severity,
  };
}

export function parseRetroactiveEditError(
  error: unknown,
): RetroactiveEditRecovery {
  if (!(error instanceof ScheduleRequestError)) return null;
  const body = error.body;
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (
    record.status !== "past_shift_edit_requires_ack" &&
    record.status !== "past_edit_blocked"
  ) {
    return null;
  }
  const findings = Array.isArray(record.past_edits)
    ? record.past_edits
        .map(parsePastEditFinding)
        .filter((finding): finding is PastEditFinding => Boolean(finding))
    : [];
  const messages = Array.isArray(record.past_edit_messages)
    ? record.past_edit_messages.filter(
        (message): message is string => typeof message === "string",
      )
    : [];
  return {
    mode: record.status === "past_edit_blocked" ? "blocked" : "confirm",
    findings,
    messages,
  };
}
