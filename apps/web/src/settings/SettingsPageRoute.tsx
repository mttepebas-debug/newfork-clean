import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { NoAccessRoute } from "../shell/NoAccessState";
import { canOpenSettingsPage, type SettingsPage } from "./settings-access";

/**
 * A Settings page, opened by the same gate as its link in the Settings rail
 * (settings-access.ts). Somebody it does not open sees the no-access card in
 * its place (Mert 2026-10-14: "kart çıksın").
 */
export function SettingsPageRoute({
  children,
  page,
}: {
  readonly children: ReactNode;
  readonly page: SettingsPage;
}) {
  const { context } = useAuth();
  if (!canOpenSettingsPage(context, page)) return <NoAccessRoute />;
  return children;
}
