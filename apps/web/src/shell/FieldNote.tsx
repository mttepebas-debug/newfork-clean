import type { ReactNode } from "react";
import "./field-note.css";

/**
 * The line under a field (TEL-2; Mert, 2026-10-09; UI-FIELDMSG, Mert
 * 2026-10-17): its help, or in its place the error, in one cell that is always
 * there: at least one line tall, and as tall as the help or the kept reserve.
 * An error coming or going moves neither the field nor anything below it, and
 * never squeezes it: without a reserve the error stays on one line, cut with an
 * ellipsis, its whole text in `title` and read whole through the field's
 * `aria-describedby`, which points at `fieldNoteId(id, error, help)`.
 */
export function FieldNote({
  id,
  help,
  error,
  reserve,
  className,
}: {
  readonly id: string;
  /** The screen's own class for the lines under its fields. */
  readonly className?: string;
  readonly help?: ReactNode;
  /** Said in red; the field shows itself invalid while it is here. */
  readonly error?: ReactNode;
  /** The longest error the field can show, whose room is always kept. */
  readonly reserve?: ReactNode;
}) {
  const hasError = said(error);
  const hasHelp = said(help);
  const hasReserve = said(reserve);
  return (
    <span className="field-note">
      <small className={cx(className, "field-note-room")} aria-hidden="true">
        {" "}
      </small>
      {hasReserve ? (
        <small className={cx(className, "field-note-hidden")} aria-hidden="true">
          {reserve}
        </small>
      ) : null}
      {hasHelp && hasError ? (
        <small className={cx(className, "field-note-hidden")} aria-hidden="true">
          {help}
        </small>
      ) : null}
      {hasError ? (
        <small
          id={`${id}-error`}
          className={cx(className, "field-note-error", hasReserve ? undefined : "is-one-line")}
          role="alert"
          title={typeof error === "string" ? error : undefined}
        >
          {error}
        </small>
      ) : hasHelp ? (
        <small id={`${id}-help`} className={className}>
          {help}
        </small>
      ) : null}
    </span>
  );
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
