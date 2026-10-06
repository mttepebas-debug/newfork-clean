import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  emptyWeeklyPreference,
  type WeeklyPreferenceRead,
  type WeeklyPreferenceSave,
  type WeeklyPreferenceSettingsRead,
} from "@newfork/shared";
import { WeeklyPreferencesForm } from "./WeeklyPreferencesForm";
import { WeeklyPreferenceSettings } from "./WeeklyPreferenceSettings";
import { MemoryRouter } from "react-router";
import { PublishPreflightPanel } from "../schedule/components/PublishPreflightPanel";
import type { SchedulePublicationPreview } from "@newfork/shared/schedule";
import { PublishReturnPreview } from "../schedule/components/PublishReturn.preview";

const params = new URLSearchParams(location.search);
if (["preflight", "publish-return"].includes(params.get("view") ?? "")) void import("../styles.css");
if (params.get("var")) {
  void import("../dev/var-ekran-12.css");
  void import("../dev/varEkran12").then((module) => module.installVarAttributes());
}
const mode = params.get("mode") === "time" ? "time_range" : "shift_type";
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
// VAR-EKRAN-12 BL-441: one blocker and one risk, so the count reads "1 blocker · 1 risk".
if (params.get("var")?.includes("bl441")) {
  const base = { location_id: "ad420000-0000-4000-8000-000000000093", location_name: "Palo Alto extended dining room", scheduled_date: "2026-09-17" };
  preflight.findings.unshift(
    { ...base, id: "b".repeat(64), code: "double_booking", severity: "hard", overrideable: false, tier: "blocker", employee_name: "Burak Barkoren", employee_id: "ad420000-0000-4000-8000-000000000081", shift_ids: ["ad420000-0000-4000-8000-000000000061"], message: "Burak is on two shifts at the same time." },
    { ...base, id: "c".repeat(64), code: "clopening", severity: "soft", overrideable: true, tier: "risk", employee_name: "Carlos Garcia", employee_id: "ad420000-0000-4000-8000-000000000082", shift_ids: ["ad420000-0000-4000-8000-000000000062"], message: "Closes at 11:30 PM and opens at 7:00 AM the next day." },
  );
}
const employee = emptyWeeklyPreference(mode);
const reminder = emptyWeeklyPreference(mode);
employee.days[0]!.all_day = true;
reminder.days[0]!.all_day = true;
const shiftTypes = [
  "Lunch",
  "Dinner",
  "Late dinner",
  "Weekend extended service",
].map((name, index) => ({
  id: `ad420000-0000-4000-8000-00000000000${index + 1}`,
  name,
  start_time: ["11:00", "17:00", "21:00", "10:00"][index]!,
  end_time: ["16:00", "22:00", "02:00", "23:00"][index]!,
  archived: false,
  selectable: true,
}));
if (mode === "shift_type") {
  employee.days[5]!.shift_type_ids = [shiftTypes[1]!.id];
  reminder.days[6]!.shift_type_ids = [shiftTypes[2]!.id];
} else {
  employee.days[5]!.ranges = [{ start: "17:00", end: "22:00" }];
  reminder.days[6]!.ranges = [{ start: "09:00", end: "17:00" }];
}

function Preview() {
  const [settingsModel, setSettingsModel] = useState<WeeklyPreferenceSettingsRead>({
    settings: {
      input_mode: mode,
      onboarding_required: false,
      revision: 0,
    },
    can_edit: true,
    missing_shift_types: params.has("missing")
      ? [{ id: shiftTypes[0]!.id, name: "Lunch" }]
      : [],
  });
  const [model, setModel] = useState<WeeklyPreferenceRead>({
    employee_id: "ad420000-0000-4000-8000-000000000099",
    employee_name: "Ada Lovelace",
    can_edit_employee: true,
    can_manage: true,
    time_format: "24h",
    settings: {
      input_mode: mode,
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
    shift_types: shiftTypes,
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
                  input_mode: command.input_mode,
                  onboarding_required: command.onboarding_required,
                  revision: settingsModel.settings.revision + 1,
                },
              };
              setSettingsModel(next);
              return next;
            }}
          />
        </MemoryRouter>
      ) : (
        <WeeklyPreferencesForm
          model={model}
          audience={audience}
          onSave={save}
        />
      )}
    </main>
  );
}

// This separate dev entry has no API access and is not an application route.
if (import.meta.env.DEV)
  createRoot(document.getElementById("root")!).render(<Preview />);
