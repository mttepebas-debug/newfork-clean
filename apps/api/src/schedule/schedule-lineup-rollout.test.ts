import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScheduleLineupService } from "./schedule-lineup-service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), enabled: false }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: mocks.rpc,
    from: () => {
      throw new Error(
        "Direct table access must not be used by the rollout guard",
      );
    },
  }),
}));

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.enabled = false;
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "Line Up is read-only at this location" },
  });
});
describe("Line Up location rollout", () => {
  const service = createScheduleLineupService({
    url: "http://local.test",
    serviceRoleKey: "test",
  });
  const actor = { actorUserId: "actor", workspaceId: "workspace" };
  it("saves a single placement through the guard RPC without reading restricted tables", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { enabled: true }, error: null })
      .mockResolvedValueOnce({
        data: {
          status: "saved",
          entry_id: "10000000-0000-4000-8000-000000000001",
          lineup_id: "10000000-0000-4000-8000-000000000002",
          entry_revision: 2,
          lineup_revision: 3,
        },
        error: null,
      });
    const result = await service.saveEntry({
      ...actor,
      locationId: "location",
      date: "2030-01-07",
      entryId: null,
      expectedRevision: null,
      entry: {
        source_shift_id: null,
        employee_id: null,
        job_id: null,
        shift_type_id: null,
        start_time: "17:00",
        end_time: "23:00",
        section_id: null,
        station: "",
        hidden: false,
        call_off: false,
        display_order: 0,
      },
    });
    expect(result.entry_revision).toBe(2);
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      "lineup_operations_service",
      expect.objectContaining({
        action: "guard",
        actor_user_id: "actor",
        payload: {
          location_ids: ["location"],
          permission: "schedule.lineup.manage",
        },
      }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "upsert_schedule_lineup_entry_service",
      expect.objectContaining({
        actor_user_id: "actor",
        target_location_id: "location",
      }),
    );
  });
  it("prevents a new snapshot at a read-only location", async () => {
    await expect(
      service.share({
        ...actor,
        date: "2030-01-07",
        locationIds: ["location"],
        fingerprint: "a".repeat(64),
      }),
    ).rejects.toThrow("read-only");
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "lineup_operations_service",
      expect.objectContaining({
        actor_user_id: "actor",
        target_workspace_id: "workspace",
        action: "guard",
      }),
    );
  });
  it("blocks legacy entry deletion using the entry's actual location", async () => {
    await expect(
      service.deleteEntry({ ...actor, entryId: "entry", expectedRevision: 1 }),
    ).rejects.toThrow("read-only");
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "lineup_operations_service",
      expect.objectContaining({
        actor_user_id: "actor",
        target_workspace_id: "workspace",
        action: "guard",
      }),
    );
  });
  it("blocks workspace-wide notes when they would change a read-only location", async () => {
    await expect(
      service.operations!({
        ...actor,
        action: "note",
        payload: { note: { location_id: null } },
      }),
    ).rejects.toThrow("read-only");
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "lineup_operations_service",
      expect.objectContaining({
        actor_user_id: "actor",
        target_workspace_id: "workspace",
        action: "guard",
      }),
    );
  });
});
