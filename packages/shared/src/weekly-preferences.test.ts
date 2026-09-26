import { describe, expect, it } from "vitest";
import {
  emptyWeeklyPreference,
  preferenceIsEmpty,
  weeklyPreferenceReadSchema,
  weeklyPreferenceSaveSchema,
  weeklyPreferenceSchema,
} from "./weekly-preferences";

const employee = "ab910000-0000-4000-8000-000000000001";
const type = "ab920000-0000-4000-8000-000000000001";

describe("weekly unavailable preference contract", () => {
  it("starts available on seven distinct weekdays in either mode", () => {
    for (const mode of ["shift_type", "time_range"] as const) {
      const preference = emptyWeeklyPreference(mode);
      expect(weeklyPreferenceSchema.safeParse(preference).success).toBe(true);
      expect(preferenceIsEmpty(preference)).toBe(true);
      expect(new Set(preference.days.map((day) => day.day)).size).toBe(7);
    }
  });

  it.each([
    ["00:00", "24:00", true],
    ["23:59", "24:00", true],
    ["09:00", "17:00", true],
    ["17:00", "09:00", false],
    ["09:00", "09:00", false],
    ["24:00", "24:00", false],
    ["09:60", "17:00", false],
    ["", "17:00", false],
  ])("validates the same-day range %s to %s", (start, end, valid) => {
    const preference = emptyWeeklyPreference("time_range");
    preference.days[1]!.range = { start, end };
    expect(weeklyPreferenceSchema.safeParse(preference).success).toBe(valid);
  });

  it("rejects duplicate days and selections, mixed modes and all-day detail", () => {
    const preference = emptyWeeklyPreference("shift_type");
    preference.days[1]!.shift_type_ids = [type, type];
    expect(weeklyPreferenceSchema.safeParse(preference).success).toBe(false);
    preference.days[1]!.shift_type_ids = [type];
    expect(weeklyPreferenceSchema.safeParse(preference).success).toBe(true);
    preference.days[1]!.all_day = true;
    expect(weeklyPreferenceSchema.safeParse(preference).success).toBe(false);
    preference.days[1]!.all_day = false;
    preference.input_mode = "time_range";
    expect(weeklyPreferenceSchema.safeParse(preference).success).toBe(false);
    preference.days[1]!.shift_type_ids = [];
    preference.days[1]!.day = 0;
    expect(weeklyPreferenceSchema.safeParse(preference).success).toBe(false);
  });

  it("does not accept reminder fields in employee commands", () => {
    const command = {
      employee_id: employee,
      source: "employee",
      expected_revision: 0,
      settings_revision: 1,
      preference: emptyWeeklyPreference("time_range"),
    };
    expect(weeklyPreferenceSaveSchema.safeParse(command).success).toBe(true);
    expect(
      weeklyPreferenceSaveSchema.safeParse({ ...command, enabled: false })
        .success,
    ).toBe(false);
    expect(
      weeklyPreferenceSaveSchema.safeParse({
        ...command,
        notes: Array(7).fill(""),
      }).success,
    ).toBe(false);
    expect(
      weeklyPreferenceSaveSchema.safeParse({ ...command, source: "manager" })
        .success,
    ).toBe(false);
    expect(
      weeklyPreferenceSaveSchema.safeParse({
        ...command,
        source: "manager",
        enabled: true,
        notes: Array(7).fill(""),
      }).success,
    ).toBe(true);
  });
  it("keeps exact employee copying exclusive to manager commands", () => {
    const command = {
      employee_id: employee,
      source: "manager",
      expected_revision: 0,
      settings_revision: 1,
      preference: emptyWeeklyPreference("time_range"),
      enabled: true,
      notes: Array(7).fill(""),
      copy_employee_revision: 1,
    };
    expect(weeklyPreferenceSaveSchema.safeParse(command).success).toBe(true);
    expect(
      weeklyPreferenceSaveSchema.safeParse({
        ...command,
        copy_employee_revision: 0,
      }).success,
    ).toBe(false);
    expect(
      weeklyPreferenceSaveSchema.safeParse({
        ...command,
        source: "employee",
        enabled: undefined,
        notes: undefined,
      }).success,
    ).toBe(false);
  });
  it("requires unique employee-owned decisions with a real preview fingerprint", () => {
    const choice = {
      kind: "exchange_application",
      id: type,
      fingerprint: "a".repeat(64),
      action: "keep",
    };
    const command = {
      employee_id: employee,
      source: "employee",
      expected_revision: 0,
      settings_revision: 1,
      preference: emptyWeeklyPreference("time_range"),
      decisions: [choice],
    };
    expect(weeklyPreferenceSaveSchema.safeParse(command).success).toBe(true);
    expect(
      weeklyPreferenceSaveSchema.safeParse({
        ...command,
        decisions: [choice, choice],
      }).success,
    ).toBe(false);
    expect(
      weeklyPreferenceSaveSchema.safeParse({
        ...command,
        decisions: [{ ...choice, fingerprint: "stale" }],
      }).success,
    ).toBe(false);
    expect(
      weeklyPreferenceSaveSchema.safeParse({
        ...command,
        source: "manager",
        enabled: true,
        notes: Array(7).fill(""),
      }).success,
    ).toBe(false);
  });
});

describe("weekly preference read: the manager note in three shapes (BL-139)", () => {
  const record = { revision: 1, submitted: true, updated_at: null, preference: emptyWeeklyPreference("shift_type") };
  const read = {
    employee_id: employee, employee_name: "Ada Lovelace", can_edit_employee: true, can_manage: true,
    settings: { input_mode: "shift_type", onboarding_required: false, revision: 1 },
    employee: record, shift_types: [], time_format: "12h",
  };
  it("keeps a note the reader may see, a null for an employee target, and no field for a manager+ target", () => {
    const note = { ...record, enabled: true, notes: Array<string>(7).fill("") };
    expect(weeklyPreferenceReadSchema.parse({ ...read, manager: note }).manager).toMatchObject({ enabled: true });
    expect(weeklyPreferenceReadSchema.parse({ ...read, manager: null }).manager).toBeNull();
    const omitted = weeklyPreferenceReadSchema.safeParse(read);
    expect(omitted.success).toBe(true);
    expect(omitted.success && "manager" in omitted.data).toBe(false);
  });
});
