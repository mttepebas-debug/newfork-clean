import { formatUsPhone } from "@newfork/shared";
import type { InputHTMLAttributes } from "react";
import "./us-phone-input.css";

/**
 * The one US phone field (BL-503; KARARLAR "Form ve girdi kuralları (ABD)"):
 * a fixed grey "+1" that cannot be deleted, digits only, masked as
 * "(415) 555-0100" while typing. It shows whatever was saved masked and hands
 * the masked text back; the form turns it into E.164 with `toUsPhone` when it
 * saves. Each screen keeps its own label, class and error line around it.
 */
export function UsPhoneInput({
  value,
  onChange,
  className,
  placeholder = "(415) 555-0100",
  ...attributes
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  readonly value: string;
  readonly onChange: (masked: string) => void;
}) {
  return (
    <span className="us-phone-field">
      <span className="us-phone-prefix" aria-hidden="true">
        +1
      </span>
      <input
        {...attributes}
        className={["us-phone-input", className].filter(Boolean).join(" ")}
        type="tel"
        inputMode="numeric"
        autoComplete={attributes.autoComplete ?? "tel-national"}
        maxLength={14}
        placeholder={placeholder}
        value={formatUsPhone(value)}
        onChange={(event) => onChange(formatUsPhone(event.target.value))}
      />
    </span>
  );
}
