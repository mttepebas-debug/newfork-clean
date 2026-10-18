import type { ReactNode } from "react";
import "./field-note.css";

/**
 * The line under a field (TEL-2; UI-FIELDMSG-2, Mert 2026-10-18): its help, or
 * in the help's place its error. A short message from this one field only; a
 * window's general error or a long server sentence goes in the window's band
 * (`WindowAlert`). Nothing is kept in advance: with neither help nor error it
 * renders nothing, so it adds no height. When it appears, what is below may
 * move down; fields side by side share their row, so the row grows as one.
 * It is always said whole, wrapping, never cut. The field's
 * `aria-describedby` points at `fieldNoteId(id, error, help)`.
 */
export function FieldNote({
  id,
  help,
  error,
  className,
}: {
  readonly id: string;
  /** The screen's own class for the lines under its fields. */
  readonly className?: string;
  readonly help?: ReactNode;
  /** Said in red; the field shows itself invalid while it is here. */
  readonly error?: ReactNode;
}) {
  if (said(error))
    return (
      <span className="field-note">
        <small id={`${id}-error`} className={cx(className, "field-note-error")} role="alert">
          {error}
        </small>
      </span>
    );
  if (said(help))
    return (
      <span className="field-note">
        <small id={`${id}-help`} className={className}>
          {help}
        </small>
      </span>
    );
  return null;
}

/** What the field's `aria-describedby` names: the error while there is one. */
export function fieldNoteId(
  id: string,
  error: ReactNode | undefined,
  help?: ReactNode,
): string | undefined {
  return said(error) ? `${id}-error` : said(help) ? `${id}-help` : undefined;
}

/** Whether a note has anything to say (an empty string or false says nothing). */
export function said(node: ReactNode | undefined): boolean {
  return node !== null && node !== undefined && node !== false && node !== "";
}

function cx(...names: ReadonlyArray<string | undefined>): string {
  return names.filter(Boolean).join(" ");
}
