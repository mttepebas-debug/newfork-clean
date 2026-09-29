import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyWeeklyPreference,
  type WeeklyPreferenceSave,
} from "@newfork/shared";
import { createAvailabilityService } from "./availability-service";

const { getUser, rpc } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser }, rpc }),
}));
const actor = "ad418000-0000-4000-8000-000000000001";
const employee = "ad418000-0000-4000-8000-000000000002";
const workspace = "ad418000-0000-4000-8000-000000000003";
const service = createAvailabilityService({
  url: "http://localhost:55321",
  serviceRoleKey: "test-only",
});
function command(): WeeklyPreferenceSave {
  return {
    employee_id: employee,
    source: "employee",
    expected_revision: 0,
    settings_revision: 0,
    preference: emptyWeeklyPreference("time_range"),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: actor } }, error: null });
  rpc.mockImplementation(async (name: string) => ({
    data:
      name === "get_employee_onboarding_service"
        ? { workspace_id: workspace, employee_id: employee, revision: 2 }
        : { items: [] },
    error: null,
  }));
});
describe("weekly preferences onboarding identity", () => {
  it.each(["preview", "save"] as const)(
    "rejects another employee before %s",
    async (operation) => {
      const input = { ...command(), employee_id: actor };
      const result =
        operation === "preview"
          ? service.onboardingPreviewWeekly("validated-token", input)
          : service.onboardingSaveWeekly("validated-token", input, workspace);
      await expect(result).rejects.toMatchObject({ statusCode: 403, reason: "authz.out_of_scope" });
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["preview", "save"] as const)(
    "rejects manager source before %s",
    async (operation) => {
      const input = {
        ...command(),
        source: "manager" as const,
        enabled: true,
        notes: Array(7).fill(""),
      };
      const result =
        operation === "preview"
          ? service.onboardingPreviewWeekly("validated-token", input)
          : service.onboardingSaveWeekly("validated-token", input, workspace);
      await expect(result).rejects.toMatchObject({ statusCode: 403, reason: "authz.out_of_scope" });
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );
  it("uses the server-validated identity and workspace for preview", async () => {
    await expect(
      service.onboardingPreviewWeekly("validated-token", command()),
    ).resolves.toEqual({ items: [] });
    expect(getUser).toHaveBeenCalledWith("validated-token");
    expect(rpc).toHaveBeenLastCalledWith("weekly_preferences_preview_service", {
      actor,
      w: workspace,
      command: command(),
    });
  });
  it("resolves onboarding identity in the requested workspace", async () => {
    await service.onboardingPreviewWeekly(
      "validated-token",
      command(),
      workspace,
    );
    expect(rpc).toHaveBeenNthCalledWith(1, "get_employee_onboarding_service", {
      target_user_id: actor,
      target_workspace_id: workspace,
    });
    rpc.mockClear();
    await service.onboardingPreviewWeekly("validated-token", command());
    expect(rpc).toHaveBeenNthCalledWith(1, "get_employee_onboarding_service", {
      target_user_id: actor,
    });
  });
  it("rejects an expired token without calling a service RPC", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("expired"),
    });
    await expect(
      service.onboardingReadWeekly("expired-token"),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("weekly team read boundary", () => {
  const model = () => ({
    locations: [],
    time_format: "24h",
    shift_types: [],
    employees: [
      {
        id: employee,
        display_name: "Alex Kim",
        employee_code: "E-001",
        location_ids: [],
        submitted: false,
        preference: emptyWeeklyPreference("time_range"),
        can_open: true,
      },
    ],
  });
  it("uses trusted identity and strips fields outside the employee preference contract", async () => {
    const data = model();
    rpc.mockResolvedValue({
      data: {
        ...data,
        manager: { notes: ["private"] },
        employees: data.employees.map((e) => ({ ...e, notes: ["private"] })),
      },
      error: null,
    });
    await expect(service.readWeeklyTeam(actor, workspace)).resolves.toEqual(
      data,
    );
    expect(rpc).toHaveBeenCalledWith("weekly_team_read_service", {
      actor,
      w: workspace,
    });
  });
  it("rejects malformed weekly data instead of presenting it as available", async () => {
    const data = model();
    data.employees[0]!.preference.days = [];
    rpc.mockResolvedValue({ data, error: null });
    await expect(service.readWeeklyTeam(actor, workspace)).rejects.toThrow();
  });
});
