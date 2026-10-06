import { type HTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

type AppWindowProps = HTMLAttributes<HTMLDivElement> & {
  /** Path shown in the address field, e.g. "/app/schedule". */
  readonly path?: string;
  readonly sidebar?: ReactNode;
  readonly children: ReactNode;
};

/** A desktop browser window around an app screen. */
export function AppWindow({ path = "/app/schedule", sidebar, children, className, ...rest }: AppWindowProps) {
  return (
    <div className={["app-window", className].filter(Boolean).join(" ")} {...rest}>
      <div className="app-window__bar" aria-hidden="true">
        <span className="app-window__dots">
          <i />
          <i />
          <i />
        </span>
        <span className="app-window__address">{path}</span>
        <span style={{ width: "calc(42 * var(--u))" }} />
      </div>
      <div className="app-window__body" style={sidebar ? undefined : { gridTemplateColumns: "1fr" }}>
        {sidebar}
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}

type NavEntry = {
  readonly label: string;
  readonly icon: IconName;
  readonly child?: boolean;
  readonly count?: number;
};

// The app's real navigation (apps/web/src/shell/AppShell.tsx navItems).
export const MANAGEMENT_NAV: readonly NavEntry[] = [
  { label: "Workspace", icon: "LayoutDashboard" },
  { label: "Schedule", icon: "CalendarDays" },
  { label: "Requests", icon: "MessageSquareWarning", child: true },
  { label: "Employees", icon: "Users" },
  { label: "Documents", icon: "FileText", child: true },
  { label: "Availability", icon: "CalendarCheck" },
  { label: "Important Dates", icon: "CalendarDays" },
  { label: "Announcements", icon: "Megaphone" },
  { label: "Notifications", icon: "Bell" },
  { label: "Settings", icon: "Settings" },
];

export const EMPLOYEE_NAV: readonly NavEntry[] = [
  { label: "Home", icon: "House" },
  { label: "Schedule", icon: "CalendarDays" },
  { label: "Shift Hub", icon: "ClipboardList" },
  { label: "My Availability", icon: "CalendarDays" },
  { label: "Announcements", icon: "Megaphone" },
  { label: "Notifications", icon: "Bell" },
];

type AppSidebarProps = {
  readonly workspace: string;
  readonly initials: string;
  readonly items?: readonly NavEntry[];
  readonly active: string;
  readonly counts?: Readonly<Record<string, number>>;
  readonly rail?: boolean;
};

export function AppSidebar({ workspace, initials, items = MANAGEMENT_NAV, active, counts, rail }: AppSidebarProps) {
  return (
    <nav className={rail ? "app-sidebar app-sidebar--rail" : "app-sidebar"} aria-hidden="true">
      <div className="app-sidebar__workspace">
        <span className="app-sidebar__logo">{initials}</span>
        {rail ? null : <span>{workspace}</span>}
      </div>
      {items.map((item) => (
        <span
          key={`${item.label}-${item.icon}`}
          className={item.child && !rail ? "app-nav-item app-nav-item--child" : "app-nav-item"}
          aria-current={item.label === active ? "page" : undefined}
        >
          <Icon name={item.icon} />
          {rail ? null : item.label}
          {!rail && counts?.[item.label] ? <span className="app-nav-item__count">{counts[item.label]}</span> : null}
        </span>
      ))}
    </nav>
  );
}
