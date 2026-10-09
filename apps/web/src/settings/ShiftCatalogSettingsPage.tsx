import { useLocation } from "react-router";
import ShiftLabelsSettingsPage from "./ShiftLabelsSettingsPage";
import ShiftTypesSettingsPage from "./ShiftTypesSettingsPage";
import "./jobs-settings.css";

export default function ShiftCatalogSettingsPage() {
  const location = useLocation();
  const activeTab = location.pathname.endsWith("/shift-labels")
    ? "labels"
    : "types";

  return (
    <section
      className="settings-page jobs-settings-page shift-catalog-shell"
      aria-label="Shift catalog"
    >
      <div
        id="shift-catalog-panel"
        className="shift-catalog-panel"
        role="tabpanel"
        aria-labelledby={`shift-catalog-tab-${activeTab}`}
      >
        {activeTab === "types" ? (
          <ShiftTypesSettingsPage key="shift-types" />
        ) : (
          <ShiftLabelsSettingsPage key="shift-labels" />
        )}
      </div>
    </section>
  );
}
