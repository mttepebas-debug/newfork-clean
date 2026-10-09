import type { ReactNode } from "react";
import "./field-note.css";

/**
 * The line under a field (TEL-2; Mert, 2026-10-09): its help, or in its place
 * the error, in one cell as tall as the longest thing it can say. An error
 * coming or going moves neither the field nor anything below it. The field
 * points `aria-describedby` at `fieldNoteId(id, error)`.
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
  if (!help && !reserve) return null;
  return (
    <span className="field-note">
      {reserve ? (
        <small className={cx(className, "field-note-reserve")} aria-hidden="true">
          {reserve}
        </small>
      ) : null}
      {error ? (
        <small id={`${id}-error`} className={cx(className, "field-note-error")} role="alert">
          {error}
        </small>
      ) : help ? (
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
  return error ? `${id}-error` : help ? `${id}-help` : undefined;
}

function cx(...names: ReadonlyArray<string | undefined>): string {
  return names.filter(Boolean).join(" ");
}
