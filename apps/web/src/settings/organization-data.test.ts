import { beforeEach, describe, expect, it, vi } from "vitest";

// One write's answer, whatever chain of filters the call builds.
const answer = vi.hoisted(() => ({ current: { data: null as unknown, error: null as unknown } }));
// `.single()` answers from this queue first (the logo read, then its write).
const singles = vi.hoisted(() => [] as { data: unknown; error: unknown }[]);
const storage = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
}));
vi.mock("../lib/supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const step of ["from", "insert", "update", "eq", "select"]) chain[step] = () => chain;
  chain.maybeSingle = async () => answer.current;
  chain.single = async () => singles.shift() ?? answer.current;
  chain.then = (resolve: (value: unknown) => unknown) => resolve(answer.current);
  chain.storage = { from: () => storage };
  return { supabaseClient: chain, apiRequest: vi.fn() };
});

import {
  saveScheduleLogo,
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

// BL-912: a logo uploaded but never written to the workspace was left behind
// in storage with nothing pointing at it.
describe("Schedule logo upload", () => {
  it("removes the uploaded file when the workspace write fails", async () => {
    storage.upload.mockResolvedValue({ data: {}, error: null });
    storage.remove.mockResolvedValue({ data: [], error: null });
    singles.push(
      { data: { logo_storage_path: null }, error: null },
      { data: null, error: { code: "42501", message: "permission denied" } },
      { data: logoRow(null), error: null },
    );
    const file = new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });
    await expect(
      saveScheduleLogo("w", {
        file,
        removeLogo: false,
        placement: { scale: 1, offset_x: 0, offset_y: 0 },
      }),
    ).rejects.toThrow();
    const uploaded = storage.upload.mock.calls[0]![0] as string;
    expect(storage.remove).toHaveBeenCalledWith([uploaded]);
  });
});

// BL-1033: the write can land and its answer still never arrive. The file
// was taken back out while the workspace pointed at it: a broken logo.
describe("Schedule logo: the save's answer is lost", () => {
  const workspaceId = "6f1c2b8e-0d4e-4a51-9b7a-1f2e3d4c5b6a";
  const uuid = "0b9e7d3c-2a14-4f6e-8c51-7d2e9a0f1b3c";
  const newPath = `${workspaceId}/logo/${uuid}.svg`;
  const oldPath = `${workspaceId}/logo/old.png`;
  const lost = { data: null, error: { code: "", message: "TypeError: Failed to fetch" } };
  const placement = { scale: 1, offset_x: 0, offset_y: 0 };
  const file = () => new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });

  beforeEach(() => {
    singles.length = 0;
    answer.current = { data: null, error: null };
    storage.upload.mockReset().mockResolvedValue({ data: {}, error: null });
    storage.remove.mockReset().mockResolvedValue({ data: [], error: null });
    vi.spyOn(crypto, "randomUUID").mockReturnValue(uuid);
  });

  it("keeps the new logo the workspace already points at", async () => {
    singles.push({ data: logoRow(oldPath, workspaceId), error: null }, lost, {
      data: logoRow(newPath, workspaceId),
      error: null,
    });
    const saved = await saveScheduleLogo(workspaceId, { file: file(), removeLogo: false, placement });
    expect(saved.logo_url).toBe(`https://cdn.test/${newPath}`);
    expect(storage.remove).not.toHaveBeenCalledWith([newPath]);
    expect(storage.remove).toHaveBeenCalledWith([oldPath]);
  });

  it("keeps the new file when the workspace cannot be asked", async () => {
    singles.push({ data: logoRow(oldPath, workspaceId), error: null }, lost, lost);
    await expect(
      saveScheduleLogo(workspaceId, { file: file(), removeLogo: false, placement }),
    ).rejects.toThrow("Failed to fetch");
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("keeps the logo file when Remove logo is refused", async () => {
    singles.push(
      { data: logoRow(oldPath, workspaceId), error: null },
      { data: null, error: { code: "42501", message: "permission denied" } },
      { data: logoRow(oldPath, workspaceId), error: null },
    );
    await expect(
      saveScheduleLogo(workspaceId, { file: null, removeLogo: true, placement }),
    ).rejects.toThrow();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("removes the logo file once Remove logo landed, even with its answer lost", async () => {
    singles.push({ data: logoRow(oldPath, workspaceId), error: null }, lost, {
      data: logoRow(null, workspaceId),
      error: null,
    });
    const saved = await saveScheduleLogo(workspaceId, { file: null, removeLogo: true, placement });
    expect(saved.logo_url).toBeNull();
    expect(storage.remove).toHaveBeenCalledWith([oldPath]);
  });
});

function logoRow(path: string | null, id = "6f1c2b8e-0d4e-4a51-9b7a-1f2e3d4c5b6a") {
  return {
    id,
    name: "Sunset Tacos",
    logo_storage_path: path,
    logo_file_name: path ? "logo.svg" : null,
    logo_updated_at: path ? "2026-10-11T20:00:00.000Z" : null,
    schedule_logo_scale: 1,
    schedule_logo_offset_x: 0,
    schedule_logo_offset_y: 0,
  };
}
