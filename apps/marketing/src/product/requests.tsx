// Shift Hub (employee) and Requests (manager), drawn from
// apps/web/src/employee-hub/shift-exchanges and views/ScheduleRequestsPage.

import { type HTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

type Div = HTMLAttributes<HTMLDivElement>;

type HubCardProps = Div & {
  readonly kind: "Open shift" | "Cover" | "Swap" | "Approved";
  readonly status?: "Eligible" | "Availability conflict" | "During your time off" | "Awaiting manager" | "Awaiting teammate" | "Your response needed";
  readonly date: string;
  readonly time: string;
  readonly hours?: string;
  readonly place: string;
  readonly who?: string;
  readonly help?: string;
  readonly action?: string;
  readonly footer?: ReactNode;
};

export function HubCard({ kind, status, date, time, hours, place, who, help, action, footer, className, ...rest }: HubCardProps) {
  const warn = status === "Availability conflict" || status === "During your time off";
  const waiting = status?.startsWith("Awaiting") || status === "Your response needed";
  return (
    <div className={["hub-card", className].filter(Boolean).join(" ")} {...rest}>
      <div className="hub-card__top">
        <span className={kind === "Approved" ? "hub-pill hub-pill--green" : "hub-pill"}>{kind}</span>
        {status ? (
          <span className={warn || waiting ? "hub-status hub-status--warn" : "hub-status"}>
            <Icon name={warn ? "TriangleAlert" : waiting ? "Clock" : "CircleCheck"} />
            {status}
          </span>
        ) : null}
      </div>
      <div>
        <div className="hub-date">{date}</div>
        <div className="hub-time">{time}</div>
      </div>
      {hours ? (
        <div className="hub-line">
          <Icon name="Clock" />
          {hours}
        </div>
      ) : null}
      <div className="hub-line">
        <Icon name="MapPin" />
        {place}
      </div>
      {who ? <div className="hub-line" style={{ color: "#243a32", fontWeight: 650 }}>{who}</div> : null}
      {help ? <div className="hub-help">{help}</div> : null}
      {action ? <div className="hub-btn">{action}</div> : null}
      {footer}
    </div>
  );
}

export function ResponsibilityBanner({ ok, children, ...rest }: Div & { readonly ok?: boolean }) {
  return (
    <div className={ok ? "hub-banner hub-banner--ok" : "hub-banner"} {...rest}>
      <Icon name={ok ? "CircleCheck" : "ShieldCheck"} />
      <span>{children}</span>
    </div>
  );
}

type RequestRowProps = Div & {
  readonly icon?: IconName;
  readonly name: string;
  readonly kind: string;
  readonly when: string;
  readonly decideBy: string;
  readonly status: string;
  /** Published shifts that would become open. */
  readonly impact?: number;
};

export function RequestRow({ icon = "CalendarX", name, kind, when, decideBy, status, impact, className, ...rest }: RequestRowProps) {
  return (
    <div className={["req-row", className].filter(Boolean).join(" ")} {...rest}>
      <span className="req-who">
        <span className="req-who__mark">
          <Icon name={icon} />
        </span>
        <span style={{ minWidth: 0 }}>
          <strong>{name}</strong>
          <small>{kind}</small>
        </span>
      </span>
      <span>{when}</span>
      <span>{decideBy}</span>
      <span className="req-status">{status}</span>
      <span style={{ justifySelf: "end" }}>
        {impact ? (
          <span className="req-impact" title={`${impact} published shifts become open shifts`}>
            <Icon name="TriangleAlert" />
            {impact}
          </span>
        ) : (
          <Icon name="ChevronRight" />
        )}
      </span>
    </div>
  );
}

export function RequestListHead() {
  return (
    <div className="req-list__head">
      <span>Employee</span>
      <span>Dates</span>
      <span>Decide by</span>
      <span>Status</span>
      <span style={{ justifySelf: "end" }}>Review</span>
    </div>
  );
}

type ApprovalLine = { readonly location: string; readonly by?: string };

export function ApprovalsPanel({ lines, decideBy, ...rest }: Div & { readonly lines: readonly ApprovalLine[]; readonly decideBy: string }) {
  const done = lines.filter((line) => line.by).length;
  return (
    <div className="req-approvals" {...rest}>
      <div className="req-approvals__title">
        <span>Approvals</span>
        <span className="app-muted">
          {done} of {lines.length} locations approved
        </span>
      </div>
      <div className="req-approvals__line">
        <Icon name="Clock" />
        Decide by {decideBy}
      </div>
      {lines.map((line) => (
        <div key={line.location} className={line.by ? "req-approvals__line req-approvals__line--done" : "req-approvals__line"}>
          <Icon name={line.by ? "Check" : "Clock"} />
          <strong style={{ color: "var(--app-text)" }}>{line.location}</strong>
          <span>{line.by ?? "Waiting"}</span>
        </div>
      ))}
    </div>
  );
}
