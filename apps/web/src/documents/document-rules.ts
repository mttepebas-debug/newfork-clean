import {
  type DocumentObligation,
  type DocumentObligationStatus,
} from "@newfork/shared";

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
