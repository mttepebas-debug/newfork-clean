import { describe, expect, it } from "vitest";
import {
  emptyWeeklyPreference,
  preferenceIsEmpty,
  weeklyPreferenceMutationSchema,
  weeklyPreferenceReadSchema,
  weeklyPreferenceSaveSchema,
  weeklyPreferenceSchema,
  weeklyPreferenceSettingsReadSchema,
  weeklyTeamReadSchema,
} from "./weekly-preferences";

const employee = "ab910000-0000-4000-8000-000000000001";
const type = "ab920000-0000-4000-8000-000000000001";

describe("weekly unavailable preference contract", () => {
  it("starts available on seven distinct weekdays, hours only", () => {
    const preference = emptyWeeklyPreference();
    expect(weeklyPreferenceSchema.safeParse(preference).success).toBe(true);
    expect(preferenceIsEmpty(preference)).toBe(true);
    expect(new Set(preference.days.map((day) => day.day)).size).toBe(7);
    // Mert 2026-10-16 ("yalnız saat"): no entry mode, no shift types.
    expect(preference).toEqual({
      days: Array.from({ length: 7 }, (_, day) => ({ day, all_day: false, ranges: [] })),
    });
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
    const preference = emptyWeeklyPreference();
    preference.days[1]!.ranges = [{ start, end }];
    expect(weeklyPreferenceSchema.safeParse(preference).success).toBe(valid);
  });

  it("takes no range beside all day", () => {
    const preference = emptyWeeklyPreference();
    preference.days[0]!.ranges = [{ start: "09:00", end: "10:00" }];
    expect(weeklyPreferenceSchema.safeParse(preference).success).toBe(true);
    preference.days[0]!.all_day = true;
    expect(weeklyPreferenceSchema.safeParse(preference).success).toBe(false);
  });

  // Mert 2026-10-16 ("kural da 1'e insin"): one time range a day, in a save
  // and in what the database holds (weekly_preference_valid says the same).
  it("keeps one time range a day, saved or read", () => {
    const preference = emptyWeeklyPreference();
    const command = {
      employee_id: employee,
      source: "employee" as const,
      expected_revision: 0,
      settings_revision: 1,
      preference,
    };
    preference.days[2]!.ranges = [{ start: "17:00", end: "24:00" }];
    expect(weeklyPreferenceSaveSchema.safeParse(command).success).toBe(true);
    preference.days[2]!.ranges = [
      { start: "09:00", end: "12:00" },
      { start: "17:00", end: "24:00" },
    ];
    const refused = weeklyPreferenceSaveSchema.safeParse(command);
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.message).toBe("Keep one time range on Tuesday.");
    expect(weeklyPreferenceSchema.safeParse(preference).success).toBe(false);
  });

  it("has no single range any more", () => {
    const preference = { ...emptyWeeklyPreference() };
    expect(preference.days.every((day) => !("range" in day) && day.ranges.length === 0)).toBe(true);
  });

  it("rejects duplicate days", () => {
    const preference = emptyWeeklyPreference();
    preference.days[1]!.day = 0;
    expect(weeklyPreferenceSchema.safeParse(preference).success).toBe(false);
  });

  it("carries no entry mode or shift types", () => {
    const parsed = weeklyPreferenceSchema.parse({
      ...emptyWeeklyPreference(),
      input_mode: "shift_type",
    });
    expect("input_mode" in parsed).toBe(false);
    expect(parsed.days.every((day) => !("shift_type_ids" in day))).toBe(true);
  });

  it("does not accept reminder fields in employee commands", () => {
    const command = {
      employee_id: employee,
      source: "employee",
      expected_revision: 0,
      settings_revision: 1,
      preference: emptyWeeklyPreference(),
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
      preference: emptyWeeklyPreference(),
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
  // M5: saving a week decides nothing about pending requests.
  it("sends no decisions with a save", () => {
    const command = {
      employee_id: employee,
      source: "employee",
      expected_revision: 0,
      settings_revision: 1,
      preference: emptyWeeklyPreference(),
      decisions: [{ kind: "exchange_application", id: type, fingerprint: "a".repeat(64), action: "keep" }],
    };
    const parsed = weeklyPreferenceSaveSchema.parse(command);
    expect("decisions" in parsed).toBe(false);
  });
});

describe("weekly preference read: the manager note in three shapes (BL-139)", () => {
  const record = { revision: 1, submitted: true, updated_at: null, preference: emptyWeeklyPreference() };
  const read = {
    employee_id: employee, employee_name: "Ada Lovelace", can_edit_employee: true, can_manage: true,
    settings: { onboarding_required: false, revision: 1 },
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

describe("the team's availability page data (AVAIL-GUN-DB)", () => {
  const person = {
    id: employee, display_name: "Ada Lovelace", employee_code: "E-1", location_ids: [],
    submitted: true, preference: emptyWeeklyPreference(), can_open: true,
  };
  it("names each person's job and when their week was last saved", () => {
    const parsed = weeklyTeamReadSchema.parse({
      locations: [], time_format: "12h",
      employees: [
        { ...person, job_name: "Server", updated_at: "2035-01-02T03:04:05+00:00" },
        { ...person, job_name: null, updated_at: null, submitted: false },
      ],
    });
    expect(parsed.employees.map((e) => [e.job_name, e.updated_at])).toEqual([
      ["Server", "2035-01-02T03:04:05+00:00"],
      [null, null],
    ]);
    expect("shift_types" in parsed).toBe(false);
  });
  it("needs both fields", () => {
    expect(weeklyTeamReadSchema.safeParse({ locations: [], time_format: "12h", employees: [person] }).success).toBe(false);
  });
});

describe("availability settings (AVAIL-GUN-DB)", () => {
  it("are whether onboarding asks, and nothing else", () => {
    const parsed = weeklyPreferenceSettingsReadSchema.parse({
      settings: { onboarding_required: true, revision: 3, input_mode: "time_range" },
      can_edit: true,
      missing_shift_types: [],
    });
    expect(parsed).toEqual({ settings: { onboarding_required: true, revision: 3 }, can_edit: true });
  });
});

describe("weekly preference save answer (M5)", () => {
  it("is the model alone", () => {
    const model = {
      employee_id: employee, employee_name: "Ada Lovelace", can_edit_employee: true, can_manage: false,
      settings: { onboarding_required: false, revision: 1 },
      employee: { revision: 2, submitted: true, updated_at: null, preference: emptyWeeklyPreference() },
      shift_types: [], time_format: "12h",
    };
    const parsed = weeklyPreferenceMutationSchema.parse({ model, kept_count: 0 });
    expect(Object.keys(parsed)).toEqual(["model"]);
  });
});
