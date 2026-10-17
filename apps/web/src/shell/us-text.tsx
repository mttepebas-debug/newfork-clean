import type { ReactNode } from "react";
import { hasTurkishOnlyLetters, usLettersMessage } from "@newfork/shared";
import { FieldNote, fieldNoteId, said } from "./FieldNote";

/*
 * The US letter rule on a typed field (BL-503; KARARLAR "Form ve girdi
 * kuralları (ABD)"): said under the field as it is typed, in the field's one
 * note line (FieldNote, UI-FIELDMSG), in each screen's own error style. The
 * server refuses the same thing. The field's own error, when it has one, comes
 * first in that line.
 */

/** Whether a typed value breaks the rule. */
export function breaksLetterRule(...values: readonly string[]): boolean {
  return values.some((value) => hasTurkishOnlyLetters(value));
}

/** What the note line says: the field's own error, else the letter rule. */
export function letterRuleError(value: string, error?: ReactNode): ReactNode {
  return said(error) ? error : hasTurkishOnlyLetters(value) ? usLettersMessage : null;
}

/** The field's side: invalid and described by its note line while it says something. */
export function letterRuleProps(value: string, id: string, error?: ReactNode, help?: ReactNode) {
  const shown = letterRuleError(value, error);
  const describedBy = fieldNoteId(id, shown, help);
  return {
    ...(said(shown) ? { "aria-invalid": true as const } : {}),
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
  };
}

/** The note line under the field: its help, or the error in its place. */
export function LetterRuleNote({
  value,
  id,
  error,
  help,
  className,
}: {
  readonly value: string;
  readonly id: string;
  readonly error?: ReactNode;
  readonly help?: ReactNode;
  readonly className?: string;
}) {
  return <FieldNote id={id} className={className} help={help} error={letterRuleError(value, error)} />;
}
