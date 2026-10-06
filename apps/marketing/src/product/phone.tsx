import { type HTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

type Tab = { readonly label: string; readonly icon: IconName };

// The employee phone bottom bar (apps/web/src/employee-hub): Home,
// Schedule, Requests (→ Shift Hub), More.
export const EMPLOYEE_TABS: readonly Tab[] = [
  { label: "Home", icon: "House" },
  { label: "Schedule", icon: "CalendarDays" },
  { label: "Requests", icon: "ArrowLeftRight" },
  { label: "More", icon: "LayoutGrid" },
];

type PhoneProps = HTMLAttributes<HTMLDivElement> & {
  readonly active?: string;
  readonly time?: string;
  readonly tabs?: readonly Tab[] | null;
  readonly children: ReactNode;
};

/** A generic phone around the employee app (a responsive web app, not a store app). */
export function Phone({ active = "Home", time = "9:41", tabs = EMPLOYEE_TABS, children, className, ...rest }: PhoneProps) {
  return (
    <div className={["phone", className].filter(Boolean).join(" ")} {...rest}>
      <div className="phone__screen">
        <span className="phone__camera" />
        <div className="phone__status" aria-hidden="true">
          <span>{time}</span>
          <span className="phone__status-icons">
            <i />
            <i />
          </span>
        </div>
        <div className="phone__body">{children}</div>
        {tabs ? (
          <div className="phone__tabbar" aria-hidden="true">
            {tabs.map((tab) => (
              <span key={tab.label} className="phone__tab" aria-current={tab.label === active ? "page" : undefined}>
                <Icon name={tab.icon} />
                {tab.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PhoneHeader({ eyebrow, title, lead }: { readonly eyebrow?: string; readonly title: string; readonly lead?: string }) {
  return (
    <div className="phone-head">
      {eyebrow ? <span className="phone-head__eyebrow">{eyebrow}</span> : null}
      <span className="phone-head__title">{title}</span>
      {lead ? <span className="phone-head__lead">{lead}</span> : null}
    </div>
  );
}
