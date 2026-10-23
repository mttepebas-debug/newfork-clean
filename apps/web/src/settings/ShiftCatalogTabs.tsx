import { tabLineRef } from "../shell/useTabSwipe";
import type { ReactNode } from "react";
import { CalendarClock } from "lucide-react";
import { SettingsListHeader } from "./SettingsListHeader";
import { useLocation, useNavigate } from "react-router";

type CatalogTab = "types" | "labels";

/** Shift catalog, design A (Mert 2026-10-12): one page in the shared list
 * language, Shift types and Shift labels as its tabs. */
export function ShiftCatalogHeader({ titleId }: { titleId: string }) {
  return (
    <SettingsListHeader
      icon={<CalendarClock size={21} aria-hidden />}
      title="Shift catalog"
      titleId={titleId}
      description="Shift types and labels used across the Schedule."
    />
  );
}

/** The tab row, with the filter row under it when the list is ready (the add button in it, KARARLAR S-253). */
export function ShiftCatalogToolbar({
  disabled = false,
  children,
}: {
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="job-catalog-toolbar catalog-toolbar">
      <div className="catalog-toolbar-status-row">
        <ShiftCatalogTabs disabled={disabled} />
      </div>
      {children}
    </div>
  );
}

export function ShiftCatalogTabs({ disabled = false }: { disabled?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: CatalogTab = location.pathname.endsWith("/shift-labels")
    ? "labels"
    : "types";
  const destination = (tab: CatalogTab) =>
    `/app/settings/scheduling/${tab === "types" ? "shift-types" : "shift-labels"}`;

  return (
    <div
      className="catalog-status-tabs"
      ref={tabLineRef}
      role="tablist"
      aria-label="Shift catalog sections"
      onKeyDown={(event) => {
        if (
          disabled ||
          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
        )
          return;
        event.preventDefault();
        const next =
          event.key === "Home"
            ? "types"
            : event.key === "End"
              ? "labels"
              : activeTab === "types"
                ? "labels"
                : "types";
        navigate(destination(next));
        requestAnimationFrame(() =>
          document.getElementById(`shift-catalog-tab-${next}`)?.focus(),
        );
      }}
    >
      <button
        type="button"
        role="tab"
        id="shift-catalog-tab-types"
        aria-controls="shift-catalog-panel"
        tabIndex={activeTab === "types" ? 0 : -1}
        disabled={disabled}
        aria-selected={activeTab === "types"}
        className={activeTab === "types" ? "active" : ""}
        onClick={() => navigate(destination("types"))}
      >
        Shift types
      </button>
      <button
        type="button"
        role="tab"
        id="shift-catalog-tab-labels"
        aria-controls="shift-catalog-panel"
        tabIndex={activeTab === "labels" ? 0 : -1}
        disabled={disabled}
        aria-selected={activeTab === "labels"}
        className={activeTab === "labels" ? "active" : ""}
        onClick={() => navigate(destination("labels"))}
      >
        Shift labels
      </button>
    </div>
  );
}
