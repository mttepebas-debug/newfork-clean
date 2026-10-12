import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { appLandingPath } from "../auth/resolveLanding";
import { canOpenSettingsPage, type SettingsPage } from "./settings-access";

/**
 * A Settings page, opened by the same gate as its link in the Settings rail
 * (settings-access.ts). Somebody it does not open lands where they belong.
 */
export function SettingsPageRoute({
  children,
  page,
}: {
  readonly children: ReactNode;
  readonly page: SettingsPage;
}) {
  const { context } = useAuth();
  if (!canOpenSettingsPage(context, page))
    return <Navigate to={appLandingPath(context)} replace />;
  return children;
}
