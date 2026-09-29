import { describe, expect, it, vi } from "vitest";
import { schedulingSettingsInputSchema } from "@newfork/shared";
import { createOrganizationSettingsServiceWithClient } from "./organization-settings-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const actorUserId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const settings = {
  week_start_day: "monday", schedule_deadline_day: "sunday",
  time_format: "12h",
} as const;

describe("shared scheduling travel policy", () => {
  it("passes the verified actor to an atomic settings RPC and preserves omitted fields", async () => {
    const rpc = vi.fn(async () => ({ data: { workspace_id: workspaceId, ...settings, minimum_travel_minutes: 30 }, error: null }));
    const from = vi.fn();
    const service = createOrganizationSettingsServiceWithClient({ rpc, from });
    const input = schedulingSettingsInputSchema.parse(settings);
    expect(input).not.toHaveProperty("minimum_travel_minutes");
    expect(await service.updateSchedulingSettings({ workspaceId, actorUserId, settings: input })).toHaveProperty("minimum_travel_minutes", 30);
    expect(rpc).toHaveBeenCalledWith("update_scheduling_settings_service", {
      actor_user_id: actorUserId, target_workspace_id: workspaceId, settings: input,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it.each([-1, 241, 30.5, null, "30"])("rejects invalid minimum %s before a write", (minimum) => {
    expect(schedulingSettingsInputSchema.safeParse({ ...settings, minimum_travel_minutes: minimum }).success).toBe(false);
  });
  it("retains a transaction conflict code for the API retry response", async () => {
    const service = createOrganizationSettingsServiceWithClient({ from: vi.fn(), rpc: vi.fn(async () => ({
      data: null, error: { message: "The schedule is being updated", code: "PT409" },
    })) });
    await expect(service.updateSchedulingSettings({ actorUserId, workspaceId, settings })).rejects.toMatchObject({ statusCode: 409, pgCode: "PT409" });
  });
});
