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
    preference: emptyWeeklyPreference(),
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
const savedModel = {
  employee_id: employee, employee_name: "Alex Kim", can_edit_employee: true, can_manage: false,
  settings: { onboarding_required: true, revision: 0 },
  employee: { revision: 1, submitted: true, updated_at: null, preference: emptyWeeklyPreference() },
  time_format: "24h",
};
describe("weekly preferences onboarding identity", () => {
  it("rejects another employee before save", async () => {
    const input = { ...command(), employee_id: actor };
    await expect(service.onboardingSaveWeekly("validated-token", input, workspace))
      .rejects.toMatchObject({ statusCode: 403, reason: "authz.out_of_scope" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects manager source before save", async () => {
    const input = { ...command(), source: "manager" as const, enabled: true, notes: Array(7).fill("") };
    await expect(service.onboardingSaveWeekly("validated-token", input, workspace))
      .rejects.toMatchObject({ statusCode: 403, reason: "authz.out_of_scope" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  // M5: the answer is the model; there are no request decisions to count.
  it("saves with the server-validated identity and answers with the model", async () => {
    rpc.mockImplementation(async (name: string) => ({
      data: name === "get_employee_onboarding_service"
        ? { workspace_id: workspace, employee_id: employee, revision: 2 }
        : { model: savedModel, kept_count: 0 },
      error: null,
    }));
    await expect(service.onboardingSaveWeekly("validated-token", command(), "ad418000-0000-4000-8000-000000000009", workspace))
      .resolves.toEqual({ model: savedModel });
    expect(getUser).toHaveBeenCalledWith("validated-token");
    expect(rpc).toHaveBeenNthCalledWith(1, "get_employee_onboarding_service", { target_user_id: actor, target_workspace_id: workspace });
    expect(rpc).toHaveBeenLastCalledWith("weekly_preferences_save_service", {
      actor, w: workspace, command: command(), request_key: "ad418000-0000-4000-8000-000000000009",
    });
  });
  it("has no preview", () => {
    expect("onboardingPreviewWeekly" in service).toBe(false);
    expect("previewWeekly" in service).toBe(false);
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
    employees: [
      {
        id: employee,
        display_name: "Alex Kim",
        employee_code: "E-001",
        // The page data names the job and the week's save time (AVAIL-GUN-DB).
        job_name: "Server",
        location_ids: [],
        submitted: false,
        updated_at: null,
        preference: emptyWeeklyPreference(),
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
