import type {
  ScheduleEmployee,
  ScheduleLocation,
  SchedulePublicationPreview,
} from "@newfork/shared/schedule";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import {
  formatAvailabilityRange,
  scheduleAvailabilityMarks,
} from "../lib/scheduleAvailabilityMark";

type PublishPreflightTier = "blocker" | "risk" | "note";
export type PublishPreflightBlockReason =
  | "unacknowledged"
  | "stale_fingerprint"
  | "not_overrideable";

const blockReasonText: Readonly<Record<PublishPreflightBlockReason, string>> = {
  unacknowledged: "Review the findings below before publishing.",
  stale_fingerprint:
    "The schedule changed while this dialog was open. The findings below are refreshed — review them again.",
  not_overrideable:
    "A finding here cannot be overridden. Fix it in the schedule and try again.",
};

type SchedulePublishFinding = SchedulePublicationPreview["findings"][number];

// "(unavailable after 2:00 PM)": the hours behind an availability warning, read
// from the week the Schedule already holds (G14). Null when it is not there.
function availabilityHours(
  finding: SchedulePublishFinding,
  employees: readonly ScheduleEmployee[],
): string | null {
  if (finding.code !== "availability" || !finding.employee_id) return null;
  const projection = employees
    .find((employee) => employee.id === finding.employee_id)
    ?.weekly_availability?.find((item) => item.location_id === finding.location_id);
  const mark = projection ? scheduleAvailabilityMarks(projection).get(finding.scheduled_date) : undefined;
  if (mark?.kind !== "unavailable") return null;
  return mark.windows
    .map((window) => {
      const text = formatAvailabilityRange("unavailable", window, "12h");
      return text.charAt(0).toLowerCase() + text.slice(1);
    })
    .join("; ");
}

export function isWeeklyAvailabilityFinding(finding: SchedulePublishFinding): boolean {
  return finding.severity === "soft" && finding.overrideable &&
    !!finding.availability_state && !!finding.warning_policy;
}

export function publishNewAvailabilityFindings(preview: SchedulePublicationPreview) {
  return preview.findings.filter((finding) => isWeeklyAvailabilityFinding(finding) && finding.availability_state === "new");
}

// "Ali shows as unavailable for this shift." A preference, never a blocker:
// the publisher confirms each new one once (BL-186).
export function publishNewAvailabilityWarnings(preview: SchedulePublicationPreview) {
  return publishNewAvailabilityFindings(preview).filter((finding) => finding.code === "availability");
}

export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

type SchedulePublishFindingWithPreflight = SchedulePublishFinding & {
  readonly tier?: PublishPreflightTier;
  readonly projected?: boolean;
  readonly introduced?: boolean;
  readonly fix_hint?: string | null;
  readonly location_name?: string | null;
  readonly date?: string | null;
};

function preflightTier(finding: SchedulePublishFinding): PublishPreflightTier {
  const tier = (finding as SchedulePublishFindingWithPreflight).tier;
  if (tier === "risk" || tier === "note" || tier === "blocker") return tier;
  return "blocker";
}

function findingGatesPublish(finding: SchedulePublishFinding): boolean {
  const enhanced = finding as SchedulePublishFindingWithPreflight;
  if (preflightTier(finding) === "note") return false;
  if (typeof enhanced.introduced === "boolean") {
    return enhanced.introduced || !finding.overrideable;
  }
  return true;
}

export function publishHardBlockers(preview: SchedulePublicationPreview) {
  return preview.findings.filter(
    (finding) =>
      finding.severity === "hard" || finding.conflict_severity === "block" || (
      findingGatesPublish(finding) &&
      !isWeeklyAvailabilityFinding(finding) &&
      preflightTier(finding) === "blocker" &&
      !finding.overrideable),
  );
}

export function publishOverrideableBlockers(
  preview: SchedulePublicationPreview,
) {
  return preview.findings.filter(
    (finding) =>
      findingGatesPublish(finding) &&
      !isWeeklyAvailabilityFinding(finding) &&
      preflightTier(finding) === "blocker" &&
      finding.overrideable &&
      finding.severity !== "hard",
  );
}

export function publishGatingRisks(preview: SchedulePublicationPreview) {
  return preview.findings.filter(
    (finding) =>
      !isWeeklyAvailabilityFinding(finding) && findingGatesPublish(finding) && preflightTier(finding) === "risk",
  );
}

export function publishInformationalFindings(preview: SchedulePublicationPreview) {
  return preview.findings.filter((finding) => !isWeeklyAvailabilityFinding(finding) && !findingGatesPublish(finding));
}

export function PublishPreflightPanel({
  preview,
  locations,
  blockReason = null,
  onReviewShift,
  reviewDisabled = false,
  availabilityAcknowledged = false,
  onAvailabilityAcknowledgedChange,
  employees = [],
}: {
  readonly preview: SchedulePublicationPreview;
  readonly locations: readonly ScheduleLocation[];
  readonly blockReason?: PublishPreflightBlockReason | null;
  readonly onReviewShift?: (finding: SchedulePublishFinding) => void;
  readonly reviewDisabled?: boolean;
  readonly availabilityAcknowledged?: boolean;
  readonly onAvailabilityAcknowledgedChange?: (value: boolean) => void;
  readonly employees?: readonly ScheduleEmployee[];
}) {
  const hard = publishHardBlockers(preview);
  const overrideable = publishOverrideableBlockers(preview);
  const risks = publishGatingRisks(preview);
  const informational = publishInformationalFindings(preview);
  const newAvailability = publishNewAvailabilityFindings(preview);
  const availabilityWarnings = newAvailability.filter((finding) => finding.code === "availability");
  const newConflicts = newAvailability.filter((finding) => finding.code !== "availability");
  const acceptedAvailability = preview.findings.filter((finding) => isWeeklyAvailabilityFinding(finding) && finding.availability_state === "accepted");
  const needsAvailabilityConfirmation = newAvailability.some((finding) => finding.warning_policy === "confirm");
  const ready =
    preview.status === "publish_ready" &&
    !hard.length &&
    !overrideable.length &&
    !risks.length && !needsAvailabilityConfirmation;
  const blockerCount = hard.length + overrideable.length;

  return (
    <section className="schedule-publish-preflight-panel" data-publish-preflight>
      <div className="schedule-publish-preflight-summary" data-ready={ready}>
        {ready ? (
          <CheckCircle2 size={17} aria-hidden />
        ) : (
          <ShieldAlert size={17} aria-hidden />
        )}
        <div>
          <strong>
            {ready
              ? "Ready to publish"
              : [
                  blockerCount ? countLabel(blockerCount, "blocker", "blockers") : null,
                  risks.length ? countLabel(risks.length, "risk", "risks") : null,
                  newConflicts.length ? countLabel(newConflicts.length, "schedule conflict", "schedule conflicts") : null,
                  availabilityWarnings.length
                    ? countLabel(availabilityWarnings.length, "availability warning", "availability warnings")
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </strong>
          <span>
            {ready
              ? "Nothing in this week's changes needs attention before it goes live."
              : blockReason
                ? blockReasonText[blockReason]
              : hard.length
                ? "Fix hard blockers in the schedule before publishing."
                : newConflicts.length
                  ? "Review the conflicts below, then continue to publish."
                : availabilityWarnings.length
                  ? "Some people are scheduled when they said they're unavailable. Confirm below to continue."
                : risks.length
                  ? "Review these warnings before publishing."
                  : "Every override is recorded with the published audit trail."}
          </span>
        </div>
      </div>

      {preview.status === "past_week_closed" ? (
        <FindingGroup
          tone="hard"
          title="Must be fixed in the schedule"
          findings={[
            {
              id: "past-week-closed",
              message: "Past schedule weeks cannot be published.",
              location_id: locations[0]?.id ?? "",
              scheduled_date: preview.week_start,
            },
          ]}
          locations={locations}
        />
      ) : null}

      {hard.length ? (
        <FindingGroup
          tone="hard"
          title="Must be fixed in the schedule"
          findings={hard}
          locations={locations}
        />
      ) : null}

      {overrideable.length ? (
        <FindingGroup
          tone="soft"
          title="Warnings to review"
          findings={overrideable}
          locations={locations}
        />
      ) : null}

      {newConflicts.length ? (
        <WeeklyAvailabilityGroup findings={newConflicts} locations={locations} employees={employees} title="Current schedule conflicts" onReviewShift={onReviewShift} reviewDisabled={reviewDisabled} />
      ) : null}
      {availabilityWarnings.length ? (
        <WeeklyAvailabilityGroup findings={availabilityWarnings} locations={locations} employees={employees} title="Availability" onReviewShift={onReviewShift} reviewDisabled={reviewDisabled}>
          <label className="schedule-publish-risk-ack">
            <input
              type="checkbox"
              checked={availabilityAcknowledged}
              disabled={reviewDisabled || !onAvailabilityAcknowledgedChange}
              onChange={(event) => onAvailabilityAcknowledgedChange?.(event.target.checked)}
            />
            <span>
              {availabilityWarnings.length === 1
                ? "I've seen this warning and want to publish anyway"
                : `I've seen these ${availabilityWarnings.length} warnings and want to publish anyway`}
            </span>
          </label>
        </WeeklyAvailabilityGroup>
      ) : null}
      {acceptedAvailability.length ? (
        <details className="schedule-publish-accepted-availability">
          <summary>Previously accepted ({acceptedAvailability.length})</summary>
          <WeeklyAvailabilityGroup findings={acceptedAvailability} locations={locations} employees={employees} title="Accepted warnings" onReviewShift={onReviewShift} reviewDisabled={reviewDisabled} />
        </details>
      ) : null}

      {risks.length ? (
        <FindingGroup
          tone="risk"
          title="Risks"
          findings={risks}
          locations={locations}
        >
        </FindingGroup>
      ) : null}

      {informational.length ? (
        <FindingGroup
          tone="note"
          title="Notes and already-live issues"
          findings={informational}
          locations={locations}
        >
          <small className="schedule-publish-finding-note-copy">
            These do not stop this publish — they either pre-date it or are informational.
          </small>
        </FindingGroup>
      ) : null}

    </section>
  );
}

function WeeklyAvailabilityGroup({ findings, locations, employees, title, onReviewShift, reviewDisabled, children }: {
  readonly findings: readonly SchedulePublishFinding[];
  readonly employees: readonly ScheduleEmployee[];
  readonly locations: readonly ScheduleLocation[];
  readonly title: string;
  readonly onReviewShift?: (finding: SchedulePublishFinding) => void;
  readonly reviewDisabled?: boolean;
  readonly children?: ReactNode;
}) {
  return <section className="schedule-publish-finding-group risk schedule-publish-weekly-availability">
    <div className="schedule-publish-finding-heading">
      {findings.every((finding) => finding.code === "availability") ? <AvailabilityDot /> : <AlertTriangle size={16} aria-hidden />}
      <strong>{title}</strong>
    </div>
    {findings.map((finding) => { const hours = availabilityHours(finding, employees); return <div key={finding.id} className="schedule-publish-finding-row schedule-publish-availability-row">
      <div><strong>{finding.code === "availability" ? <AvailabilityDot /> : null}{finding.employee_name ?? (finding.employee_id ? "Employee" : "Unassigned")}</strong>
        <small>{finding.scheduled_date} · {finding.location_name ?? locations.find((location) => location.id === finding.location_id)?.name ?? finding.location_id}</small>
        <span>{hours ? `${finding.message} (${hours})` : finding.message}</span>
      </div>
      {onReviewShift && finding.shift_ids.length ? <button type="button" disabled={reviewDisabled} aria-label={`Show ${finding.employee_name ?? "employee"}'s shift on ${finding.scheduled_date}`} title="Show shift" onClick={() => onReviewShift(finding)}><ArrowUpRight size={16} aria-hidden /></button> : null}
    </div>; })}
    {children}
  </section>;
}

// The Schedule card's orange "!" (G14): an availability warning, not a conflict.
function AvailabilityDot() {
  return <span className="schedule-availability-tip-dot" aria-hidden="true">!</span>;
}

function FindingGroup({
  title,
  tone,
  findings,
  locations,
  children,
}: {
  readonly title: string;
  readonly tone: "hard" | "soft" | "risk" | "note";
  readonly findings: readonly {
    readonly id: string;
    readonly message: string;
    readonly location_id: string;
    readonly scheduled_date: string;
    readonly projected?: boolean;
    readonly fix_hint?: string | null;
    readonly location_name?: string | null;
    readonly date?: string | null;
  }[];
  readonly locations: readonly ScheduleLocation[];
  readonly children?: ReactNode;
}) {
  return (
    <section className={`schedule-publish-finding-group ${tone}`}>
      <div className="schedule-publish-finding-heading">
        {tone === "note" ? (
          <Info size={16} aria-hidden />
        ) : (
          <AlertTriangle size={16} aria-hidden />
        )}
        <strong>{title}</strong>
      </div>
      {children}
      {findings.map((finding) => (
        <div key={finding.id} className="schedule-publish-finding-row">
          <strong>
            {finding.message}
            {finding.projected ? <em>Projected</em> : null}
          </strong>
          <small>
            {finding.date ?? finding.scheduled_date} ·{" "}
            {finding.location_name ??
              locations.find((location) => location.id === finding.location_id)
                ?.name ??
              finding.location_id}
          </small>
          {finding.fix_hint ? <p>{finding.fix_hint}</p> : null}
        </div>
      ))}
    </section>
  );
}
