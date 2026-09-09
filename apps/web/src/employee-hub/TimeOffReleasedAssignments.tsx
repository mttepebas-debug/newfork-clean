import type { TimeOffReleasedAssignment } from "@newfork/shared";
import { formatTimeOffInstant } from "./time-off-split";

export function TimeOffReleasedAssignments({ assignments, timeFormat }: { assignments?: TimeOffReleasedAssignment[]; timeFormat: "12h" | "24h" }) {
  if (!assignments?.length) return null;
  return <ul aria-label="Assignments released with this decision">
    {assignments.map(shift => <li key={shift.id}>
      <strong>Entire shift released to open coverage</strong>
      <p>{shift.location_name} · {shift.job_name}<br />{shift.starts_at && shift.ends_at
        ? `${formatTimeOffInstant(shift.starts_at, shift.timezone, timeFormat)} – ${formatTimeOffInstant(shift.ends_at, shift.timezone, timeFormat)}`
        : `${shift.scheduled_date} · Hours were unverified`}</p>
    </li>)}
  </ul>;
}
