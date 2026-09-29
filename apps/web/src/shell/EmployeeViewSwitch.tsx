import { ArrowLeftRight, CalendarClock, LayoutDashboard, UserRound } from "lucide-react";
import { Link, NavLink } from "react-router";
import type { V8 } from "../dev/fb628-variants";
import "./employee-view-switch.css";

/**
 * FB-6.2.8 "Switch to employee view" (KARARLAR: everyone with an employee
 * record has the employee view; owner, admin and manager switch to it from the
 * management view). Three DEV variants; the unpicked two get deleted.
 */
export const employeeViewPath = "/app/employee-hub";

export function isEmployeeViewPath(pathname: string): boolean {
  return pathname === employeeViewPath || pathname.startsWith(`${employeeViewPath}/`);
}

/** A: one sidebar row above Account that flips between the two views. */
export function EmployeeViewSidebarLink({
  inEmployeeView,
  backTo,
  collapsed,
}: {
  readonly inEmployeeView: boolean;
  readonly backTo: string;
  readonly collapsed: boolean;
}) {
  const label = inEmployeeView ? "Management view" : "Employee view";
  const Icon = inEmployeeView ? LayoutDashboard : UserRound;
  return (
    <Link
      className={`nav-item v8-view-link${collapsed ? " rail-peek-item" : ""}`}
      to={inEmployeeView ? backTo : employeeViewPath}
      aria-label={collapsed ? label : undefined}
      data-rail-peek={collapsed ? "" : undefined}
    >
      <span className="nav-icon-frame">
        <Icon size={18} aria-hidden />
      </span>
      <span className={collapsed ? "rail-flyout" : undefined}>{label}</span>
      {collapsed ? null : <ArrowLeftRight className="v8-view-link-hint" size={14} aria-hidden />}
    </Link>
  );
}

/** B: a two-way switch under the workspace name, on every page. */
export function EmployeeViewToggle({
  inEmployeeView,
  backTo,
  placement,
}: {
  readonly inEmployeeView: boolean;
  readonly backTo: string;
  readonly placement: "sidebar" | "phone";
}) {
  return (
    <nav className={`v8-view-toggle v8-view-toggle-${placement}`} aria-label="View">
      <NavLink to={backTo} aria-current={inEmployeeView ? undefined : "page"} className={inEmployeeView ? "" : "active"}>
        <LayoutDashboard size={15} aria-hidden />
        Management
      </NavLink>
      <NavLink to={employeeViewPath} aria-current={inEmployeeView ? "page" : undefined} className={inEmployeeView ? "active" : ""}>
        <UserRound size={15} aria-hidden />
        Employee
      </NavLink>
    </nav>
  );
}

/** C: the employee view stays inside the management frame; a strip says where you are. */
export function EmployeeViewStrip({ backTo }: { readonly backTo: string }) {
  return (
    <div className="v8-view-strip" role="region" aria-label="Employee view">
      <UserRound size={16} aria-hidden />
      <p>
        <strong>Employee view.</strong> <span>Your own shifts, requests and availability.</span>
      </p>
      <Link className="v8-view-strip-back" to={backTo}>
        Back to management
      </Link>
    </div>
  );
}

/** The link the phone menus (More) add, per variant. */
export function employeeViewMobileLink(variant: V8) {
  return variant === "c"
    ? { to: employeeViewPath, label: "My shifts", icon: CalendarClock }
    : { to: employeeViewPath, label: "Employee view", icon: UserRound };
}
