import { ArrowRightLeft, Check } from "lucide-react";
import type { LineupCandidate } from "@newfork/shared";

const groups: {
  id: NonNullable<LineupCandidate["display_group"]>;
  label: string;
}[] = [
  { id: "eligible", label: "Eligible" },
  { id: "not_suitable", label: "Not suitable" },
  { id: "working_elsewhere", label: "Working somewhere else" },
  { id: "working_here", label: "Working here" },
  { id: "day_off", label: "Day off" },
  { id: "missing_location", label: "Not assigned to this location" },
  { id: "missing_job", label: "Not assigned to this job" },
];

function hasAvailabilityConflict(candidate: LineupCandidate) {
  return (
    candidate.has_availability_conflict ?? !!candidate.availability_warning
  );
}

function candidateGroup(candidate: LineupCandidate) {
  if (candidate.display_group) return candidate.display_group;
  // Older responses cannot establish work/day-off or employment groups.
  if (candidate.status === "movable" && candidate.move_source)
    return "working_elsewhere";
  return candidate.status === "eligible" && !hasAvailabilityConflict(candidate)
    ? "eligible"
    : "not_suitable";
}

export function LineupCandidateList({
  candidates,
  selectedEmployeeId,
  onSelect,
}: {
  candidates: LineupCandidate[];
  selectedEmployeeId: string | null;
  onSelect: (candidate: LineupCandidate) => void;
}) {
  if (!candidates.length)
    return <p>No candidates match. Try another name, position or time.</p>;
  return (
    <div className="lu-candidate-list">
      {groups.map((group) => {
        const members = candidates.filter(
          (candidate) => candidateGroup(candidate) === group.id,
        );
        if (!members.length) return null;
        return (
          <section
            className="lu-candidate-group"
            key={group.id}
            aria-label={group.label}
          >
            <h4>
              {group.label}
              <span>{members.length}</span>
            </h4>
            {members.map((candidate) => (
              <button
                type="button"
                className="lu-candidate"
                key={candidate.employee_id}
                aria-pressed={selectedEmployeeId === candidate.employee_id}
                disabled={
                  !(
                    candidate.status === "eligible" ||
                    candidate.status === "partial" ||
                    (candidate.status === "movable" && candidate.move_source)
                  )
                }
                onClick={() => onSelect(candidate)}
              >
                <span className="lu-avatar">
                  {candidate.display_name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span>
                  <strong>{candidate.display_name}</strong>
                  {candidate.context_labels?.map((label) => (
                    <small key={label}>{label}</small>
                  ))}
                  <small>{candidate.reasons.join(" · ")}</small>
                  {candidate.move_source ? (
                    <small>
                      {candidate.move_source.date} ·{" "}
                      {candidate.move_source.start_time}–
                      {candidate.move_source.end_time} ·{" "}
                      {candidate.move_source.timezone}
                    </small>
                  ) : null}
                  <span
                    className={`lu-badge ${candidate.status === "eligible" && !hasAvailabilityConflict(candidate) ? "success" : "warning"}`}
                  >
                    {hasAvailabilityConflict(candidate)
                      ? "Availability conflict"
                      : candidate.status === "movable"
                        ? "Review move impact"
                        : candidate.status.replaceAll("_", " ")}
                  </span>
                </span>
                {selectedEmployeeId === candidate.employee_id ? (
                  <Check size={17} />
                ) : candidate.status === "movable" ? (
                  <ArrowRightLeft size={17} />
                ) : null}
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}
