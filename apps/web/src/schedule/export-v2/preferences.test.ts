import { describe, expect, it, vi } from "vitest";
import { defaultExportPreferences, exportPreferencesKey, loadExportPreferences, saveExportPreferences } from "./preferences";

describe("export-only preferences", () => {
  it("isolates users and workspaces", () => {
    expect(new Set([exportPreferencesKey("u1", "w1"), exportPreferencesKey("u1", "w2"), exportPreferencesKey("u2", "w1")]).size).toBe(3);
  });
  it.each([null, "broken", '{"version":9}', '{"format":"csv"}'])("recovers invalid saved preferences: %s", value => {
    expect(loadExportPreferences({ getItem: () => value }, "key")).toEqual(defaultExportPreferences);
  });
  it("strips source/filter/schedule data rather than persisting it", () => {
    const setItem = vi.fn();
    saveExportPreferences({ setItem }, "key", { ...defaultExportPreferences, format: "xlsx", draftId: "private", filters: ["employee"], shifts: ["private"] } as typeof defaultExportPreferences);
    expect(JSON.parse(setItem.mock.calls[0]![1])).toEqual({ ...defaultExportPreferences, format: "xlsx" });
  });
  it("handles blocked storage on read", () => {
    expect(loadExportPreferences({ getItem: () => { throw new Error("Blocked"); } }, "key")).toEqual(defaultExportPreferences);
  });
});
