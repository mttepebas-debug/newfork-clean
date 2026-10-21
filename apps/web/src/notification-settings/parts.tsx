import { Lock } from "lucide-react";
import type { ReactNode } from "react";

// The pieces both notification settings pages share (variant A, BILDIRIM-11).

/** A state that is not a control: "Always on", "Coming soon", "Not available". */
export function StatusPill({
  children,
  tone = "muted",
  locked = false,
}: {
  readonly children: ReactNode;
  readonly tone?: "accent" | "muted" | "warning";
  readonly locked?: boolean;
}) {
  return (
    <span className={`ns-pill is-${tone}`}>
      {locked ? <Lock size={12} aria-hidden /> : null}
      {children}
    </span>
  );
}

/** One channel: its icon, name, a line about its state and its control or pill. */
export function ChannelRow({
  icon,
  title,
  children,
  control,
  off = false,
}: {
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly control: ReactNode;
  readonly off?: boolean;
}) {
  return (
    <div className={`ns-row${off ? " is-off" : ""}${icon ? "" : " no-icon"}`}>
      {icon ? (
        <span className="ns-tile" aria-hidden>
          {icon}
        </span>
      ) : null}
      <div className="ns-row-text">
        <strong>{title}</strong>
        <span>{children}</span>
      </div>
      <div className="ns-row-control">{control}</div>
    </div>
  );
}

/** An on/off switch: a real checkbox, so Space and the label work as usual. */
export function Switch({
  id,
  checked,
  label,
  onChange,
  disabled = false,
  describedBy,
}: {
  readonly id?: string;
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly describedBy?: string;
}) {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className="ns-switch"
      aria-label={label}
      aria-describedby={describedBy}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}
