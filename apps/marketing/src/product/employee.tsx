// Employee Hub home on the phone (apps/web/src/employee-hub), drawn with the
// app's own copy.

import { type HTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

type Div = HTMLAttributes<HTMLDivElement>;

export function HubContext({ workspace, initial, unread }: { readonly workspace: string; readonly initial: string; readonly unread?: number }) {
  return (
    <div className="eh-context">
      <span className="eh-context__tile">{initial}</span>
      {workspace}
      <Icon name="ChevronDown" width="0.8em" height="0.8em" />
      <span className="eh-context__right">
        <Icon name="Bell" />
        {unread ? <span className="eh-badge">{unread}</span> : null}
      </span>
    </div>
  );
}

export function HubGreeting({ name, meta }: { readonly name: string; readonly meta: string }) {
  return (
    <div className="eh-greeting">
      <span className="eh-greeting__eyebrow">A little clarity for your day</span>
      <span className="eh-greeting__title">Good morning, {name}.</span>
      <span className="eh-greeting__meta">{meta}</span>
    </div>
  );
}

type NextShiftProps = Div & {
  readonly label?: "TODAY’S SHIFT" | "YOUR NEXT SHIFT";
  readonly day: string;
  readonly start: string;
  readonly end: string;
  readonly location: string;
  readonly job: string;
  readonly note?: string;
};

export function NextShiftCard({ label = "YOUR NEXT SHIFT", day, start, end, location, job, note, className, ...rest }: NextShiftProps) {
  return (
    <div className={["eh-hero", className].filter(Boolean).join(" ")} {...rest}>
      <span className="eh-hero__eyebrow">
        <i />
        {label}
      </span>
      <span className="eh-hero__date">{day}</span>
      <span className="eh-hero__time">
        {start} <span>—</span> {end}
      </span>
      <span className="eh-hero__meta">
        <Icon name="MapPin" />
        {location} · {job}
      </span>
      {note ? <span className="eh-hero__note">{note}</span> : null}
      <span className="eh-hero__btn">View shift ↗</span>
    </div>
  );
}

export function RadarCard({ count, children, ...rest }: Div & { readonly count: number; readonly children?: ReactNode }) {
  return (
    <div className="eh-card" {...rest}>
      <div className="eh-radar">
        <span className="eh-radar__count">{String(count).padStart(2, "0")}</span>
        <span className="eh-card__head" style={{ display: "grid", gap: "calc(2 * var(--u))" }}>
          On your radar
          <small style={{ fontSize: "calc(11 * var(--u))", fontWeight: 500, color: "#53675b" }}>A quick response keeps things moving.</small>
        </span>
      </div>
      {children}
    </div>
  );
}

export function RadarRow({ title, sub, ...rest }: Div & { readonly title: string; readonly sub: string }) {
  return (
    <div className="eh-list-row" {...rest}>
      <span>
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
      <Icon name="ChevronRight" />
    </div>
  );
}

const SHORTCUTS: readonly { label: string; icon: IconName }[] = [
  { label: "My schedule", icon: "CalendarDays" },
  { label: "Request time off", icon: "CalendarX" },
  { label: "My availability", icon: "CalendarCheck" },
  { label: "Open shifts", icon: "ClipboardList" },
];

export function Shortcuts(props: Div) {
  return (
    <div className="eh-shortcuts" {...props}>
      {SHORTCUTS.map((shortcut) => (
        <span key={shortcut.label} className="eh-shortcut">
          <Icon name={shortcut.icon} />
          {shortcut.label}
        </span>
      ))}
    </div>
  );
}
