import type { ActiveWorkspaceContext } from "@newfork/shared";
import { useCallback, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { hasEmployeeAccess, hasManagementAccess, membershipClass } from "../auth/access";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { isEmployeeViewPath } from "./EmployeeViewSwitch";

/**
 * The shell reads the view off the address, so a page both views show has an
 * address in each (EMPLOYEE-ANNOUNCEMENTS, NOTICE-VIEW, Mert 2026-10-21): the
 * employee view's under /app/employee-hub, the management view's outside it.
 * A notice carries the management one; it opens where the person is.
 */
export const managementAnnouncementsPath = "/app/announcements";
export const employeeAnnouncementsPath = "/app/employee-hub/announcements";
export const managementNotificationsPath = "/app/notifications";
export const employeeNotificationsPath = "/app/employee-hub/notifications";

/** Which frame the shell draws at this address, and whether the person may switch. */
export function employeeViewAt(context: ActiveWorkspaceContext, pathname: string) {
  // Owner, admin and manager who also hold the employee access switch to the
  // employee view, which opens in the employee's own frame (FB-6.2.8; ROL-CIFT
  // 6.2, design §4.1: both accesses, never one of them), when the core opens
  // it (employee_hub.read): never a row that leads to a no-access card.
  const canSwitchView =
    hasEmployeeAccess(context.membership) &&
    hasManagementAccess(context.membership) &&
    can(context, "employee_hub.read");
  const inEmployeeView = canSwitchView && isEmployeeViewPath(pathname);
  const employeeShell = membershipClass(context.membership) === "employee" || inEmployeeView;
  return { canSwitchView, inEmployeeView, employeeShell };
}

const sharedPage = /^\/app\/(?:employee-hub\/)?(announcements(?:\/important-dates)?|notifications)(\/[^/?#]+)?([?#].*)?$/;

/**
 * A shared page's address in the view given: Announcements, a post on it, an
 * Important Date (the post itself for whoever cannot read Important Dates) and
 * Notifications. Any other address is returned as it is.
 */
export function viewAddress(path: string, view: { employeeView: boolean; readsDates: boolean }): string {
  const match = sharedPage.exec(path);
  if (!match) return path;
  const [, page = "", id = "", rest = ""] = match;
  if (page === "notifications") {
    if (id) return path;
    return (view.employeeView ? employeeNotificationsPath : managementNotificationsPath) + rest;
  }
  const base = view.employeeView
    ? employeeAnnouncementsPath
    : page.endsWith("important-dates") && view.readsDates
      ? `${managementAnnouncementsPath}/important-dates`
      : managementAnnouncementsPath;
  return base + id + rest;
}

function addressFor(context: ActiveWorkspaceContext, pathname: string, path: string): string {
  return viewAddress(path, {
    employeeView: employeeViewAt(context, pathname).employeeShell,
    readsDates: can(context, "settings.important_dates.read"),
  });
}

/** Where a link the app did not write itself (a notice's) goes from the page on screen. */
export function useViewAddress(): (path: string) => string {
  const { context } = useAuth();
  const { pathname } = useLocation();
  return useCallback((path: string) => (context ? addressFor(context, pathname, path) : path), [context, pathname]);
}

/**
 * A shared page's route: an address of the other view, or an Important Date
 * the person cannot read, moves to the person's own (a notice tapped with the
 * app closed, an old link). Somebody with both accesses stays where the address is.
 */
export function ViewAddressRoute({ children }: { readonly children: ReactNode }) {
  const { context } = useAuth();
  const { pathname, search, hash } = useLocation();
  if (!context) return null;
  const here = pathname + search + hash;
  const target = addressFor(context, pathname, here);
  return target === here ? children : <Navigate to={target} replace />;
}
