import {
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Clock3,
  Home,
  LayoutGrid,
  LogOut,
  Megaphone,
  Settings2,
  UserCircle,
  Users,
} from "lucide-react";
import { Link, NavLink, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { postMvpSurfaces } from "../lib/post-mvp";
import { CurrentUserAvatar } from "../account/AccountAvatar";
import "./employee-dashboard.css";

export function EmployeeMobileNav() {
  const location = useLocation();
  const routes = [
    { to: "/app/employee-hub", label: "Home", icon: Home, end: true },
    { to: "/app/employee-hub/schedule", label: "Schedule", icon: CalendarDays },
    {
      to: "/app/employee-hub/shift-hub",
      label: "Requests",
      icon: ArrowLeftRight,
    },
    { to: "/app/employee-hub/more", label: "More", icon: LayoutGrid },
  ];
  const secondary = !routes
    .slice(0, 3)
    .some(({ to, end }) => location.pathname === to || (!end && location.pathname.startsWith(`${to}/`)));
  return (
    <nav className="eh-mobile-nav" aria-label="Employee navigation">
      {routes.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            isActive || (label === "More" && secondary) ? "active" : ""
          }
        >
          <Icon size={21} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function EmployeeMorePage() {
  const { context, signOut } = useAuth();
  const links = [
    {
      label: "Time clock & hours",
      detail: "Breaks, clock out and corrections",
      to: "/app/employee-hub/time-tracking",
      icon: Clock3,
      enabled:
        postMvpSurfaces && context?.permissions.includes("time.read.own"),
    },
    {
      label: "My availability",
      detail: "When you’re available to work",
      to: "/app/employee-hub/my-availability",
      icon: CalendarDays,
      enabled: true,
    },
    {
      label: "Line-up",
      detail: "The plan for your shift",
      to: "/app/employee-hub/lineup",
      icon: LayoutGrid,
      enabled: true,
    },
    {
      label: "Announcements",
      detail: "Updates from your team",
      to: "/app/announcements",
      icon: Megaphone,
      enabled: context?.permissions.includes("announcements.read"),
    },
    {
      label: "Notifications",
      detail: "Your latest updates",
      to: "/app/notifications",
      icon: Bell,
      enabled: Boolean(context),
    },
    {
      label: "My account",
      detail: "Your profile and preferences",
      to: "/account/profile",
      icon: UserCircle,
      enabled: true,
    },
    {
      label: "Switch workspace",
      detail: context?.workspace.name ?? "Your workspaces",
      to: "/account/workspaces",
      icon: ArrowLeftRight,
      enabled: true,
    },
    {
      label: "Notification preferences",
      detail: "Choose how you hear from us",
      to: "/account/preferences/notifications",
      icon: Settings2,
      enabled: true,
    },
  ];
  return (
    <section className="eh-more">
      <p className="eh-section-description">Everything else, one tap away.</p>
      <div>
        {links
          .filter((item) => item.enabled)
          .map(({ label, detail, to, icon: Icon }) => (
            <Link key={to} to={to}>
              {to === "/account/profile" ? <CurrentUserAvatar /> : <Icon size={21} />}
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
              <ArrowUpRight size={17} />
            </Link>
          ))}
      </div>
      <button className="eh-sign-out" onClick={() => void signOut()}>
        <LogOut size={18} />
        Sign out
      </button>
    </section>
  );
}
