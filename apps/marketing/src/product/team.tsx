// Employees list, status pills and the setup / onboarding wizard frame,
// drawn from apps/web/src/employees and shell/prebiz.

import { type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { Icon } from "./icons";

type Div = HTMLAttributes<HTMLDivElement>;

export type EmployeeStatus = "Not Invited" | "Invited" | "Onboarding" | "Needs Attention" | "Active" | "Archived";

const STATUS_CLASS: Record<EmployeeStatus, string> = {
  "Not Invited": "",
  Invited: "status-pill--invited",
  Onboarding: "status-pill--onboarding",
  "Needs Attention": "status-pill--attention",
  Active: "status-pill--active",
  Archived: "",
};

export function StatusPill({ status, ...rest }: HTMLAttributes<HTMLSpanElement> & { readonly status: EmployeeStatus }) {
  return (
    <span className={["status-pill", STATUS_CLASS[status]].filter(Boolean).join(" ")} {...rest}>
      {status}
    </span>
  );
}

export function Avatar({ initials, bg, ink, size, ...rest }: HTMLAttributes<HTMLSpanElement> & {
  readonly initials: string;
  readonly bg?: string;
  readonly ink?: string;
  readonly size?: number;
}) {
  return (
    <span
      className="app-avatar"
      style={
        {
          "--avatar": bg,
          "--avatar-ink": ink,
          ...(size ? { width: `calc(${size} * var(--u))`, height: `calc(${size} * var(--u))` } : null),
        } as CSSProperties
      }
      {...rest}
    >
      {initials}
    </span>
  );
}

export function EmployeeTableHead() {
  return (
    <div className="emp-table__head">
      <span>Employee</span>
      <span>Status</span>
      <span>Primary location</span>
      <span>Primary job</span>
    </div>
  );
}

type EmployeeRowProps = Div & {
  readonly name: string;
  readonly code: string;
  readonly initials: string;
  readonly avatar?: string;
  readonly avatarInk?: string;
  readonly status: EmployeeStatus;
  readonly location: string;
  readonly moreLocations?: number;
  readonly job: string;
};

export function EmployeeRow({ name, code, initials, avatar, avatarInk, status, location, moreLocations, job, className, ...rest }: EmployeeRowProps) {
  return (
    <div className={["emp-row", className].filter(Boolean).join(" ")} {...rest}>
      <span className="emp-row__who">
        <Avatar initials={initials} bg={avatar} ink={avatarInk} />
        <span style={{ minWidth: 0 }}>
          <strong>{name}</strong>
          <small>{code}</small>
        </span>
      </span>
      <StatusPill status={status} />
      <span className="emp-row__meta">
        <Icon name="MapPin" />
        {location}
        {moreLocations ? <span className="emp-row__more">+{moreLocations}</span> : null}
      </span>
      <span className="emp-row__meta">
        <Icon name="Briefcase" />
        {job}
      </span>
    </div>
  );
}

type WizardStep = { readonly label: string; readonly state: "done" | "current" | "todo"; readonly optional?: boolean };

type WizardFrameProps = Div & {
  readonly workspace: string;
  readonly subtitle: "Workspace setup" | "Employee onboarding";
  readonly steps: readonly WizardStep[];
  readonly children: ReactNode;
};

export function WizardFrame({ workspace, subtitle, steps, children, className, ...rest }: WizardFrameProps) {
  const done = steps.filter((step) => step.state === "done").length;
  return (
    <div className={["pb-frame", className].filter(Boolean).join(" ")} {...rest}>
      <div className="pb-panel">
        <span className="pb-wordmark">NEWFORK</span>
        <div>
          <div className="pb-panel__name">{workspace}</div>
          <div className="pb-panel__sub">{subtitle}</div>
        </div>
        <div className="pb-progress">
          <span className="pb-progress__bar">
            <i style={{ "--progress": `${Math.round((done / steps.length) * 100)}%` } as CSSProperties} />
          </span>
          <span>
            {done} of {steps.length} steps done
          </span>
        </div>
        <div className="pb-steps">
          {steps.map((step, index) => (
            <span
              key={step.label}
              className={["pb-step", step.state === "done" && "pb-step--done", step.state === "current" && "pb-step--current"].filter(Boolean).join(" ")}
            >
              <span className="pb-step__num">{step.state === "done" ? <Icon name="Check" /> : index + 1}</span>
              {step.label}
              {step.optional ? <span className="app-muted" style={{ fontWeight: 500 }}>(optional)</span> : null}
            </span>
          ))}
        </div>
      </div>
      <div className="pb-stage">{children}</div>
    </div>
  );
}
