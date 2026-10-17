import { ArrowLeftRight, CalendarDays, Home, LayoutDashboard, Megaphone } from "lucide-react";
import { CurrentUserAvatar } from "../account/AccountAvatar";
import { PhoneNav, type PhoneNavLink } from "../shell/PhoneNav";
import "./employee-dashboard.css";

const bar: readonly PhoneNavLink[] = [
  { to: "/app/employee-hub", label: "Home", icon: Home, exact: true },
  { to: "/app/employee-hub/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/app/employee-hub/shift-hub", label: "Requests", icon: ArrowLeftRight },
];

/**
 * The employee view's phone navigation: the same bar and More sheet as
 * management's (CALISAN-MORE, Mert 2026-10-17), with the employee's pages.
 */
export function EmployeeMobileNav({
  managementHome,
  announcements,
  onSignOut,
}: {
  // Where owner, admin and manager go back to; null for an employee (FB-6.2.8).
  readonly managementHome: string | null;
  readonly announcements: boolean;
  readonly onSignOut: () => void;
}) {
  const more: PhoneNavLink[] = [
    ...(managementHome ? [{ to: managementHome, label: "Management view", icon: LayoutDashboard }] : []),
    { to: "/app/employee-hub/my-availability", label: "My availability", icon: CalendarDays },
    ...(announcements ? [{ to: "/app/announcements", label: "Announcements", icon: Megaphone }] : []),
    { to: "/account/profile", label: "My account", icon: CurrentUserAvatar },
    { to: "/account/workspaces", label: "Switch workspace", icon: ArrowLeftRight },
  ];
  return <PhoneNav label="Employee navigation" bar={bar} more={more} onSignOut={onSignOut} />;
}
