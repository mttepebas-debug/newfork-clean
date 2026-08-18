import type { Permission } from "@newfork/shared";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Clock3,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Settings,
  UserCircle,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState, type ComponentType } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { MiniCalendar } from "./MiniCalendar";
import { getNotifications } from "../communications/communications-data";

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  readonly anyOf: readonly Permission[];
  readonly roles?: readonly ("owner" | "admin" | "manager" | "employee")[];
}

const navItems: readonly NavItem[] = [
  {
    to: "/app/workspace",
    label: "Workspace",
    icon: LayoutDashboard,
    anyOf: ["workspace.read"],
    roles: ["owner", "admin", "manager"],
  },
  {
    to: "/app/schedule",
    label: "Schedule",
    icon: CalendarDays,
    anyOf: ["schedule.read"],
    roles: ["owner", "admin", "manager"],
  },
  {
    to: "/app/time-entries",
    label: "Time Entries",
    icon: Clock3,
    anyOf: ["time.read.location"],
    roles: ["owner", "admin", "manager"],
  },
  {
    to: "/app/employees",
    label: "Employees",
    icon: Users,
    anyOf: ["employees.read"],
  },
  {
    to: "/app/employee-hub",
    label: "Employee Hub",
    icon: Users,
    anyOf: ["workspace.read"],
    roles: ["employee"],
  },
  {
    to: "/app/announcements",
    label: "Announcements",
    icon: Megaphone,
    anyOf: ["announcements.read"],
  },
  {
    to: "/app/notifications",
    label: "Notifications",
    icon: Bell,
    anyOf: ["notifications.read"],
  },
  {
    to: "/app/settings",
    label: "Settings",
    icon: Settings,
    anyOf: [
      "workspace.manage",
      "roles.read",
      "documents.read",
      "signature_templates.read",
    ],
  },
];

export function AppShell() {
  const { context, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const workspaceId = context?.workspace.id ?? "";
  const permissions = new Set(context?.permissions ?? []);
  const notificationQuery = useQuery({
    queryKey: ["notifications", workspaceId, "sidebar"],
    queryFn: () => getNotifications(workspaceId, { limit: 1 }),
    enabled: Boolean(workspaceId) && permissions.has("notifications.read"),
    refetchInterval: 60_000,
  });
  if (!context) return null;
  const visibleNavItems = navItems.filter(
    (item) =>
      (!item.roles || item.roles.includes(context.membership.role)) &&
      item.anyOf.some((permission) => permissions.has(permission)),
  );
  const search = new URLSearchParams(location.search);
  const todayIso = new Date().toLocaleDateString("en-CA");
  const selectedDate = search.get("view") === "day" ? search.get("date") : null;
  const weekStartDate = startOfWeekIso(search.get("date") ?? todayIso);
  const displayLabel = formatSidebarDate(todayIso);
  const toggleCalendar = (): void => {
    if (collapsed) setCollapsed(false);
    setCalendarOpen((open) => !open);
  };

  return (
    <div className="app-shell" data-sidebar-collapsed={collapsed}>
      <aside className="app-sidebar" aria-label="Application sidebar">
        <div className="sidebar-tools">
          <button
            className="icon-button"
            type="button"
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            <Menu size={18} aria-hidden />
          </button>
          {collapsed ? null : (
            <strong className="workspace-name">{context.workspace.name}</strong>
          )}
        </div>

        <div className="sidebar-calendar">
          {collapsed ? (
            <button
              className="calendar-trigger-collapsed"
              type="button"
              aria-label="Calendar"
              onClick={toggleCalendar}
            >
              <CalendarDays size={17} aria-hidden />
            </button>
          ) : (
            <div className="calendar-control">
              <button
                className="calendar-current-button"
                type="button"
                onClick={() =>
                  navigate(
                    context.membership.role === "employee"
                      ? `/app/employee-hub/schedule?date=${todayIso}&view=day`
                      : `/app/schedule?date=${todayIso}&view=day`,
                  )
                }
              >
                <CalendarDays size={17} aria-hidden />
                <span>{displayLabel}</span>
              </button>
              <button
                className="calendar-toggle"
                type="button"
                aria-label={`Toggle calendar for ${displayLabel}`}
                aria-expanded={calendarOpen}
                aria-controls="sidebar-calendar-panel"
                onClick={toggleCalendar}
              >
                <ChevronDown
                  className={calendarOpen ? "rotate" : ""}
                  size={16}
                  aria-hidden
                />
              </button>
            </div>
          )}
          {calendarOpen && !collapsed ? (
            <MiniCalendar
              selectedDate={selectedDate}
              weekStartDate={weekStartDate}
              onDayPick={(date) =>
                navigate(
                  context.membership.role === "employee"
                    ? `/app/employee-hub/schedule?date=${date}&view=day`
                    : `/app/schedule?date=${date}&view=day`,
                )
              }
              onWeekJump={(date) =>
                navigate(
                  context.membership.role === "employee"
                    ? `/app/employee-hub/schedule?date=${date}&view=week`
                    : `/app/schedule?date=${date}&view=week`,
                )
              }
            />
          ) : null}
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                className={({ isActive }) =>
                  `nav-item${isActive ? " active" : ""}`
                }
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={18} aria-hidden />
                {collapsed ? null : <span>{item.label}</span>}
                {item.to === "/app/notifications" &&
                (notificationQuery.data?.unread_count ?? 0) > 0 ? (
                  <span
                    className="nav-unread"
                    aria-label={`${notificationQuery.data!.unread_count} unread`}
                  >
                    {notificationQuery.data!.unread_count > 99
                      ? "99+"
                      : notificationQuery.data!.unread_count}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <NavLink
            className="nav-item"
            to="/account/profile"
            title={collapsed ? "Account" : undefined}
          >
            <UserCircle size={18} aria-hidden />
            {collapsed ? null : <span>Account</span>}
          </NavLink>
          <button className="nav-item" type="button" onClick={signOut}>
            <LogOut size={18} aria-hidden />
            {collapsed ? null : <span>Sign out</span>}
          </button>
        </div>
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

function startOfWeekIso(iso: string): string {
  const date = new Date(`${iso}T12:00:00.000Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function formatSidebarDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00.000Z`);
  const day = date.getUTCDate();
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  const month = date.toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const weekday = date.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${month} ${day}${suffix}, ${weekday}`;
}
