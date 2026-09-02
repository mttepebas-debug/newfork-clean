import type { ConflictWarning } from "./types.js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatWarning(w: ConflictWarning, opts: { detail: boolean }): string {
  if (w.type === "time_overlap") {
    if (!opts.detail) return "Time overlap";
    return w.conflicting_shifts
      .map((s) => {
        const label = s.shift_type_label
          ? `${s.shift_type_label}, ${s.location_name}`
          : s.location_name;
        return `Already scheduled ${s.start_time}–${s.end_time} — ${label}`;
      })
      .join("; ");
  }

  if (w.type === "named_shift_duplicate") {
    if (!opts.detail) return "Named shift duplicate";
    return w.conflicting_shifts
      .map((s) => {
        const label = s.shift_type_label ?? "this named shift";
        return `Already assigned to ${label} — ${s.location_name}`;
      })
      .join("; ");
  }

  if (w.type === "availability") {
    if (!opts.detail) return "Unavailable";
    const day = DAYS[w.day_of_week] ?? "this day";
    if (w.rule_kind === "all_day") return `Unavailable ${day} all day`;
    if (w.rule_kind === "bucket") return `Unavailable ${day} ${w.bucket}s`;
    if (w.rule_kind === "time_range") {
      return `Unavailable ${day} ${w.start_time ?? ""}–${w.end_time ?? ""}`.trim();
    }
    return `Unavailable for ${w.shift_type_label ?? "this shift type"} on ${day}`;
  }

  if (w.type === "time_off") {
    if (!opts.detail) return "Approved time off";
    if (w.full_day) return `Approved time off on ${w.date}`;
    return `Approved time off on ${w.date} ${w.start_time ?? ""}–${w.end_time ?? ""}`.trim();
  }

  if (w.type === "availability_limited") {
    if (!opts.detail) return "Limited";
    const day = DAYS[w.day_of_week] ?? "this day";
    if (w.rule_kind === "all_day") return `Limited availability ${day} all day`;
    if (w.rule_kind === "bucket") return `Limited availability ${day} ${w.bucket}s`;
    if (w.rule_kind === "time_range") {
      return `Limited availability ${day} ${w.start_time ?? ""}–${w.end_time ?? ""}`.trim();
    }
    return `Limited availability for ${w.shift_type_label ?? "this shift type"} on ${day}`;
  }

  if (w.type === "employee_document_expired") {
    return opts.detail ? w.message : "Document expired";
  }

  // closed_day
  if (!opts.detail) return "Location closed";
  if (w.scope === "all_day") {
    return w.reason ? `Location closed — ${w.reason}` : "Location closed all day";
  }
  return w.shift_type_label
    ? `Location closed for ${w.shift_type_label}`
    : "Location closed for this shift type";
}
