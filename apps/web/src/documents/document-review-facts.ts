import type { DocumentDetail, DocumentObligation } from "@newfork/shared";
import { zoneName } from "../lib/today";

// What the manager's review drawer says about a document in its head and its Details facts (A2 Tur 6,
// mockup-spec 2.4 and 4.3), from the real lifecycle data only: no sample clock, no "11:59 PM", no pronouns.

type Submission = DocumentDetail["submissions"][number];
export type Fact = readonly [label: string, value: string];

/** The first word of a name ("Maria" for "Maria Lopez"); the name has no separate first name. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function zoneOf(zone: string | null): string {
  return zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function yearIn(at: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: zone }).format(at);
}

function format(iso: string, zone: string | null, now: Date, time: boolean): string {
  const at = new Date(iso);
  const tz = zoneOf(zone);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(yearIn(at, tz) === yearIn(now, tz) ? {} : { year: "numeric" }),
    ...(time ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: tz,
  }).format(at);
}

/** "Wed, Oct 21, 4:12 PM" in the document's zone; the year only when it is not this year. */
export function formatMoment(iso: string, zone: string | null, now: Date): string {
  return format(iso, zone, now, true);
}

/** "Fri, Oct 30" in the document's zone; the year only when it is not this year. */
export function formatDay(iso: string, zone: string | null, now: Date): string {
  return format(iso, zone, now, false);
}

/** A calendar date as written ("Sep 30, 2029"), never moved by a zone. */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Whole days left before a deadline ("7 days left"), then "less than a day left", then "overdue". */
export function timeLeft(deadline: string, now: Date): string {
  const left = Date.parse(deadline) - now.getTime();
  if (left <= 0) return "overdue";
  const days = Math.floor(left / 86_400_000);
  if (days === 0) return "less than a day left";
  return days === 1 ? "1 day left" : `${days} days left`;
}

/**
 * A renewal sent back while the approved copy is still valid (gaps A2): the document stays Completed (or waits for a
 * time zone) on the copy on file, and the renewal is a version of its own. Null in every other case.
 */
export function keptRenewal(detail: DocumentDetail): Submission | null {
  const { submitted_id, approved_id, status } = detail.obligation;
  if (!approved_id || approved_id === submitted_id) return null;
  if (status !== "completed" && status !== "timezone_required") return null;
  if (!detail.submissions.some((s) => s.id === approved_id)) return null;
  const renewal = detail.submissions.find((s) => s.id === submitted_id);
  return renewal?.state === "rejected" ? renewal : null;
}

/**
 * The version a manager is shown: the one sent (for review, or sent back), else the approved one; the copy on file
 * when a renewal of it was sent back.
 */
export function shownVersion(detail: DocumentDetail): Submission | null {
  const { submitted_id, approved_id } = detail.obligation;
  const sent = keptRenewal(detail) ? undefined : detail.submissions.find((s) => s.id === submitted_id);
  return sent ?? detail.submissions.find((s) => s.id === approved_id) ?? null;
}

type Head = Pick<
  DocumentObligation,
  "status" | "deadline_at" | "timezone" | "expiry_date" | "approved_id"
>;

// A due date is shown while the person still owes the document; an expired one only when a new date lies ahead
// (approving keeps the old deadline, which has long passed by the time a copy expires).
function showsDue(obligation: Head, now: Date): obligation is Head & { deadline_at: string } {
  if (!obligation.deadline_at) return false;
  if (["pending_review", "missing", "grace", "rejected"].includes(obligation.status)) return true;
  return obligation.status === "expired" && Date.parse(obligation.deadline_at) > now.getTime();
}

/**
 * The head's line under the document title. Null when it needs the loaded document (when it was sent, approved
 * or excused) and that has not arrived yet.
 */
export function headSub(
  obligation: Head,
  detail: DocumentDetail | undefined,
  { phone, now }: { phone: boolean; now: Date },
): string | null {
  const zone = obligation.timezone;
  if (showsDue(obligation, now) && obligation.status !== "pending_review")
    return `Due: ${formatMoment(obligation.deadline_at, zone, now)}${phone ? "" : ` ${zoneName(zoneOf(zone))}`}`;
  switch (obligation.status) {
    case "missing":
    case "grace":
    case "rejected":
      return "No due date";
    case "expired":
      return obligation.expiry_date ? `Expired: ${formatDate(obligation.expiry_date)}` : "Expired";
    case "paused":
      return "Changes are paused";
    case "removed":
      return "No longer asked";
  }
  if (!detail) return null;
  if (obligation.status === "pending_review") {
    const sent = shownVersion(detail)?.submitted_at;
    return sent ? `Sent: ${formatMoment(sent, zone, now)}` : "Sent";
  }
  if (obligation.status === "exempt") {
    const excused = detail.history.find((event) => event.action === "document.exempted");
    return excused ? `Excused: ${formatDay(excused.occurred_at, zone, now)}` : "Excused";
  }
  const approved = detail.submissions.find((s) => s.id === obligation.approved_id)?.reviewed_at;
  return approved ? `Approved: ${formatDay(approved, zone, now)}` : "Approved";
}

/**
 * Details' facts: who, what, where, the version sent (what it says), and when it is due. A decision made in this
 * sitting takes the due date's place ("Sent back: Fri, Oct 23 · You"), so the files under the facts stay put.
 */
export function documentFacts(
  detail: DocumentDetail,
  now: Date,
  decided?: { label: string; at: string },
): Fact[] {
  const { obligation } = detail;
  const facts: Fact[] = [
    ["Name", obligation.employee_name],
    ["Document", obligation.title],
  ];
  if (obligation.location_names.length) facts.push(["Locations", obligation.location_names.join(", ")]);
  const version = obligation.status === "expired" ? null : shownVersion(detail);
  if (version) {
    if (version.submitted_at) facts.push(["Sent", formatMoment(version.submitted_at, obligation.timezone, now)]);
    if (version.expiry_date) facts.push(["Expires", formatDate(version.expiry_date)]);
    const fields = obligation.settings.extra_fields;
    const keys = [
      ...fields.map((field) => field.key).filter((key) => key in version.metadata),
      ...Object.keys(version.metadata).filter((key) => !fields.some((field) => field.key === key)),
    ];
    for (const key of keys) {
      const value = version.metadata[key];
      if (value === null || value === undefined || String(value) === "") continue;
      facts.push([fields.find((field) => field.key === key)?.label ?? key, String(value)]);
    }
  }
  if (decided) {
    facts.push([decided.label, `${formatDay(decided.at, obligation.timezone, now)} · You`]);
    return facts;
  }
  if (showsDue(obligation, now))
    facts.push([
      "Due",
      `${formatDay(obligation.deadline_at, obligation.timezone, now)} · ${timeLeft(obligation.deadline_at, now)}`,
    ]);
  if (
    (obligation.status === "missing" || obligation.status === "grace") &&
    obligation.settings.suspend_on_overdue &&
    !obligation.suspended
  )
    facts.push([
      "If it's late",
      `${firstName(obligation.employee_name)} can open only their documents until it's in`,
    ]);
  return facts;
}

const mediaNames: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

/** A file's type and size as its row reads them: "JPG · 471 KB". */
export function fileMeta(file: { media_type: string; size_bytes: number; filename: string }): string {
  const extension = /\.([a-z0-9]{1,5})$/i.exec(file.filename)?.[1];
  const type = mediaNames[file.media_type] ?? (extension ? extension.toUpperCase() : "File");
  const bytes = file.size_bytes;
  const size =
    bytes < 1024
      ? `${bytes} B`
      : bytes < 1024 * 1024
        ? `${Math.round(bytes / 1024)} KB`
        : `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  return `${type} · ${size}`;
}
