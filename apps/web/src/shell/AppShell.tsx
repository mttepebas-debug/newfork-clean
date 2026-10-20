import type { Permission } from "@newfork/shared";
import { contentHeldAtMenuEdge } from "./content-held";
import {
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  FileText,
  ClipboardList,
  Home,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareWarning,
  Settings,
  Users,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { PullToRefreshMark, usePullToRefresh } from "./PullToRefresh";
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
import { noAccessHomePath, workspaceLandingPathForRole } from "../auth/resolveLanding";
import {
  EmployeeViewSidebarLink,
  employeeViewMobileLink,
  isEmployeeViewPath,
} from "./EmployeeViewSwitch";

import { countAccountAttention, supabaseClient } from "../lib/supabase";
import { employeeDocumentsPath, managementDocumentsPath, useOwnDocuments } from "../documents/own-documents";

import { requestAppNavigation } from "./leave-guard";
import { NotificationsNavEntry } from "../notifications/NotificationsNavEntry";
import { ManagerPhoneBar } from "./ManagerPhoneBar";
import { rememberAppPage } from "./last-app-page";
import { hasEmployeeAccess, hasManagementAccess, membershipClass } from "../auth/access";
import { PageCrashBoundary } from "./CrashBoundary";
import { PageOutline } from "./LoadState";

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
    // The managers' Home: one name in both views (Mert 2026-10-19, KARARLAR S-210 (b)); the address stays.
    label: "Home",
    icon: Home,
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
  // One's own documents, a page of its own (MY-DOCUMENTS, Mert 2026-10-19): no
  // longer a tab of Account. Management reaches the same page as My documents.
  {
    to: employeeDocumentsPath,
    label: "Documents",
    icon: FileText,
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
  const location = useLocation();
  // Only the open page's group is open: reaching a group opens it, going to
  // a page outside it closes it, a group opened by hand included. On the page
  // itself the toggle still closes it (SIDEBAR-ACCORDION, Mert 2026-10-19).
  const [expandedNavGroups, setExpandedNavGroups] = useState<Set<string>>(
    () => groupsOpenAt(location.pathname),
  );
  const [seenPath, setSeenPath] = useState(location.pathname);
  if (seenPath !== location.pathname) {
    setSeenPath(location.pathname);
    setExpandedNavGroups(groupsOpenAt(location.pathname));
  }
  // The group the keyboard focus sits in. When that group shuts around it (Back
  // out of a child page), the focus goes to the group's toggle, not the body.
  const focusedGroup = useRef<string | null>(null);
  useLayoutEffect(() => {
    const group = focusedGroup.current;
    if (!group || collapsed || expandedNavGroups.has(group)) return;
    focusedGroup.current = null;
    document.getElementById(`${navGroupId(group)}-toggle`)?.focus();
  }, [expandedNavGroups, collapsed]);
  const navigate = useNavigate();
  usePhoneAlertsShell(account?.userId ?? null, location.pathname, navigate);
  // Account's "Back to workspace" returns here, in this view (ACCOUNT-BACK).
  const workspaceId = context?.workspace.id;
  const userId = account?.userId;
  useEffect(() => {
    if (userId && workspaceId)
      rememberAppPage({ userId, workspaceId, path: location.pathname + location.search });
  }, [userId, workspaceId, location.pathname, location.search]);
  const phone = usePhoneWidth();
  // The bottom bar's width (720 px and below): the management top bar comes with it.
  const phoneBars = useListPhoneWidth();
  // Pull to refresh on every page of a phone (Mert 2026-10-18, S-163 (9)): the
  // page holds still, a turning mark follows the finger, and the release asks
  // again for whatever the page on screen is showing.
  const queryClient = useQueryClient();
  const pullArea = useMemo(() => ({ current: main }), [main]);
  const pull = usePullToRefresh(pullArea, () => queryClient.refetchQueries({ type: "active" }));
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
  // Documents left Account (MY-DOCUMENTS): what waits there is invitations;
  // what the open workspace asks of the person waits on Documents.
  const accountWaiting = accountAttention.data?.workspaces ?? 0;
  // Invitations and ownership transfers are answered on Workspaces, so the
  // row leads there while one waits; Profile has nothing to answer.
  const accountHref =
    accountWaiting > 0 ? "/account/workspaces" : "/account/profile";
  const ownDocuments = useOwnDocuments();
  if (!context) return null;
  const isEmployee = membershipClass(context.membership) === "employee";
  // Owner, admin and manager who also hold the employee access switch to the
  // employee view, which opens in the employee's own frame (FB-6.2.8; ROL-CIFT
  // 6.2, design §4.1: both accesses, never one of them), when the core opens
  // it (employee_hub.read): never a row that leads to a no-access card.
  const canSwitchView =
    hasEmployeeAccess(context.membership) &&
    hasManagementAccess(context.membership) &&
    can(context, "employee_hub.read");
  const inEmployeeView = canSwitchView && isEmployeeViewPath(location.pathname);
  const employeeShell = isEmployee || inEmployeeView;
  const shellRole = employeeShell ? "employee" : membershipClass(context.membership);
  const managementHome = workspaceLandingPathForRole(membershipClass(context.membership));
  const visibleNavItems = navItems.filter(
    (item) =>
      (!item.roles || item.roles.includes(shellRole)) &&
      // KARARLAR "Schedule telefonda tamamen kapalı": a phone shows no Schedule entry.
      !(phone && item.to === "/app/schedule") &&
      item.anyOf.some((permission) => permissions.has(permission)),
  );
  // The desktop menu is a tree: a child page hangs under its parent's row
  // whatever its place in the phone bar's order.
  const topSidebarItems = visibleNavItems.filter(
    (item) =>
      !item.parentTo ||
      !visibleNavItems.some((parent) => parent.to === item.parentTo),
  );
  const canViewSettings =
    !employeeShell &&
    (membershipClass(context.membership) === "owner" ||
      membershipClass(context.membership) === "admin" ||
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
      data-content-held={contentHeldAtMenuEdge(location.pathname)}
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
          {topSidebarItems.map((item, index) => {
            const previous = topSidebarItems[index - 1];
            const startsEmployeeSection =
              item.section === "employee" && previous?.section === "management";
            const children = visibleNavItems.filter(
              (candidate) => candidate.parentTo === item.to,
            );
            const hasChildren = children.length > 0;
            const childActive = children.some((child) =>
              isRailItemActive(location.pathname, child.to),
            );
            // The narrow rail has no toggle: there every group stays open; back
            // in the wide menu only the open page's group is (S-177).
            const isExpanded =
              hasChildren && (collapsed || expandedNavGroups.has(item.to));
            // A parent whose child page is open is not the open page itself,
            // unless its group is closed: then it stands in for the hidden child.
            const standsIn = childActive && !isExpanded;
            const groupId = navGroupId(item.to);
            const renderLink = (link: NavItem, child: boolean) => {
              const LinkIcon = link.icon;
              const waiting = link.to === employeeDocumentsPath ? ownDocuments.waiting : 0;
              return (
                <NavLink
                  key={link.to}
                  className={({ isActive }) =>
                    `nav-item${isActive ? " active" : ""}${
                      collapsed ? " rail-peek-item" : ""
                    }${child ? " nav-item-child" : ""}${
                      !child && hasChildren ? " nav-item-has-children" : ""
                    }`
                  }
                  to={link.to}
                  // A route change opens the group; a plain click on the parent
                  // while its page is already open, which changes no route, does too.
                  onClick={
                    !child && hasChildren && !isExpanded
                      ? (event) => {
                          if (
                            event.button === 0 &&
                            !event.metaKey &&
                            !event.ctrlKey &&
                            !event.shiftKey &&
                            !event.altKey &&
                            location.pathname === link.to
                          )
                            setExpandedNavGroups((current) =>
                              new Set(current).add(link.to),
                            );
                        }
                      : undefined
                  }
                  // Standing in, the parent matches its child's path, so the
                  // reader hears it as where the person is.
                  end={child ? link.exact : !standsIn && (link.exact || childActive)}
                  aria-current={!child && standsIn ? "location" : "page"}
                  aria-label={
                    waiting > 0
                      ? `${link.label}, ${waiting} waiting on you`
                      : collapsed
                        ? link.label
                        : undefined
                  }
                  data-rail-peek={collapsed ? "" : undefined}
                  data-rail-active={
                    collapsed &&
                    (!child && childActive
                      ? standsIn
                      : isNavItemActive(location.pathname, link))
                      ? "true"
                      : undefined
                  }
                >
                  <span className="nav-icon-frame">
                    <LinkIcon size={18} aria-hidden />
                  </span>
                  <span className={collapsed ? "rail-flyout" : undefined}>
                    {link.label}
                  </span>
                  {waiting > 0 ? (
                    <span className="nav-item-count" aria-hidden>
                      {waiting}
                    </span>
                  ) : null}
                </NavLink>
              );
            };
            return (
              <div
                className={`sidebar-nav-entry${
                  startsEmployeeSection ? " sidebar-nav-section-start" : ""
                }`}
                data-group-open={hasChildren ? isExpanded : undefined}
                key={item.to}
              >
                {renderLink(item, false)}
                {hasChildren && !collapsed ? (
                  <button
                    className="nav-group-toggle"
                    id={`${groupId}-toggle`}
                    type="button"
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.label}`}
                    aria-expanded={isExpanded}
                    aria-controls={groupId}
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
                    <ChevronDown size={16} aria-hidden />
                  </button>
                ) : null}
                {hasChildren ? (
                  // Kept in the page while closed so it can slide shut; inert
                  // takes its links out of the tab order and the reader.
                  <div
                    className="nav-children"
                    id={groupId}
                    data-open={isExpanded}
                    inert={!isExpanded}
                    onFocus={() => {
                      focusedGroup.current = item.to;
                    }}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget))
                        focusedGroup.current = null;
                    }}
                  >
                    <div className="nav-children-inner">
                      {children.map((child) => renderLink(child, true))}
                    </div>
                  </div>
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
          {/* One's own documents, in the management interface only when the
              workspace asks the person for any (MY-DOCUMENTS, Mert 2026-10-19). */}
          {!employeeShell && ownDocuments.asked ? (
            <NavLink
              className={({ isActive }) =>
                `nav-item${isActive ? " active" : ""}${
                  collapsed ? " rail-peek-item" : ""
                }`
              }
              to={managementDocumentsPath}
              aria-label={
                ownDocuments.waiting > 0
                  ? `My documents, ${ownDocuments.waiting} waiting on you`
                  : collapsed
                    ? "My documents"
                    : undefined
              }
              data-rail-peek={collapsed ? "" : undefined}
              data-rail-active={
                collapsed &&
                isRailItemActive(location.pathname, managementDocumentsPath)
                  ? "true"
                  : undefined
              }
            >
              <span className="nav-icon-frame">
                <FileText size={18} aria-hidden />
              </span>
              <span className={collapsed ? "rail-flyout" : undefined}>
                My documents
              </span>
              {ownDocuments.waiting > 0 ? (
                <span className="nav-item-count" aria-hidden>
                  {ownDocuments.waiting}
                </span>
              ) : null}
            </NavLink>
          ) : null}
          <NavLink
            className={({ isActive }) =>
              `nav-item${isActive ? " active" : ""}${
                collapsed ? " rail-peek-item" : ""
              }`
            }
            to={accountHref}
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
        {phoneBars ? <PullToRefreshMark state={pull.state} pull={pull.pull} /> : null}
        <PageCrashBoundary homeHref={noAccessHomePath(context, location.pathname)}>
          {/* A page's code on its way waits here, not above the shell: the
              menu stays and only the page area shows the outline. */}
          <Suspense fallback={<PageOutline />}>
            <Outlet />
          </Suspense>
        </PageCrashBoundary>
      </main>
      {/* Phone alerts' one ask, on Home only (variant A, KARARLAR S-123); the employee's Home shows it in its own list (Daylight, Mert 2026-10-18). */}
      {!employeeShell && location.pathname === managementHome ? <PhoneAlertsHome audience="manager" /> : null}
      {employeeShell ? (
        <EmployeeMobileNav
          managementHome={inEmployeeView ? managementHome : null}
          announcements={visibleNavItems.some((item) => item.to === "/app/announcements")}
          documentsWaiting={ownDocuments.waiting}
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
          ownDocuments={
            ownDocuments.asked
              ? { to: managementDocumentsPath, label: "My documents", icon: FileText, count: ownDocuments.waiting }
              : null
          }
          onSignOut={signOutAfterAvailabilityCheck}
        />
      )}
    </div>
  );
}

// The group a page belongs to, read off the menu entry whose path holds it
// most closely: a child's group, or a parent's own on the parent's page and its
// sub-pages (Schedule's Export, Employees' Archive). A page with an entry of its
// own under a parent's path (Requests) belongs to no group.
function groupsOpenAt(pathname: string): Set<string> {
  const owner = navItems
    .filter((item) => isRailItemActive(pathname, item.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const open =
    owner?.parentTo ??
    (owner && navItems.some((item) => item.parentTo === owner.to)
      ? owner.to
      : undefined);
  return new Set(open ? [open] : []);
}

function navGroupId(parentTo: string): string {
  return `nav-group-${parentTo.replaceAll("/", "-")}`;
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
