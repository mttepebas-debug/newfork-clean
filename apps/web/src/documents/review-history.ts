import type { DocumentDetail } from "@newfork/shared";
import { zoneName } from "../lib/today";
import { daysLeftLabel } from "./review-decision";
import { firstName, formatDate, formatDay, formatMoment, type Fact } from "./document-review-facts";

// History in the manager's review drawer (A2 Tur 6, mockup-spec 14): one timeline, newest first, from the API's
// history (K1 decision 8). Each event says what happened and when, in plain words; nobody is named as having done
// it, because the API names no one. A draft's uploads are not events of the document. A version's files are named
// in the events that sent and decided it, with what was decided on each; a version the history does not tell still
// gets its "sent" event, so every version and its files stay in reach.

type Submission = DocumentDetail["submissions"][number];
type Event = DocumentDetail["history"][number];

export type TimelineIcon =
  | "sent"
  | "approved"
  | "rejected"
  | "excused"
  | "asked"
  | "extended"
  | "later"
  | "signed"
  | "withdrawn"
  | "paused"
  | "changed"
  | "removed"
  | "zone";
export type TimelineTone = "muted" | "ok" | "red" | "warn";
export type TimelineFile = {
  id: string;
  name: string;
  submissionId: string;
  /** What was decided on the file in this event; none on a version sent. */
  chip: { label: "Approved" | "Rejected" | "Kept"; tone: "ok" | "red" | "grey" } | null;
  note: string;
  /** The server hands out kept files only. */
  open: boolean;
};
export type TimelineEvent = {
  id: string;
  icon: TimelineIcon;
  tone: TimelineTone;
  title: string;
  /** When, in the document's zone. */
  when: string;
  at: string;
  /** The version sent that waits for review now. */
  waiting: boolean;
  note: string | null;
  files: TimelineFile[];
  /** What was entered with a version (sent), or what an approval put on file. */
  entered: Fact[];
  meta: string | null;
};

const hidden = new Set(["document.draft_file_added", "document.draft_file_removed"]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function days(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

/** What was entered with a version: its expiry, then its fields by their labels. */
function entered(detail: DocumentDetail, version: Submission): Fact[] {
  const facts: Fact[] = [];
  if (version.expiry_date) facts.push(["Expires", formatDate(version.expiry_date)]);
  const fields = detail.obligation.settings.extra_fields;
  const keys = [
    ...fields.map((field) => field.key).filter((key) => key in version.metadata),
    ...Object.keys(version.metadata).filter((key) => !fields.some((field) => field.key === key)),
  ];
  for (const key of keys) {
    const value = version.metadata[key];
    if (value === null || value === undefined || String(value) === "") continue;
    facts.push([fields.find((field) => field.key === key)?.label ?? key, String(value)]);
  }
  return facts;
}

type Decided = { id: string; decision: "keep" | "discard"; note: string };

/** The decisions an approval or a send-back carried, by file. */
function decisions(metadata: Record<string, unknown>): Map<string, Decided> {
  const found = new Map<string, Decided>();
  if (!Array.isArray(metadata.files)) return found;
  for (const item of metadata.files as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const { id, decision, note } = item as Record<string, unknown>;
    if (typeof id !== "string" || (decision !== "keep" && decision !== "discard")) continue;
    found.set(id, { id, decision, note: typeof note === "string" ? note : "" });
  }
  return found;
}

/** A version's files by name, each with what this event decided on it and its note. */
function files(
  version: Submission | undefined,
  decide?: (file: Submission["files"][number]) => NonNullable<TimelineFile["chip"]>,
  notes?: Map<string, Decided>,
): TimelineFile[] {
  if (!version) return [];
  return version.files.map((file) => ({
    id: file.id,
    name: file.filename,
    submissionId: version.id,
    chip: decide ? decide(file) : null,
    note: notes?.get(file.id)?.note.trim() ?? "",
    open: file.decision === "keep",
  }));
}

export function documentTimeline(detail: DocumentDetail, now: Date): TimelineEvent[] {
  const { obligation } = detail;
  const zone = obligation.timezone;
  const first = firstName(obligation.employee_name);
  const byId = new Map(detail.submissions.map((submission) => [submission.id, submission]));
  const day = (iso: unknown) => (typeof iso === "string" ? formatDay(iso, zone, now) : null);
  const waitingId =
    obligation.submitted_id && byId.get(obligation.submitted_id)?.state === "pending_review"
      ? obligation.submitted_id
      : null;
  const event = (
    source: Pick<Event, "id" | "occurred_at">,
    part: Partial<TimelineEvent> & Pick<TimelineEvent, "icon" | "title">,
  ): TimelineEvent => ({
    id: source.id,
    tone: "muted",
    when: formatMoment(source.occurred_at, zone, now),
    at: source.occurred_at,
    waiting: false,
    note: null,
    files: [],
    entered: [],
    meta: null,
    ...part,
  });
  const sent = (source: Pick<Event, "id" | "occurred_at">, version: Submission | undefined, state?: unknown) =>
    event(source, {
      icon: "sent",
      title: version ? `Version ${version.version} sent` : "Sent",
      waiting: version !== undefined && version.id === waitingId,
      files: files(version),
      entered: version ? entered(detail, version) : [],
      meta: state === "accepted" ? "On file, no review needed" : null,
    });

  const told = new Set<string>();
  const events: TimelineEvent[] = [];
  for (const item of detail.history) {
    if (hidden.has(item.action)) continue;
    const meta = item.metadata;
    const version = typeof meta.submission_id === "string" ? byId.get(meta.submission_id) : undefined;
    if (version) told.add(version.id);
    const reason = text(meta.reason);
    switch (item.action) {
      case "document.submitted":
        events.push(sent(item, version, meta.state));
        break;
      case "document.approve":
        events.push(
          event(item, {
            icon: "approved",
            tone: "ok",
            title: version ? `Version ${version.version} approved` : "Approved",
            files: files(version, () => ({ label: "Approved", tone: "ok" })),
            entered: version?.expiry_date ? [["Expires", formatDate(version.expiry_date)]] : [],
          }),
        );
        break;
      case "document.reject": {
        const decided = decisions(meta);
        const due = day(meta.new_deadline);
        const given =
          typeof meta.new_deadline === "string"
            ? (Date.parse(meta.new_deadline) - Date.parse(item.occurred_at)) / 1000
            : null;
        events.push(
          event(item, {
            icon: "rejected",
            tone: "red",
            title: version ? `Version ${version.version} sent back` : "Sent back",
            note: reason,
            files: files(
              version,
              (file) =>
                (decided.get(file.id)?.decision ?? file.decision) === "discard"
                  ? { label: "Rejected", tone: "red" }
                  : { label: "Kept", tone: "grey" },
              decided,
            ),
            meta:
              due === null || given === null
                ? "No due date to send it again"
                : meta.correction_period === "remaining"
                  ? `What was left: ${daysLeftLabel(given)} · Due ${due}`
                  : `A new ${days(Math.round(given / 86_400))} to send it again · Due ${due}`,
          }),
        );
        break;
      }
      case "document.exempted":
        events.push(event(item, { icon: "excused", title: `${first} excused`, note: reason }));
        break;
      case "document.exemption_removed": {
        const due = day(meta.new_deadline);
        events.push(
          event(item, { icon: "asked", title: "Asked for it again", note: reason, meta: due ? `Due ${due}` : null }),
        );
        break;
      }
      case "document.deadline_extended": {
        const added = typeof meta.additional_days === "number" ? meta.additional_days : null;
        const due = day(meta.new_deadline);
        events.push(
          event(item, {
            icon: "extended",
            tone: "warn",
            title: added ? `Deadline extended ${days(added)}` : "Deadline extended",
            note: reason,
            meta: due ? `New due date: ${due}` : null,
          }),
        );
        break;
      }
      case "document.assignment_created":
        events.push(event(item, { icon: "asked", title: `Asked of ${first}` }));
        break;
      case "document.assignment_reopened": {
        const due = day(meta.deadline);
        events.push(event(item, { icon: "asked", title: "Asked again", meta: due ? `Due ${due}` : null }));
        break;
      }
      case "document.assignment_removed":
        events.push(event(item, { icon: "removed", title: "No longer asked" }));
        break;
      case "document.initial_deferred":
        events.push(event(item, { icon: "later", title: `${first} will send it later`, note: reason }));
        break;
      case "document.policy_acknowledged":
        events.push(event(item, { icon: "signed", tone: "ok", title: `${first} signed the policy` }));
        break;
      case "document.policy_withdrawn":
        events.push(event(item, { icon: "withdrawn", title: "Signature withdrawn" }));
        break;
      case "document.publication_paused":
        events.push(event(item, { icon: "paused", title: "Changes paused", note: reason }));
        break;
      case "document.definition_applied":
        events.push(event(item, { icon: "changed", title: "Document updated", note: reason }));
        break;
      case "document.reference_timezone_changed":
        events.push(
          event(item, {
            icon: "zone",
            title: "Document time zone changed",
            meta: typeof meta.timezone === "string" ? zoneName(meta.timezone, new Date(item.occurred_at)) : null,
          }),
        );
        break;
      default:
        events.push(event(item, { icon: "changed", title: "Updated" }));
    }
  }
  // A version sent that no event tells (older records) keeps its place by the day it was sent.
  for (const version of detail.submissions)
    if (version.state !== "draft" && version.submitted_at && !told.has(version.id))
      events.push(sent({ id: `version-${version.id}`, occurred_at: version.submitted_at }, version));
  return events
    .map((item, index) => ({ item, index }))
    .sort((a, b) => Date.parse(b.item.at) - Date.parse(a.item.at) || a.index - b.index)
    .map(({ item }) => item);
}
