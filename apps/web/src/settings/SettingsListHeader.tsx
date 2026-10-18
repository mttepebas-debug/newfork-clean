import type { ReactNode } from "react";
import { useListPhoneWidth } from "../lib/usePhoneWidth";
import { CatalogPageHeader } from "../views/CatalogPageHeader";
import { SettingsHeader } from "./GeneralSettingsPage";

/**
 * The heading of a Settings list page (Locations, Jobs, Shift catalog,
 * Documents). On a computer it is General's heading, at General's place and
 * size; a phone keeps the shared list heading (Mert 2026-10-18: "Yalnız
 * masaüstünde").
 */
export function SettingsListHeader({
  icon,
  title,
  titleId,
  description,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly titleId: string;
  readonly description: string;
}) {
  const phone = useListPhoneWidth();
  return phone ? (
    <CatalogPageHeader
      eyebrow="SETTINGS"
      title={title}
      titleId={titleId}
      description={description}
    />
  ) : (
    <SettingsHeader
      icon={icon}
      title={title}
      titleId={titleId}
      description={description}
    />
  );
}
