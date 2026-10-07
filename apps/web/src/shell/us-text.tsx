import { hasTurkishOnlyLetters, usLettersMessage } from "@newfork/shared";
import "./us-text.css";

/*
 * The US letter rule on a typed field (BL-503; KARARLAR "Form ve girdi
 * kuralları (ABD)"): said under the field as it is typed, in each screen's own
 * error style. The server refuses the same thing.
 */

/** Whether a typed value breaks the rule. */
export function breaksLetterRule(...values: readonly string[]): boolean {
  return values.some((value) => hasTurkishOnlyLetters(value));
}

/** The field's side: invalid and described by the line under it. */
export function letterRuleProps(value: string, errorId: string) {
  return hasTurkishOnlyLetters(value)
    ? ({ "aria-invalid": true, "aria-describedby": errorId } as const)
    : {};
}

/** The line under the field, only while the rule is broken. */
export function LetterRuleError({
  value,
  id,
  className = "form-error",
}: {
  readonly value: string;
  readonly id: string;
  readonly className?: string;
}) {
  return hasTurkishOnlyLetters(value) ? (
    <small id={id} className={className} role="alert">
      {usLettersMessage}
    </small>
  ) : null;
}
