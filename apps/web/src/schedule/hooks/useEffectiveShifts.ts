import type {
  SchedulePendingOp,
  ScheduleShift,
} from "@newfork/shared/schedule";
import { useMemo } from "react";

export type EffectiveScheduleShift = ScheduleShift & {
  readonly pending_op_id?: string;
  readonly pending_op_type?: SchedulePendingOp["op_type"];
  readonly pending_deleted?: boolean;
  readonly optimistic?: boolean;
  readonly saving_state?: "saving" | "delayed" | null;
};

type ShiftPublicationMetadata = {
  readonly source_published_shift_id?: string | null;
  readonly locked?: boolean | null;
};

const SHIFT_PAYLOAD_KEYS = [
  "location_id",
  "employee_id",
  "shift_type_id",
  "job_id",
  "label_ids",
  "label_names",
  "scheduled_date",
  "start_time",
  "end_time",
  "crosses_midnight",
  "unpaid_break_minutes",
  "hide_time_on_badge",
  "time_basis",
  "time_snapshot",
  "time_timezone",
  "note",
] as const;

function payloadValue<T>(
  payload: Record<string, unknown>,
  key: string,
  fallback: T,
): T {
  return Object.prototype.hasOwnProperty.call(payload, key)
    ? (payload[key] as T)
    : fallback;
}

function syntheticCreatedShift(
  op: SchedulePendingOp,
): EffectiveScheduleShift | null {
  const payload = op.payload;
  const locationId = payloadValue(payload, "location_id", op.location_id);
  const scheduledDate = payloadValue(payload, "scheduled_date", op.week_start);
  const jobId = payloadValue<string | undefined>(payload, "job_id", undefined);
  const startTime = payloadValue<string | undefined>(
    payload,
    "start_time",
    undefined,
  );
  const endTime = payloadValue<string | undefined>(
    payload,
    "end_time",
    undefined,
  );

  const basis = payloadValue<ScheduleShift["time_basis"]>(payload, "time_basis", undefined);
  if (!jobId || (basis !== "unresolved" && (!startTime || !endTime))) return null;

  return {
    id: `pending:${op.id}`,
    location_id: locationId,
    employee_id: payloadValue<string | null>(payload, "employee_id", null),
    job_id: jobId,
    shift_type_id: payloadValue<string | null>(payload, "shift_type_id", null),
    scheduled_date: scheduledDate,
    start_time: startTime ?? "",
    end_time: endTime ?? "",
    time_basis: basis,
    time_snapshot: payloadValue<ScheduleShift["time_snapshot"]>(payload, "time_snapshot", null),
    time_timezone: payloadValue<ScheduleShift["time_timezone"]>(payload, "time_timezone", null),
    crosses_midnight: payloadValue(payload, "crosses_midnight", false) ?? false,
    unpaid_break_minutes: payloadValue(payload, "unpaid_break_minutes", 0),
    hide_time_on_badge: payloadValue(payload, "hide_time_on_badge", false),
    label_ids: payloadValue<string[]>(payload, "label_ids", []),
    label_names: payloadValue<string[]>(payload, "label_names", []),
    note: payloadValue(payload, "note", ""),
    warning_codes: [],
    pending_op_id: op.id,
    pending_op_type: op.op_type,
  };
}

function applyUpdate(
  shift: EffectiveScheduleShift,
  op: SchedulePendingOp,
): EffectiveScheduleShift {
  const patch = op.payload;
  const next: Record<string, unknown> = { ...shift };
  for (const key of SHIFT_PAYLOAD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      next[key] = patch[key];
    }
  }
  next.pending_op_id = op.id;
  next.start_time ??= "";
  next.end_time ??= "";
  next.crosses_midnight ??= false;
  next.pending_op_type = op.op_type;
  return next as unknown as EffectiveScheduleShift;
}

export function buildEffectiveShifts(
  canonicalShifts: readonly ScheduleShift[],
  pendingOps: readonly SchedulePendingOp[],
): EffectiveScheduleShift[] {
  const byId = new Map<string, EffectiveScheduleShift>();
  canonicalShifts.forEach((shift) => byId.set(shift.id, shift));

  for (const op of pendingOps) {
    if (op.op_type === "create") {
      const synthetic = syntheticCreatedShift(op);
      if (synthetic) byId.set(synthetic.id, synthetic);
      continue;
    }

    if (!op.target_shift_id) continue;

    if (op.op_type === "delete") {
      const existing = byId.get(op.target_shift_id);
      if (!existing) continue;
      const metadata = existing as EffectiveScheduleShift &
        ShiftPublicationMetadata;
      if (metadata?.source_published_shift_id || metadata?.locked) {
        byId.set(op.target_shift_id, {
          ...existing,
          pending_op_id: op.id,
          pending_op_type: op.op_type,
          pending_deleted: true,
        });
      } else {
        byId.delete(op.target_shift_id);
      }
      continue;
    }

    const existing = byId.get(op.target_shift_id);
    if (existing) byId.set(op.target_shift_id, applyUpdate(existing, op));
  }

  return Array.from(byId.values());
}

export function useEffectiveShifts(
  canonicalShifts: readonly ScheduleShift[],
  pendingOps: readonly SchedulePendingOp[] | undefined,
): EffectiveScheduleShift[] {
  return useMemo(
    () => buildEffectiveShifts(canonicalShifts, pendingOps ?? []),
    [canonicalShifts, pendingOps],
  );
}
