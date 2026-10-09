import { ArrowLeftRight, LayoutDashboard, UserRound } from "lucide-react";
import { Link } from "react-router";
import "./employee-view-switch.css";

/**
 * "Switch to employee view" (FB-6.2.8, KARARLAR: everyone with an employee
 * record has the employee view; owner, admin and manager switch to it from the
 * management view and come back from the same row).
 */
export const employeeViewPath = "/app/employee-hub";

export function isEmployeeViewPath(pathname: string): boolean {
  return pathname === employeeViewPath || pathname.startsWith(`${employeeViewPath}/`);
}

/** One sidebar row above Account that flips between the two views. */
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
      className={`nav-item employee-view-link${collapsed ? " rail-peek-item" : ""}`}
      to={inEmployeeView ? backTo : employeeViewPath}
      aria-label={collapsed ? label : undefined}
      data-rail-peek={collapsed ? "" : undefined}
    >
      <span className="nav-icon-frame">
        <Icon size={18} aria-hidden />
      </span>
      <span className={collapsed ? "rail-flyout" : undefined}>{label}</span>
      {collapsed ? null : (
        <ArrowLeftRight className="employee-view-link-hint" size={14} aria-hidden />
      )}
    </Link>
  );
}

/** The row the phone's management More menu adds. */
export const employeeViewMobileLink = {
  to: employeeViewPath,
  label: "Employee view",
  icon: UserRound,
};
