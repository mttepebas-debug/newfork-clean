import { useAccountNotificationRealtime } from "../communications/use-account-notification-realtime";
import type { Permission } from "@newfork/shared";
import {
  Bell,
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { AppSidebarPanelContext } from "./AppSidebarPanel";
import { NavLink, Outlet, useLocation } from "react-router";
import { EmployeeMobileNav } from "../employee-hub/EmployeeMobileNav";
import { useAuth } from "../auth/AuthContext";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { CurrentUserAvatar } from "../account/AccountAvatar";

import {
  getNotifications,
  notificationChangeEventName,
  notificationChangeStorageKey,
} from "../communications/communications-data";
import { countAccountAttention, supabaseClient } from "../lib/supabase";

import { requestAvailabilityNavigation } from "../availability/availability-navigation";

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
    to: "/app/important-dates",
    label: "Important Dates",
    icon: CalendarDays,
    anyOf: ["important_dates.read"],
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
  {
    to: "/app/notifications",
    label: "Notifications",
    icon: Bell,
    anyOf: ["notifications.read"],
    section: "shared",
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
    "signature_templates.read",
  ],
  section: "management",
};

export function AppShell() {
  const { context, account, signOut } = useAuth();
  useAccountNotificationRealtime(account?.userId ?? context?.userId);
  useExchangeRealtime(context?.workspace.id);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarPanelOwner, setSidebarPanelOwner] = useState<string | null>(null);
  const [sidebarPanelCollapsed, setSidebarPanelCollapsed] = useState(false);
  const [sidebarPanelTarget, setSidebarPanelTarget] = useState<HTMLDivElement | null>(null);
  const sidebarPanelHost = useMemo(() => ({
    target: sidebarPanelTarget,
    collapsed: sidebarPanelCollapsed,
    setCollapsed: setSidebarPanelCollapsed,
    setOwner: setSidebarPanelOwner,
  }), [sidebarPanelTarget, sidebarPanelCollapsed]);
  const [expandedNavGroups, setExpandedNavGroups] = useState<Set<string>>(
    () => new Set(["/app/schedule", "/app/employees"]),
  );
  const location = useLocation();
  const workspaceId = context?.workspace.id ?? "";
  const queryClient = useQueryClient();
  const permissions = new Set(context?.permissions ?? []);
  const notificationQuery = useQuery({
    queryKey: ["notifications", account?.userId ?? context?.userId, workspaceId, "sidebar"],
    queryFn: () => getNotifications(workspaceId, { limit: 1 }),
    enabled: Boolean(workspaceId),
    refetchInterval: 60_000,
  });
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
  useEffect(() => {
    if (!workspaceId) return;
    const invalidateNotifications = () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-dashboard"] });
    };
    const handleLocalEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId?: string }>).detail;
      if (!detail?.workspaceId || detail.workspaceId === workspaceId) {
        invalidateNotifications();
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== notificationChangeStorageKey || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as { workspaceId?: string };
        if (!parsed.workspaceId || parsed.workspaceId === workspaceId) {
          invalidateNotifications();
        }
      } catch {
        invalidateNotifications();
      }
    };
    window.addEventListener(notificationChangeEventName, handleLocalEvent);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(notificationChangeEventName, handleLocalEvent);
      window.removeEventListener("storage", handleStorage);
    };
  }, [queryClient, workspaceId]);
  useEffect(() => {
    if (!workspaceId || !supabaseClient) return;
    const client = supabaseClient;
    const invalidateNotifications = () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-dashboard"] });
    };
    const channel = client
      .channel(`notification-inbox:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notification_inbox_items",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        invalidateNotifications,
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [queryClient, workspaceId]);
  if (!context) return null;
  const visibleNavItems = navItems.filter(
    (item) =>
      (!item.roles || item.roles.includes(context.membership.role)) &&
      (item.to === "/app/notifications" || item.anyOf.some((permission) => permissions.has(permission))),
  );
  const visibleSidebarItems = visibleNavItems.filter(
    (item) =>
      !item.parentTo ||
      !visibleNavItems.some((parent) => parent.to === item.parentTo) ||
      isRailItemActive(location.pathname, item.parentTo) ||
      expandedNavGroups.has(item.parentTo),
  );
  const canViewSettings =
    context.membership.role === "owner" ||
    context.membership.role === "admin" ||
    settingsNavItem.anyOf.some((permission) => permissions.has(permission));
  return (
    <AppSidebarPanelContext.Provider value={sidebarPanelHost}>
    <div
      className="app-shell"
      data-sidebar-collapsed={sidebarPanelOwner ? sidebarPanelCollapsed : collapsed}
      data-employee-shell={context.membership.role === "employee"}
    >
      <aside className="app-sidebar" aria-label="Application sidebar">
        {sidebarPanelOwner ? <div className="app-sidebar-panel-host" ref={setSidebarPanelTarget} /> : <>
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
          <WorkspaceSwitcher
            workspaceName={context.workspace.name}
            collapsed={collapsed}
          />
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {visibleSidebarItems.map((item, index) => {
            const Icon = item.icon;
            const unreadCount =
              item.to === "/app/notifications"
                ? (notificationQuery.data?.unread_count ?? 0)
                : 0;
            const previous = visibleSidebarItems[index - 1];
            const startsEmployeeSection =
              item.section === "employee" && previous?.section === "management";
            const children = visibleNavItems.filter(
              (candidate) => candidate.parentTo === item.to,
            );
            const hasChildren = children.length > 0;
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
                    }${item.parentTo ? " nav-item-child" : ""}${
                      hasChildren ? " nav-item-has-children" : ""
                    }`
                  }
                  to={item.to}
                  end={item.exact}
                  aria-label={collapsed ? item.label : undefined}
                  data-rail-peek={collapsed ? "" : undefined}
                  data-rail-active={
                    collapsed && isNavItemActive(location.pathname, item)
                      ? "true"
                      : undefined
                  }
                >
                  <span className="nav-icon-frame">
                    <Icon size={18} aria-hidden />
                    {collapsed && unreadCount > 0 ? (
                      <span
                        className="nav-unread nav-unread-collapsed"
                        aria-label={`${unreadCount} unread`}
                      >
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </span>
                  <span className={collapsed ? "rail-flyout" : undefined}>
                    {item.label}
                  </span>
                  {!collapsed && unreadCount > 0 ? (
                    <span
                      className="nav-unread"
                      aria-label={`${unreadCount} unread`}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
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
        </nav>

        <div className="sidebar-footer">
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
            onClick={() =>
              requestAvailabilityNavigation(() => {
                void signOut();
              })
            }
          >
            <span className="nav-icon-frame">
              <LogOut size={18} aria-hidden />
            </span>
            <span className={collapsed ? "rail-flyout" : undefined}>
              Sign out
            </span>
          </button>
        </div>
        </>}
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
      {context.membership.role === "employee" && <EmployeeMobileNav />}
    </div>
    </AppSidebarPanelContext.Provider>
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
