import { useLocation, useNavigate } from "react-router";

type CatalogTab = "types" | "labels";

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
      className="shift-catalog-tabs requests-tabs"
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
