import type {
  ScheduleLocation,
  SchedulePublicationPreview,
} from "@newfork/shared/schedule";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

export const publishOverrideReasonMinLength = 10;

type PublishPreflightTier = "blocker" | "risk" | "note";
export type PublishPreflightBlockReason =
  | "unacknowledged"
  | "stale_fingerprint"
  | "not_overrideable"
  | "missing_reason";

const blockReasonText: Readonly<Record<PublishPreflightBlockReason, string>> = {
  unacknowledged: "Review the findings below before publishing.",
  stale_fingerprint:
    "The schedule changed while this dialog was open. The findings below are refreshed — review them again.",
  not_overrideable:
    "A finding here cannot be overridden. Fix it in the schedule and try again.",
  missing_reason: "Every blocker you override needs a written reason.",
};

type SchedulePublishFinding = SchedulePublicationPreview["findings"][number];

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
      findingGatesPublish(finding) &&
      preflightTier(finding) === "blocker" &&
      (!finding.overrideable || finding.severity === "hard"),
  );
}

export function publishOverrideableBlockers(
  preview: SchedulePublicationPreview,
) {
  return preview.findings.filter(
    (finding) =>
      findingGatesPublish(finding) &&
      preflightTier(finding) === "blocker" &&
      finding.overrideable &&
      finding.severity !== "hard",
  );
}

export function publishGatingRisks(preview: SchedulePublicationPreview) {
  return preview.findings.filter(
    (finding) =>
      findingGatesPublish(finding) && preflightTier(finding) === "risk",
  );
}

export function publishInformationalFindings(preview: SchedulePublicationPreview) {
  return preview.findings.filter((finding) => !findingGatesPublish(finding));
}

export function PublishPreflightPanel({
  preview,
  locations,
  overrideReasons,
  onOverrideReasonChange,
  risksAcknowledged = false,
  onRisksAcknowledgedChange,
  blockReason = null,
}: {
  readonly preview: SchedulePublicationPreview;
  readonly locations: readonly ScheduleLocation[];
  readonly overrideReasons: Readonly<Record<string, string>>;
  readonly onOverrideReasonChange: (findingId: string, value: string) => void;
  readonly risksAcknowledged?: boolean;
  readonly onRisksAcknowledgedChange?: (value: boolean) => void;
  readonly blockReason?: PublishPreflightBlockReason | null;
}) {
  const hard = publishHardBlockers(preview);
  const overrideable = publishOverrideableBlockers(preview);
  const risks = publishGatingRisks(preview);
  const informational = publishInformationalFindings(preview);
  const ready =
    preview.status === "publish_ready" &&
    !hard.length &&
    !overrideable.length &&
    !risks.length;
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
                  blockerCount
                    ? `${blockerCount} ${blockerCount === 1 ? "blocker" : "blockers"}`
                    : null,
                  risks.length
                    ? `${risks.length} ${risks.length === 1 ? "risk" : "risks"}`
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
                : risks.length
                  ? "Blockers stop the publish. Risks go live once acknowledged."
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
          title="Blockers — override with a reason"
          findings={overrideable}
          locations={locations}
          overrideReasons={overrideReasons}
          onOverrideReasonChange={onOverrideReasonChange}
        />
      ) : null}

      {risks.length ? (
        <FindingGroup
          tone="risk"
          title="Risks"
          findings={risks}
          locations={locations}
        >
          <label className="schedule-publish-risk-ack">
            <input
              type="checkbox"
              checked={risksAcknowledged}
              onChange={(event) =>
                onRisksAcknowledgedChange?.(event.target.checked)
              }
            />
            <span>
              Publish with{" "}
              {risks.length === 1 ? "this risk" : `these ${risks.length} risks`}.
            </span>
          </label>
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

function FindingGroup({
  title,
  tone,
  findings,
  locations,
  overrideReasons = {},
  onOverrideReasonChange,
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
  readonly overrideReasons?: Readonly<Record<string, string>>;
  readonly onOverrideReasonChange?: (findingId: string, value: string) => void;
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
      {findings.map((finding) => {
        const reason = overrideReasons[finding.id] ?? "";
        const reasonTooShort =
          reason.trim().length > 0 &&
          reason.trim().length < publishOverrideReasonMinLength;
        return (
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
            {onOverrideReasonChange ? (
              <label>
                Reason
                <textarea
                  aria-label="Reason"
                  value={reason}
                  minLength={publishOverrideReasonMinLength}
                  maxLength={500}
                  placeholder="Why is this being published anyway? (recorded in the audit log)"
                  onChange={(event) =>
                    onOverrideReasonChange(finding.id, event.target.value)
                  }
                />
                {reasonTooShort ? (
                  <span>
                    At least {publishOverrideReasonMinLength} characters.
                  </span>
                ) : null}
              </label>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
