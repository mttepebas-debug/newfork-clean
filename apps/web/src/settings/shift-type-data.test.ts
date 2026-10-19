import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveShiftType } from "./organization-data";
const storage = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabaseClient: storage }));
const values = { name: "Lunch", color: "#123456", default_start_time: "12:00", default_end_time: "16:00" };
const chain = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn(), insert: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks(); storage.from.mockReturnValue(chain);
  chain.update.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.select.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue({ data: { id: "type" }, error: null });
  chain.insert.mockResolvedValue({ error: null });
});
describe("shift type clock revision guard", () => {
  it("updates only the matching workspace, type and reviewed default revision", async () => {
    await saveShiftType("workspace", values, "type", 4);
    expect(chain.eq.mock.calls).toEqual([["id", "type"], ["workspace_id", "workspace"], ["default_revision", 4]]);
    expect(chain.select).toHaveBeenCalledWith("id");
  });
  it("fails a stale or inaccessible update without an unguarded retry", async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(saveShiftType("workspace", values, "type", 4)).rejects.toThrow("Reload the latest defaults");
    expect(chain.update).toHaveBeenCalledOnce();
  });
  it("refuses updates without a known positive revision", async () => {
    for (const revision of [undefined, 0, 1.5]) await expect(saveShiftType("workspace", values, "type", revision)).rejects.toThrow("Reload this shift type");
    expect(storage.from).not.toHaveBeenCalled();
  });
  it("allows creation without a prior revision and surfaces storage failures", async () => {
    await saveShiftType("workspace", values);
    expect(chain.insert).toHaveBeenCalledWith({ ...values, time_options: [], workspace_id: "workspace" });
    chain.maybeSingle.mockResolvedValue({ data: null, error: { message: "Access denied" } });
    await expect(saveShiftType("workspace", values, "type", 4)).rejects.toThrow("Access denied");
  });
});
