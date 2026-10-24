import {
  documentFormatSchema,
  type DocumentFormat,
  type DocumentObligation,
  type DocumentObligationStatus,
  type DocumentDetail,
} from "@newfork/shared";

type DocumentSubmission = DocumentDetail["submissions"][number];

/** Closed obligation: statuses in which the employee can no longer act on it; the manager's review decision is gated by the same three. */
export function isObligationClosed(status: DocumentObligationStatus): boolean {
  return ["removed", "exempt", "paused"].includes(status);
}

type Excusable = Pick<DocumentObligation, "status" | "exemption_locked">;

/** The owner's standing excuse: never asked, yet free to keep a copy on file (BL-118). */
function isOwnerExcused(obligation: Excusable): boolean {
  return obligation.status === "exempt" && obligation.exemption_locked === true;
}

/** Whether the person may upload: any open obligation, and the owner's excused one. */
export function acceptsUpload(obligation: Excusable): boolean {
  return !isObligationClosed(obligation.status) || isOwnerExcused(obligation);
}

/** The owner's excused document once a copy was accepted: it reads "On file". */
export function isOnFile(
  obligation: Excusable & Pick<DocumentObligation, "approved_id">,
): boolean {
  return isOwnerExcused(obligation) && obligation.approved_id !== null;
}

const statusLabels: Record<DocumentObligationStatus, string> = {
  pending_review: "Needs review",
  missing: "Missing",
  expired: "Expired",
  completed: "Completed",
  grace: "Grace period",
  rejected: "Rejected",
  removed: "Removed",
  exempt: "Exempt",
  timezone_required: "Time zone needed",
  paused: "Paused",
};

// BL-831: what needs someone first. A grace period is a missing document
// still inside its time; the closed ones go last.
const statusWeights: Record<DocumentObligationStatus, number> = {
  pending_review: 0,
  missing: 1,
  grace: 1,
  timezone_required: 2,
  expired: 3,
  rejected: 4,
  paused: 5,
  completed: 6,
  exempt: 7,
  removed: 8,
};

/** Status order for the list's Status column: most urgent first. */
export function statusWeight(status: DocumentObligationStatus): number {
  return statusWeights[status];
}

/** Who reads a status: the person it is asked of, or a manager reviewing it. */
export type StatusReader = "employee" | "manager";

// K1 decision 4 (Mert 23 Oct, A2 Tur 5): a manager reads a document sent back as Missing (it waits on the person
// again) and an exempt one as Excused. The person keeps today's words.
const managerLabels: Partial<Record<DocumentObligationStatus, string>> = {
  rejected: "Missing",
  exempt: "Excused",
};

/** The status as its reader reads it, in the list and the drawer alike. */
export function statusLabel(
  obligation: Excusable & Pick<DocumentObligation, "approved_id">,
  reader: StatusReader = "employee",
): string {
  if (isOnFile(obligation)) return "On file";
  return (reader === "manager" ? managerLabels[obligation.status] : undefined) ?? statusLabels[obligation.status];
}

export type StatusTone = "ok" | "warn" | "red" | "grey";

/** A status chip's colour (KARARLAR Genel → "Durum çipi"): done green, owed red, closed grey, the rest amber. */
export function statusTone(obligation: Excusable & Pick<DocumentObligation, "approved_id">): StatusTone {
  if (isOnFile(obligation) || obligation.status === "completed") return "ok";
  if (["missing", "expired", "rejected"].includes(obligation.status)) return "red";
  if (["removed", "exempt", "paused"].includes(obligation.status)) return "grey";
  return "warn";
}

/** A person's initials for their tile: the first letter of the first two words of the name. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

/** Typed-name match for a policy acknowledgement: trimmed, inner whitespace collapsed, case folded. */
export function sameSignerName(typed: string, expected: string): boolean {
  const fold = (name: string) =>
    name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return fold(typed) === fold(expected);
}

/** File-input accept list for the upload field: jpeg covers both spellings, every other format is its own extension. */
export function acceptAttribute(
  formats: DocumentObligation["accepted_formats"],
): string {
  return formats
    .map((f) => (f === "jpeg" ? ".jpg,.jpeg" : `.${f}`))
    .join(",");
}

const versionStateLabels: Record<DocumentSubmission["state"], string> = {
  draft: "Draft",
  pending_review: "Needs review",
  accepted: "Approved",
  rejected: "Rejected",
  superseded: "Replaced",
};

/** A version's state as the drawer heading reads it, in the list's words (BL-830). */
export function versionStateLabel(state: DocumentSubmission["state"]): string {
  return versionStateLabels[state];
}

/** A reviewer's decision on one file, once made (BL-830). */
export function fileDecisionLabel(
  decision: DocumentSubmission["files"][number]["decision"],
): string {
  return decision === "keep" ? "Kept" : "Discarded";
}

const formatNames: Record<DocumentFormat, string> = {
  pdf: "PDF",
  jpeg: "JPEG",
  png: "PNG",
  webp: "WebP",
};

/** Accepted formats in one order and spelling, list and editor alike (BL-857). */
export function formatsLabel(formats: readonly DocumentFormat[]): string {
  return documentFormatSchema.options
    .filter((format) => formats.includes(format))
    .map((format) => formatNames[format])
    .join(", ");
}
