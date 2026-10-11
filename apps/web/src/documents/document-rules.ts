import {
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

/** The status as a person reads it, in the list and the drawer alike. */
export function statusLabel(
  obligation: Excusable & Pick<DocumentObligation, "approved_id">,
): string {
  return isOnFile(obligation) ? "On file" : statusLabels[obligation.status];
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
