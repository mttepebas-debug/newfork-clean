import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmployeeHubService } from "./employee-hub-service";

const { rpc, from, maybeSingle, locationRead } = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), maybeSingle: vi.fn(), locationRead: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc, from }) }));
const workspace = "ad418000-0000-4000-8000-000000000003";
const employee = "ad418000-0000-4000-8000-000000000002";
const actor = "ad418000-0000-4000-8000-000000000001";
const service = createEmployeeHubService({ url: "http://localhost:55321", serviceRoleKey: "test-only" });
const input = { actorUserId: actor, workspaceId: workspace, from: "2035-01-01", to: "2035-01-07" };
const leave = {
  id: actor, kind: "time_off", status: "pending", title: "Time off",
  detail: "Appointment", revision: 1, created_at: "2035-01-01T00:00:00Z",
  can_cancel: true, periods: [], decision_events: [], request_type: "time_off",
};
const model = {
  workspace_id: workspace, employee: { id: employee, display_name: "QA Employee" },
  locations: [{ id: workspace, name: "Dining" }], shifts: [], open_shifts: [], team_shifts: [],
  requests: [leave], team: [],
  availability: { obsolete: "Do not parse or expose dated rules" },
  availability_context: { obsolete: "Do not expose approval context" },
};
beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockResolvedValue({ data: model, error: null });
  maybeSingle.mockResolvedValue({ data: { time_format: "24h" }, error: null });
  locationRead.mockResolvedValue({ data: [{ id: workspace, timezone: "America/Los_Angeles" }], error: null });
  from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle, in: locationRead }) }) });
});
describe("employee hub weekly read boundary", () => {
  it("keeps requests and local clock settings without loading or returning legacy availability", async () => {
    const result = await service.get(input);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_employee_hub_service", {
      actor_user_id: actor, target_workspace_id: workspace,
      target_from: input.from, target_to: input.to,
    });
    expect(result.requests).toEqual([leave]);
    expect(result.settings.time_format).toBe("24h");
    expect(result.locations[0]?.timezone).toBe("America/Los_Angeles");
    expect(result.availability).toBeNull();
    expect(result.availability_context).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("obsolete");
  });
  it("does not hide errors in the canonical employee read", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Employee access denied" } });
    await expect(service.get(input)).rejects.toThrow("Employee access denied");
  });
  it("still rejects malformed non-availability data", async () => {
    rpc.mockResolvedValue({ data: { ...model, requests: [{ ...leave, revision: -1 }] }, error: null });
    await expect(service.get(input)).rejects.toThrow();
  });
});
