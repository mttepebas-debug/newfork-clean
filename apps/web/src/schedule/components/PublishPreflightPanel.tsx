import type {
  ScheduleEmployee,
  ScheduleLocation,
  SchedulePublicationPreview,
} from "@newfork/shared/schedule";
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronDown, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import {
  formatAvailabilityMarkDay,
  formatAvailabilityRange,
  scheduleAvailabilityMarks,
} from "../lib/scheduleAvailabilityMark";
import { timeOffV2Enabled } from "../../time-off/time-off-flag";

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

/**
 * Where a time off note opens its request (time off rebuild D3b): behind the time-off-v2 flag, a request in
 * the new table opens the new answer drawer. Anything else keeps today's note with no link, so a new id
 * never reaches the old drawer (or an old id the new one).
 */
export function pendingTimeOffHref(
  finding: Pick<SchedulePublishFinding, "code" | "time_off_request_id" | "time_off_source">,
  timeOffV2: boolean,
): string | null {
  if (!timeOffV2 || finding.code !== "time_off_pending" || finding.time_off_source !== "current" || !finding.time_off_request_id)
    return null;
  return `/app/schedule/requests?type=time_off&request=${encodeURIComponent(finding.time_off_request_id)}`;
}

// "Unavailable after 2:00 PM": the hours behind an availability line, read
// from the week the Schedule already holds (G14). Null when it is not there.
function availabilityHours(
  finding: SchedulePublishFinding,
  employees: readonly ScheduleEmployee[],
): string | null {
  if (!finding.employee_id) return null;
  const projection = employees
    .find((employee) => employee.id === finding.employee_id)
    ?.weekly_availability?.find((item) => item.location_id === finding.location_id);
  const mark = projection ? scheduleAvailabilityMarks(projection).get(finding.scheduled_date) : undefined;
  if (mark?.kind !== "unavailable") return null;
  return mark.windows.map((window) => formatAvailabilityRange("unavailable", window, "12h")).join("; ");
}

// The employee's own mark under a shift: a last look, never asked (M9).
function isAvailabilityLook(finding: SchedulePublishFinding): boolean {
  return finding.code === "availability" && !finding.availability_state;
}

export function publishAvailabilityLook(preview: SchedulePublicationPreview) {
  return preview.findings.filter(isAvailabilityLook);
}

export function isWeeklyAvailabilityFinding(finding: SchedulePublishFinding): boolean {
  return finding.severity === "soft" && finding.overrideable &&
    !!finding.availability_state && !!finding.warning_policy;
}

export function publishNewAvailabilityFindings(preview: SchedulePublicationPreview) {
  return preview.findings.filter((finding) => isWeeklyAvailabilityFinding(finding) && finding.availability_state === "new");
}

export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Pre-flight's one count, at the top, in plain words (BL-441; KARARLAR:524,
 * KK-166, KK-221): what blocked publishing needs a fix, warnings and new
 * conflicts are to review. A finding about a person counts as the shift
 * that raised it.
 */
export function preflightCountSentence(fix: number, review: number): string {
  const needsFix = `${countLabel(fix, "shift needs", "shifts need")} a fix before you can publish.`;
  if (fix && review) return `${needsFix} ${review} more to review.`;
  if (fix) return needsFix;
  if (review) return `${countLabel(review, "shift", "shifts")} to review before you publish.`;
  return "";
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
  return preview.findings.filter((finding) => !isWeeklyAvailabilityFinding(finding) && !isAvailabilityLook(finding) && !findingGatesPublish(finding));
}

export function PublishPreflightPanel({
  preview,
  locations,
  blockReason = null,
  onReviewShift,
  reviewDisabled = false,
  employees = [],
}: {
  readonly preview: SchedulePublicationPreview;
  readonly locations: readonly ScheduleLocation[];
  readonly blockReason?: PublishPreflightBlockReason | null;
  readonly onReviewShift?: (finding: SchedulePublishFinding) => void;
  readonly reviewDisabled?: boolean;
  readonly employees?: readonly ScheduleEmployee[];
}) {
  const hard = publishHardBlockers(preview);
  const overrideable = publishOverrideableBlockers(preview);
  const risks = publishGatingRisks(preview);
  const informational = publishInformationalFindings(preview);
  const timeOffV2 = timeOffV2Enabled();
  const newConflicts = publishNewAvailabilityFindings(preview);
  const availabilityLook = publishAvailabilityLook(preview);
  // Another rule's conflict accepted at the last publish stays listed (KK-132);
  // the employee's availability never lands here (it carries no state).
  const acceptedConflicts = preview.findings.filter((finding) => isWeeklyAvailabilityFinding(finding) && finding.availability_state === "accepted");
  const needsAvailabilityConfirmation = newConflicts.some((finding) => finding.warning_policy === "confirm");
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
              : preflightCountSentence(blockerCount, risks.length + newConflicts.length)}
          </strong>
          <span>
            {ready
              ? availabilityLook.length
                ? "No blockers. One thing to glance at below."
                : "Nothing in this week's changes needs attention before it goes live."
              : blockReason
                ? blockReasonText[blockReason]
              : hard.length
                ? null
                : newConflicts.length
                  ? "Review the conflicts below, then continue to publish."
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
        <WeeklyAvailabilityGroup findings={newConflicts} locations={locations} title="Current schedule conflicts" onReviewShift={onReviewShift} reviewDisabled={reviewDisabled} />
      ) : null}
      {availabilityLook.length ? (
        <AvailabilityFold findings={availabilityLook} employees={employees} onReviewShift={onReviewShift} reviewDisabled={reviewDisabled} />
      ) : null}
      {acceptedConflicts.length ? (
        <details className="schedule-publish-accepted-availability">
          <summary>Previously accepted ({acceptedConflicts.length})</summary>
          <WeeklyAvailabilityGroup findings={acceptedConflicts} locations={locations} title="Accepted warnings" onReviewShift={onReviewShift} reviewDisabled={reviewDisabled} />
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
          linkFor={(finding) => {
            const href = pendingTimeOffHref(finding, timeOffV2);
            return href ? { href, label: `Review ${finding.employee_name ?? "this person"}'s time off request` } : null;
          }}
        >
          <small className="schedule-publish-finding-note-copy">
            These do not stop this publish — they either pre-date it or are informational.
          </small>
        </FindingGroup>
      ) : null}

    </section>
  );
}

// S3 B (2026-10-04): one folded line says how many people; it opens to a short list.
function AvailabilityFold({ findings, employees, onReviewShift, reviewDisabled }: {
  readonly findings: readonly SchedulePublishFinding[];
  readonly employees: readonly ScheduleEmployee[];
  readonly onReviewShift?: (finding: SchedulePublishFinding) => void;
  readonly reviewDisabled?: boolean;
}) {
  // Day by day, as the week reads; the server lists them shift by shift.
  const byDay = [...findings].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  const names = [...new Set(byDay.map((finding) => finding.employee_name ?? "Employee"))];
  return (
    <details className="schedule-publish-availability-fold">
      <summary>
        <AvailabilityDot />
        <span className="schedule-publish-availability-fold-text">
          <strong>
            {names.length === 1 ? "1 person is" : `${names.length} people are`} scheduled while unavailable
          </strong>
          <small>{countLabel(findings.length, "shift", "shifts")} · {names.join(", ")}</small>
        </span>
        <ChevronDown size={16} aria-hidden className="schedule-publish-availability-fold-chevron" />
      </summary>
      <ul>
        {byDay.map((finding) => {
          const name = finding.employee_name ?? "Employee";
          const day = formatAvailabilityMarkDay(finding.scheduled_date);
          return (
            <li key={finding.id}>
              <span><strong>{name}</strong> · {day}</span>
              <small>{availabilityHours(finding, employees) ?? "Unavailable"}</small>
              {onReviewShift && finding.shift_ids.length ? (
                <button type="button" disabled={reviewDisabled} aria-label={`Show ${name}'s shift on ${day}`} title="Show shift" onClick={() => onReviewShift(finding)}>
                  <ArrowUpRight size={16} aria-hidden />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function WeeklyAvailabilityGroup({ findings, locations, title, onReviewShift, reviewDisabled }: {
  readonly findings: readonly SchedulePublishFinding[];
  readonly locations: readonly ScheduleLocation[];
  readonly title: string;
  readonly onReviewShift?: (finding: SchedulePublishFinding) => void;
  readonly reviewDisabled?: boolean;
}) {
  return <section className="schedule-publish-finding-group risk schedule-publish-weekly-availability">
    <div className="schedule-publish-finding-heading">
      <AlertTriangle size={16} aria-hidden />
      <strong>{title}</strong>
    </div>
    {findings.map((finding) => <div key={finding.id} className="schedule-publish-finding-row schedule-publish-availability-row">
      <div><strong>{finding.employee_name ?? (finding.employee_id ? "Employee" : "Unassigned")}</strong>
        <small>{finding.scheduled_date} · {finding.location_name ?? locations.find((location) => location.id === finding.location_id)?.name ?? finding.location_id}</small>
        <span>{finding.message}</span>
      </div>
      {onReviewShift && finding.shift_ids.length ? <button type="button" disabled={reviewDisabled} aria-label={`Show ${finding.employee_name ?? "employee"}'s shift on ${finding.scheduled_date}`} title="Show shift" onClick={() => onReviewShift(finding)}><ArrowUpRight size={16} aria-hidden /></button> : null}
    </div>)}
  </section>;
}

// The Schedule card's orange "!" (G14): an availability warning, not a conflict.
function AvailabilityDot() {
  return <span className="schedule-availability-tip-dot" aria-hidden="true">!</span>;
}

function FindingGroup<F extends {
    readonly id: string;
    readonly message: string;
    readonly location_id: string;
    readonly scheduled_date: string;
    readonly projected?: boolean;
    readonly fix_hint?: string | null;
    readonly location_name?: string | null;
    readonly date?: string | null;
  }>({
  title,
  tone,
  findings,
  locations,
  linkFor,
  children,
}: {
  readonly title: string;
  readonly tone: "hard" | "soft" | "risk" | "note";
  readonly findings: readonly F[];
  readonly locations: readonly ScheduleLocation[];
  /** A row that opens something elsewhere: a new tab, so the publish stays where it is. */
  readonly linkFor?: (finding: F) => { readonly href: string; readonly label: string } | null;
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
          {(() => {
            const link = linkFor?.(finding);
            return link ? (
              <a className="schedule-publish-finding-link" href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label}>
                Review request
                <ArrowUpRight size={14} aria-hidden />
              </a>
            ) : null;
          })()}
        </div>
      ))}
    </section>
  );
}
