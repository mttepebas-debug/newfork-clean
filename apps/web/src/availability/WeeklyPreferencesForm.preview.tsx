import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  emptyWeeklyPreference,
  type WeeklyPreferenceRead,
  type WeeklyPreferenceSave,
  type WeeklyPreferenceSettingsRead,
} from "@newfork/shared";
import { WeeklyPreferencesForm } from "./WeeklyPreferencesForm";
import { MyAvailabilityForm } from "./MyAvailabilityForm";
import { WeeklyPreferenceSettings } from "./WeeklyPreferenceSettings";
import { MemoryRouter } from "react-router";
import { PublishPreflightPanel } from "../schedule/components/PublishPreflightPanel";
import type { SchedulePublicationPreview } from "@newfork/shared/schedule";
import { PublishReturnPreview } from "../schedule/components/PublishReturn.preview";

const params = new URLSearchParams(location.search);
if (["preflight", "publish-return"].includes(params.get("view") ?? "")) void import("../styles.css");
const audience = params.get("view") === "employee" ? "employee" : "manager";
const preflight: SchedulePublicationPreview = {
  status: "override_required", workspace_id: "ad420000-0000-4000-8000-000000000091",
  draft_id: "ad420000-0000-4000-8000-000000000092", draft_revision: 1, week_start: "2026-09-14", fingerprint: "a".repeat(64), locations: [],
  findings: ["Ada Lovelace", "Alexandria Montgomery-Richardson", "Taylor Morgan"].map((name, index) => ({
    id: `${index}`.repeat(64), code: "availability", severity: "soft", overrideable: false,
    conflict_severity: "warn", tier: "note",
    employee_name: name, employee_id: `ad420000-0000-4000-8000-00000000008${index}`,
    location_id: "ad420000-0000-4000-8000-000000000093", location_name: "Palo Alto extended dining room",
    scheduled_date: "2026-09-18", shift_ids: [`ad420000-0000-4000-8000-00000000007${index}`],
    message: "This shift overlaps unavailable hours.",
  })),
};
const employee = emptyWeeklyPreference();
const reminder = emptyWeeklyPreference();
employee.days[0]!.all_day = true;
reminder.days[0]!.all_day = true;
employee.days[5]!.ranges = [{ start: "17:00", end: "22:00" }];
reminder.days[6]!.ranges = [{ start: "09:00", end: "17:00" }];

function Preview() {
  const [settingsModel, setSettingsModel] = useState<WeeklyPreferenceSettingsRead>({
    settings: {
      onboarding_required: false,
      revision: 0,
    },
    can_edit: true,
  });
  const [model, setModel] = useState<WeeklyPreferenceRead>({
    employee_id: "ad420000-0000-4000-8000-000000000099",
    employee_name: "Ada Lovelace",
    can_edit_employee: true,
    can_manage: true,
    time_format: "24h",
    settings: {
      onboarding_required: false,
      revision: 1,
    },
    employee: {
      submitted: true,
      revision: 1,
      updated_at: null,
      preference: employee,
    },
    manager: {
      submitted: true,
      revision: 1,
      updated_at: null,
      preference: reminder,
      enabled: true,
      notes: [
        "",
        "",
        "",
        "",
        "",
        "",
        "Confirm the closing shift before publishing.",
      ],
    },
    shift_types: [],
  });
  async function save(command: WeeklyPreferenceSave) {
    const next = structuredClone(model);
    const record = command.source === "manager" ? next.manager! : next.employee;
    record.preference = command.preference;
    record.revision += 1;
    record.submitted = true;
    if (command.source === "manager") {
      next.manager!.enabled = command.enabled!;
      next.manager!.notes = command.notes!;
    }
    setModel(next);
    return next;
  }
  if (params.get("view") === "publish-return") return <PublishReturnPreview preview={preflight} />;
  return (
    <main
      style={{
        maxWidth: audience === "manager" ? 760 : 1000,
        margin: "24px auto",
        border: "1px solid #e1e7e3",
      }}
    >
      {params.get("view") === "preflight" ? (
        <div style={{ padding: 16 }}><PublishPreflightPanel preview={preflight} locations={[]} /></div>
      ) : params.get("view") === "settings" ? (
        <MemoryRouter>
          <WeeklyPreferenceSettings
            model={settingsModel}
            onReload={async () => settingsModel}
            onSave={async (command) => {
              const next = {
                ...settingsModel,
                settings: {
                  onboarding_required: command.onboarding_required,
                  revision: settingsModel.settings.revision + 1,
                },
              };
              setSettingsModel(next);
              return next;
            }}
          />
        </MemoryRouter>
      ) : audience === "employee" ? (
        <MyAvailabilityForm model={model} onSave={save} wizard={params.has("onboarding")} />
      ) : (
        <WeeklyPreferencesForm model={model} audience="manager" onSave={save} />
      )}
    </main>
  );
}

// This separate dev entry has no API access and is not an application route.
if (import.meta.env.DEV)
  createRoot(document.getElementById("root")!).render(<Preview />);
