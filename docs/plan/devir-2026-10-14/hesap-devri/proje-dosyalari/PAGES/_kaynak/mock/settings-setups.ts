// PAGES: the Settings pages' named demo-data changes (tools/sc/50-ayarlar.py).
// Each runs on freshly seeded data before the app starts, in both frames.
// Flags here are read by the settings mocks (settings-catalog.ts,
// settings-service.ts) for states the seed alone cannot reach.
import { persist, world, DEPT, LOC, type Employee } from "./world";
import { settings, ROLE } from "./settings-store";
import type { Permission } from "@newfork/shared";

/** Answers the settings mocks change for one scenario. */
export const settingsFlags = {
  /** RLS changes no row on the workspace name (the role lost the right while the page was open). */
  nameRefused: false,
  /** One employee in the job drawer is outside what the viewer may change. */
  lockedEmployee: false,
  /** Someone else deletes the location being changed, just before the change lands. */
  locationGone: false,
};

/** The seeded schedule logo's storage path; workspaceIdentity() serves SEED_LOGO_URL for it. */
export const SEED_LOGO_PATH = "seed/harbor-vine-logo.svg";
export const SEED_LOGO_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><rect width="240" height="120" rx="14" fill="#1f5f4f"/>` +
  `<circle cx="58" cy="60" r="34" fill="#f4d6a0"/><path d="M44 44v32M72 44v32M44 60h28" stroke="#1f5f4f" stroke-width="7" stroke-linecap="round"/>` +
  `<text x="104" y="56" font-family="Georgia, serif" font-size="26" fill="#fff">Harbor</text>` +
  `<text x="104" y="86" font-family="Georgia, serif" font-size="26" fill="#f4d6a0">&amp; Vine</text></svg>`,
)}`;

const id = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
type Loose = Record<string, unknown>;

/** Every row of a catalog table soft-deleted (the page reads only live rows). */
function emptyTable(rows: Loose[]): void {
  const stamp = new Date().toISOString();
  for (const row of rows) Object.assign(row, { deleted_at: stamp, archived_at: stamp });
}

export const settingsSetups: Record<string, () => void> = {
  // General: a logo was uploaded earlier.
  "settings-logo": () => {
    Object.assign(settings.data.workspace, {
      logo_storage_path: SEED_LOGO_PATH, logo_file_name: "harbor-vine-logo.svg", logo_updated_at: ago(12),
      schedule_logo_scale: 1, schedule_logo_offset_x: 0, schedule_logo_offset_y: 0,
    });
    settings.save();
  },
  "settings-name-refused": () => { settingsFlags.nameRefused = true; },

  // Locations, Jobs, Shift labels: archived rows and a job outside every department.
  "settings-archived": () => {
    (world.locations as unknown as Loose[]).push({
      id: id(0x103), name: "Harbor & Vine Seaport", short_name: "SEAP", color: "#F59E0B", timezone: "America/New_York", sort_order: 2,
      phone: "+16175550190", street_address: "60 Seaport Boulevard", city: "Boston", region: "MA", postal_code: "02210", country_code: "US",
      archived_at: ago(45),
    });
    (world.departments as unknown as Loose[]).push({ id: id(0x205), name: "Catering", color: "#0D9488", system_key: null, archived_at: ago(60) });
    (world.jobs as unknown as Loose[]).push(
      { id: id(0x320), department_id: id(0x205), name: "Event Server", color: "#14B8A6", system_key: null, archived_at: ago(60) },
      { id: id(0x321), department_id: DEPT.bar, name: "Sommelier", color: "#A78BFA", system_key: null, archived_at: ago(30) },
      { id: id(0x322), department_id: null, name: "Expo", color: "#F97316", system_key: null },
    );
    (world.shift_labels as unknown as Loose[]).push({ id: id(0x505), name: "Patio", color: "#22C55E", sort_order: 4, archived_at: ago(20) });
    persist();
  },
  "settings-location-gone": () => { settingsFlags.locationGone = true; },
  // Schedule rules: one shift type was saved without default hours.
  "settings-shift-type-no-hours": () => {
    const close = world.shift_types.find((type) => type.name === "Close");
    if (close) Object.assign(close, { default_start_time: null, default_end_time: null });
    persist();
  },
  "settings-no-locations": () => { emptyTable(world.locations as unknown as Loose[]); persist(); },
  "settings-no-jobs": () => {
    emptyTable(world.departments as unknown as Loose[]);
    emptyTable(world.jobs as unknown as Loose[]);
    persist();
  },
  "settings-no-labels": () => { emptyTable(world.shift_labels as unknown as Loose[]); persist(); },

  // Jobs: more than one page of people in the job drawer, and one the viewer may not change.
  "settings-many-employees": () => {
    const first = ["Ava", "Liam", "Mia", "Lucas", "Zoe", "Owen", "Ella", "Ryan", "Nora", "Caleb"];
    const last = ["Bennett", "Foster", "Hayes", "Price", "Sullivan", "Ward"];
    for (let n = 0; n < 40; n += 1) {
      const employee: Employee = {
        id: id(0x700 + n), employee_code: `HV-${String(17 + n).padStart(3, "0")}`,
        display_name: `${first[n % first.length]} ${last[Math.floor(n / first.length) % last.length]}`,
        location_ids: [n % 2 ? LOC.uptown : LOC.downtown], job_ids: [], primary_job_id: "", unavailable: [],
      };
      world.employees.push(employee);
    }
    persist();
  },
  "settings-locked-employee": () => { settingsFlags.lockedEmployee = true; },

  // Notifications: nothing changed yet.
  "settings-no-audit": () => { settings.data.notification_audit = []; settings.save(); },

  // Roles: more custom roles than fit as tabs.
  "settings-many-roles": () => {
    const base: Permission[] = ["workspace.read", "schedule.read", "announcements.read", "notifications.read", "notifications.read_own", "notifications.preferences.write_own"];
    const extra = [
      ["Host Lead", "Seats guests and keeps the host stand schedule.", 3, ["employees.read"]],
      ["Bar Lead", "Runs the bar on nights without a manager.", 2, ["employees.read", "schedule.manage"]],
      ["Trainer", "Trains new hires on their first shifts.", 1, ["employees.read", "employee_onboarding.review"]],
    ] as const;
    extra.forEach(([name, description, members, keys], index) => {
      settings.data.roles.push({
        id: id(0xc07 + index), name, description, system_key: null, access_class: "manager", sort_order: 100,
        created_at: ago(40), updated_at: ago(10 - index), member_count: members, pending_invite_count: 0,
        permission_keys: [...base, ...keys].sort() as Permission[],
      });
    });
    settings.save();
  },

  // Documents and Acknowledgements: nothing set up yet.
  "settings-no-documents": () => { settings.data.document_types = []; settings.save(); },
  "settings-no-retention": () => { settings.data.retention_policies = []; settings.save(); },
  "settings-no-templates": () => {
    settings.data.signature_templates = [];
    settings.data.signature_versions = [];
    settings.save();
  },

  // Acknowledgements: the Handbook draft points at the Massachusetts policy, which is still a draft.
  "settings-draft-policy": () => {
    const draft = settings.data.signature_versions.find((version) => version.id === id(0xe22));
    if (draft) draft.retention_policy_id = id(0xe02);
    settings.save();
  },

  // Support: the browser lets the page write to the clipboard, or refuses.
  "settings-clipboard-ok": () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } });
  },
  "settings-clipboard-blocked": () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new DOMException("Write permission denied.", "NotAllowedError"); } },
    });
  },
};

export { ROLE };
