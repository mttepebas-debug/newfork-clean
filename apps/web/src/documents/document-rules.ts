import {
  type DocumentObligation,
  type DocumentObligationStatus,
} from "@newfork/shared";

/** Closed obligation: statuses in which the employee can no longer act on it; the manager's review decision is gated by the same three. */
export function isObligationClosed(status: DocumentObligationStatus): boolean {
  return ["removed", "exempt", "paused"].includes(status);
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
