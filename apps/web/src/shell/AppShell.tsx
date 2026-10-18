import type { Permission } from "@newfork/shared";
import {
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  FileText,
  ClipboardList,
  Home,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareWarning,
  Settings,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState, type ComponentType } from "react";
import { useFrozenTop } from "./useFrozenTop";
import { useListPhoneWidth, usePhoneWidth } from "../lib/usePhoneWidth";
import { ManagementMobileNav } from "./ManagementMobileNav";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { PhoneAlertsHome } from "../phone-alerts/PhoneAlertsHome";
import { usePhoneAlertsShell } from "../phone-alerts/use-phone-alerts-shell";
import { EmployeeMobileNav } from "../employee-hub/EmployeeMobileNav";
import { useAuth } from "../auth/AuthContext";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { CurrentUserAvatar } from "../account/AccountAvatar";
import { can } from "../auth/can";
import { workspaceLandingPathForRole } from "../auth/resolveLanding";
import {
  EmployeeViewSidebarLink,
  employeeViewMobileLink,
  isEmployeeViewPath,
} from "./EmployeeViewSwitch";

import { countAccountAttention, supabaseClient } from "../lib/supabase";

import { requestAppNavigation } from "./leave-guard";
import { NotificationsNavEntry } from "../notifications/NotificationsNavEntry";
import { ManagerPhoneBar } from "./ManagerPhoneBar";

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  readonly anyOf: readonly Permission[];
  readonly section: "management" | "employee" | "shared";
  readonly parentTo?: string;
  readonly roles?: readonly ("owner" | "admin" | "manager" | "employee")[];
  readonly exact?: boolean;
}

const navItems: readonly NavItem[] = [
  {
    to: "/app/workspace",
    label: "Workspace",
    icon: LayoutDashboard,
    anyOf: ["workspace.read"],
    section: "management",
    roles: ["owner", "admin", "manager"],
  },
  {
    to: "/app/schedule",
    label: "Schedule",
    icon: CalendarDays,
    anyOf: ["schedule.read"],
    section: "management",
    roles: ["owner", "admin", "manager"],
    exact: true,
  },
  {
    to: "/app/schedule/requests",
    label: "Requests",
    icon: MessageSquareWarning,
    anyOf: [
      "schedule.time_off_requests.read",
      "schedule.shift_change_requests.read",
    ],
    section: "management",
    parentTo: "/app/schedule",
    roles: ["owner", "admin", "manager"],
  },
  {
    to: "/app/schedule/lineup",
    label: "Lineup",
    icon: ClipboardList,
    anyOf: ["schedule.read"],
    section: "management",
    parentTo: "/app/schedule",
    roles: ["owner", "admin", "manager"],
  },
  {
    to: "/app/employees",
    label: "Employees",
    icon: Users,
    exact: true,
    anyOf: ["employees.read"],
    section: "management",
    roles: ["owner", "admin", "manager"],
  },
  {
    to: "/app/employees/documents",
    label: "Documents",
    icon: FileText,
    anyOf: ["employee_documents.read"],
    section: "management",
    parentTo: "/app/employees",
    roles: ["owner", "admin", "manager"],
  },
  {
    to: "/app/availability",
    label: "Availability",
    icon: CalendarCheck,
    anyOf: ["availability.read"],
    section: "management",
    roles: ["owner", "admin", "manager"],
  },
  {
    to: "/app/employee-hub",
    label: "Home",
    icon: Home,
    anyOf: ["workspace.read"],
    section: "employee",
    roles: ["employee"],
    exact: true,
  },
  {
    to: "/app/employee-hub/schedule",
    label: "Schedule",
    icon: CalendarDays,
    anyOf: ["workspace.read"],
    section: "employee",
    roles: ["employee"],
    exact: true,
  },
  // Employee → Schedule → Team schedule (CALISAN-SCHEDULE-LISTE): the published board; Schedule itself is My shifts.
  {
    to: "/app/employee-hub/schedule/team",
    label: "Team schedule",
    icon: CalendarDays,
    anyOf: ["workspace.read"],
    section: "employee",
    parentTo: "/app/employee-hub/schedule",
    roles: ["employee"],
  },
  // Employee → Schedule → Lineup (LINEUP-PUBLISH-WEB): the published lineups she is on.
  {
    to: "/app/employee-hub/schedule/lineup",
    label: "Lineup",
    icon: ClipboardList,
    anyOf: ["workspace.read"],
    section: "employee",
    parentTo: "/app/employee-hub/schedule",
    roles: ["employee"],
  },
  {
    to: "/app/employee-hub/shift-hub",
    label: "Shift Hub",
    icon: ClipboardList,
    anyOf: ["workspace.read"],
    section: "employee",
    roles: ["employee"],
  },
  {
    to: "/app/employee-hub/my-availability",
    label: "My Availability",
    icon: CalendarDays,
    anyOf: ["workspace.read"],
    section: "employee",
    roles: ["employee"],
  },
  {
    to: "/app/announcements",
    label: "Announcements",
    icon: Megaphone,
    anyOf: ["announcements.read"],
    section: "shared",
  },
  // A child page of Announcements (EKRAN-08): one record, Important Dates among the posts.
  {
    to: "/app/announcements/important-dates",
    label: "Important Dates",
    icon: CalendarDays,
    anyOf: ["important_dates.read"],
    section: "shared",
    parentTo: "/app/announcements",
    roles: ["owner", "admin", "manager"],
  },
];

const settingsNavItem: NavItem = {
  to: "/app/settings",
  label: "Settings",
  icon: Settings,
  anyOf: [
    "workspace.manage",
    "roles.read",
    "documents.read",
  ],
  section: "management",
};

export function AppShell() {
  const { context, account, signOut } = useAuth();
  useExchangeRealtime(context);
  const [collapsed, setCollapsed] = useState(false);
  const [main, setMain] = useState<HTMLElement | null>(null);
  useFrozenTop(main);
  const [expandedNavGroups, setExpandedNavGroups] = useState<Set<string>>(
    () => new Set(["/app/schedule", "/app/employees", "/app/announcements", "/app/employee-hub/schedule"]),
  );
  const location = useLocation();
  const navigate = useNavigate();
  usePhoneAlertsShell(account?.userId ?? null, location.pathname, navigate);
  const phone = usePhoneWidth();
  // The bottom bar's width (720 px and below): the management top bar comes with it.
  const phoneBars = useListPhoneWidth();
  const permissions = new Set(context?.permissions ?? []);
  // What the account area is waiting for, totalled. The same query the account
  // nav runs, so opening the account costs no second fetch.
  const accountAttention = useQuery({
    queryKey: ["account-attention", account?.userId],
    queryFn: () =>
      supabaseClient
        ? countAccountAttention(supabaseClient)
        : { documents: 0, workspaces: 0 },
    enabled: Boolean(account),
  });
  const accountWaiting =
    (accountAttention.data?.documents ?? 0) +
    (accountAttention.data?.workspaces ?? 0);
  if (!context) return null;
  const isEmployee = context.membership.role === "employee";
  // Owner, admin and manager with an employee record of their own switch to
  // the employee view, which opens in the employee's own frame (FB-6.2.8).
  const canSwitchView = !isEmployee && can(context, "employee_hub.read");
  const inEmployeeView = canSwitchView && isEmployeeViewPath(location.pathname);
  const employeeShell = isEmployee || inEmployeeView;
  const shellRole = employeeShell ? "employee" : context.membership.role;
  const managementHome = workspaceLandingPathForRole(context.membership.role);
  const visibleNavItems = navItems.filter(
    (item) =>
      (!item.roles || item.roles.includes(shellRole)) &&
      // KARARLAR "Schedule telefonda tamamen kapalı": a phone shows no Schedule entry.
      !(phone && item.to === "/app/schedule") &&
      item.anyOf.some((permission) => permissions.has(permission)),
  );
  const visibleSidebarItems = visibleNavItems.filter(
    (item) =>
      !item.parentTo ||
      !visibleNavItems.some((parent) => parent.to === item.parentTo) ||
      isRailItemActive(location.pathname, item.parentTo) ||
      expandedNavGroups.has(item.parentTo),
  );
  const canViewSettings =
    !employeeShell &&
    (context.membership.role === "owner" ||
      context.membership.role === "admin" ||
      settingsNavItem.anyOf.some((permission) => permissions.has(permission)));
  const signOutAfterAvailabilityCheck = () =>
    requestAppNavigation(() => {
      void signOut();
    });
  return (
    <div
      className="app-shell"
      data-sidebar-collapsed={collapsed}
      data-employee-shell={employeeShell}
    >
      <aside className="app-sidebar" aria-label="Application sidebar">
        <div className="sidebar-tools">
          <button
            className={`icon-button${collapsed ? " rail-peek-item" : ""}`}
            type="button"
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            aria-expanded={!collapsed}
            data-rail-peek={collapsed ? "" : undefined}
            onClick={() => setCollapsed((value) => !value)}
          >
            <span className="nav-icon-frame">
              <Menu size={18} aria-hidden />
            </span>
            {collapsed ? (
              <span className="rail-flyout">Expand menu</span>
            ) : null}
          </button>
          {/* The name says where the person is; switching lives in the footer
              row above Settings (Mert 2026-10-13). */}
          {collapsed ? null : (
            <strong className="sidebar-workspace-name">
              {context.workspace.name}
            </strong>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {visibleSidebarItems.map((item, index) => {
            const Icon = item.icon;
            const previous = visibleSidebarItems[index - 1];
            const startsEmployeeSection =
              item.section === "employee" && previous?.section === "management";
            const children = visibleNavItems.filter(
              (candidate) => candidate.parentTo === item.to,
            );
            const hasChildren = children.length > 0;
            // A parent whose child page is open is not the open page itself.
            const childActive = children.some((child) =>
              isRailItemActive(location.pathname, child.to),
            );
            const isExpanded =
              hasChildren &&
              (expandedNavGroups.has(item.to) ||
                isRailItemActive(location.pathname, item.to));
            return (
              <div
                className={`sidebar-nav-entry${
                  startsEmployeeSection ? " sidebar-nav-section-start" : ""
                }`}
                key={item.to}
              >
                <NavLink
                  className={({ isActive }) =>
                    `nav-item${isActive ? " active" : ""}${
                      collapsed ? " rail-peek-item" : ""
                    }${item.parentTo && visibleNavItems.some((parent) => parent.to === item.parentTo) ? " nav-item-child" : ""}${
                      hasChildren ? " nav-item-has-children" : ""
                    }`
                  }
                  to={item.to}
                  end={item.exact || childActive}
                  aria-label={collapsed ? item.label : undefined}
                  data-rail-peek={collapsed ? "" : undefined}
                  data-rail-active={
                    collapsed && !childActive && isNavItemActive(location.pathname, item)
                      ? "true"
                      : undefined
                  }
                >
                  <span className="nav-icon-frame">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className={collapsed ? "rail-flyout" : undefined}>
                    {item.label}
                  </span>
                </NavLink>
                {hasChildren && !collapsed ? (
                  <button
                    className="nav-group-toggle"
                    type="button"
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.label}`}
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedNavGroups((current) => {
                        const next = new Set(current);
                        if (next.has(item.to)) {
                          next.delete(item.to);
                        } else {
                          next.add(item.to);
                        }
                        return next;
                      })
                    }
                  >
                    <ChevronDown
                      className={isExpanded ? "rotate" : ""}
                      size={16}
                      aria-hidden
                    />
                  </button>
                ) : null}
              </div>
            );
          })}
          <NotificationsNavEntry collapsed={collapsed} />
        </nav>

        <div className="sidebar-footer">
          <WorkspaceSwitcher
            workspaceName={context.workspace.name}
            collapsed={collapsed}
          />
          {canViewSettings ? (
            <NavLink
              className={({ isActive }) =>
                `nav-item${isActive ? " active" : ""}${
                  collapsed ? " rail-peek-item" : ""
                }`
              }
              to={settingsNavItem.to}
              aria-label={collapsed ? settingsNavItem.label : undefined}
              data-rail-peek={collapsed ? "" : undefined}
              data-rail-active={
                collapsed &&
                isRailItemActive(location.pathname, settingsNavItem.to)
                  ? "true"
                  : undefined
              }
            >
              <span className="nav-icon-frame">
                <Settings size={18} aria-hidden />
              </span>
              <span className={collapsed ? "rail-flyout" : undefined}>
                {settingsNavItem.label}
              </span>
            </NavLink>
          ) : null}
          {canSwitchView ? (
            <EmployeeViewSidebarLink
              inEmployeeView={inEmployeeView}
              backTo={managementHome}
              collapsed={collapsed}
            />
          ) : null}
          <NavLink
            className={({ isActive }) =>
              `nav-item${isActive ? " active" : ""}${
                collapsed ? " rail-peek-item" : ""
              }`
            }
            to="/account/profile"
            aria-label={
              accountWaiting > 0
                ? `Account, ${accountWaiting} waiting on you`
                : collapsed
                  ? "Account"
                  : undefined
            }
            data-rail-peek={collapsed ? "" : undefined}
            data-rail-active={
              collapsed &&
              isRailItemActive(location.pathname, "/account/profile")
                ? "true"
                : undefined
            }
          >
            <span className="nav-icon-frame">
              <CurrentUserAvatar />
            </span>
            <span className={collapsed ? "rail-flyout" : undefined}>
              Account
            </span>
            {/* The total behind the tabs. Somebody is waiting for an answer
                that lives in there, and the rail is where the person is. */}
            {accountWaiting > 0 ? (
              <span className="nav-item-count" aria-hidden>
                {accountWaiting}
              </span>
            ) : null}
          </NavLink>
          <button
            className={`nav-item${collapsed ? " rail-peek-item" : ""}`}
            type="button"
            aria-label={collapsed ? "Sign out" : undefined}
            data-rail-peek={collapsed ? "" : undefined}
            onClick={signOutAfterAvailabilityCheck}
          >
            <span className="nav-icon-frame">
              <LogOut size={18} aria-hidden />
            </span>
            <span className={collapsed ? "rail-flyout" : undefined}>
              Sign out
            </span>
          </button>
        </div>
      </aside>
      {phoneBars ? <ManagerPhoneBar /> : null}
      <main className="app-main" ref={setMain}>
        <Outlet />
      </main>
      {/* Phone alerts' one ask, on Home only (variant A, KARARLAR S-123). */}
      {location.pathname === (employeeShell ? "/app/employee-hub" : managementHome) ? (
        <PhoneAlertsHome audience={employeeShell ? "employee" : "manager"} />
      ) : null}
      {employeeShell ? (
        <EmployeeMobileNav
          managementHome={inEmployeeView ? managementHome : null}
          announcements={visibleNavItems.some((item) => item.to === "/app/announcements")}
          onSignOut={signOutAfterAvailabilityCheck}
        />
      ) : null}
      {employeeShell ? null : (
        <ManagementMobileNav
          links={[
            ...visibleNavItems.filter((item) => item.section !== "employee"),
            ...(canViewSettings ? [settingsNavItem] : []),
            ...(canSwitchView ? [employeeViewMobileLink] : []),
          ]}
          onSignOut={signOutAfterAvailabilityCheck}
        />
      )}
    </div>
  );
}

function isRailItemActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function isNavItemActive(pathname: string, item: NavItem): boolean {
  return item.exact
    ? pathname === item.to
    : isRailItemActive(pathname, item.to);
}
import { useExchangeRealtime } from "../employee-hub/shift-exchanges/useExchangeRealtime";
