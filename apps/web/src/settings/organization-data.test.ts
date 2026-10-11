import { beforeEach, describe, expect, it, vi } from "vitest";

// One write's answer, whatever chain of filters the call builds.
const answer = vi.hoisted(() => ({ current: { data: null as unknown, error: null as unknown } }));
vi.mock("../lib/supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const step of ["from", "insert", "update", "eq", "select"]) chain[step] = () => chain;
  chain.maybeSingle = async () => answer.current;
  chain.then = (resolve: (value: unknown) => unknown) => resolve(answer.current);
  return { supabaseClient: chain, apiRequest: vi.fn() };
});

import {
  saveShiftLabel,
  saveShiftType,
  setShiftLabelArchived,
  setShiftTypeArchived,
  updateOrganizationName,
} from "./organization-data";

const duplicate = (index: string) => ({
  code: "23505",
  message: `duplicate key value violates unique constraint "${index}"`,
});
const shiftType = { name: "Dinner", color: "#123456", default_start_time: "16:00", default_end_time: "22:00" };

// BL-1009: a second active shift type or label with the same name read as the
// raw Postgres sentence.
describe("Settings → Shift catalog: a name already in use", () => {
  beforeEach(() => {
    answer.current = { data: null, error: null };
  });

  it("says a shift type name is taken, on add, rename and restore", async () => {
    answer.current = { data: null, error: duplicate("shift_types_workspace_active_name_idx") };
    const taken = "A shift type with this name already exists. Choose another name.";
    await expect(saveShiftType("w", shiftType)).rejects.toThrow(taken);
    await expect(saveShiftType("w", shiftType, "id", 1)).rejects.toThrow(taken);
    await expect(setShiftTypeArchived("w", "id", false)).rejects.toThrow(taken);
  });

  it("says a label name is taken, on add, rename and restore", async () => {
    answer.current = { data: null, error: duplicate("shift_labels_workspace_active_name_idx") };
    const taken = "A label with this name already exists. Choose another name.";
    await expect(saveShiftLabel("w", { name: "VIP", color: "#123456" })).rejects.toThrow(taken);
    await expect(saveShiftLabel("w", { name: "VIP", color: "#123456" }, "id")).rejects.toThrow(taken);
    await expect(setShiftLabelArchived("w", "id", false)).rejects.toThrow(taken);
  });
});

// BL-913: a write RLS refuses changes no row and still answers 204; the
// screen said "Organization settings saved." while the name stayed.
describe("Settings → General: workspace name", () => {
  it("fails when no row changed", async () => {
    answer.current = { data: [], error: null };
    await expect(updateOrganizationName("w", "Meyhouse")).rejects.toThrow(
      "The workspace name wasn't saved: your role can't change it.",
    );
  });

  it("resolves when the row changed", async () => {
    answer.current = { data: [{ id: "w" }], error: null };
    await expect(updateOrganizationName("w", "Meyhouse")).resolves.toBeUndefined();
  });
});
