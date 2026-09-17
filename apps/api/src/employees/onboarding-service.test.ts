import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmployeeOnboardingService } from "./onboarding-service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), auth: { getUser: vi.fn() } }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mocks),
}));

const actorUserId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const employeeId = "30000000-0000-4000-8000-000000000001";
const missingCase = { code: "P0002", message: "onboarding case unavailable" };

function service() {
  return createEmployeeOnboardingService({
    url: "https://example.supabase.co",
    serviceRoleKey: "test-service-key",
    productionReady: true,
  });
}

describe("employee onboarding review availability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads onboarding without depending on the obsolete availability context RPC", async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user: { id: actorUserId } }, error: null });
    mocks.rpc.mockResolvedValue({ error: null, data: {
      case_id: employeeId, workspace_id: workspaceId, workspace_name: "Test",
      employee_id: employeeId, employee_name: "Test Employee", membership_id: actorUserId,
      membership_status: "pending_activation", case_status: "in_progress", revision: 1,
      progress_completed: 0, progress_total: 0, first_actionable_path: "/welcome/review",
      ssn_status: { present: false, last_four: null }, profile: null, availability: null,
      assignments: { locations: [], jobs: [] }, requirements: [],
    } });
    await expect(service().get("test-access-token")).resolves.toMatchObject({ employee_id: employeeId });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_employee_onboarding_service", { target_user_id: actorUserId });
  });

  it("passes the requested workspace to onboarding reads and writes", async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user: { id: actorUserId } }, error: null });
    mocks.rpc.mockResolvedValue({ error: null, data: 3 });
    await service().submit("test-access-token", 2, workspaceId);
    await service().reset("test-access-token", 2, workspaceId);
    await service().submit("test-access-token", 2);
    expect(mocks.rpc.mock.calls).toEqual([
      ["submit_employee_onboarding_service", { target_user_id: actorUserId, expected_revision: 2, target_workspace_id: workspaceId }],
      ["reset_employee_onboarding_service", { target_user_id: actorUserId, expected_revision: 2, target_workspace_id: workspaceId }],
      ["submit_employee_onboarding_service", { target_user_id: actorUserId, expected_revision: 2 }],
    ]);
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ error: null, data: { status: "left", workspace_id: workspaceId, employee_id: employeeId, membership_id: actorUserId, revision: 3 } });
    await service().leave("test-access-token", 2, workspaceId);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("leave_employee_onboarding_service", { target_user_id: actorUserId, expected_revision: 2, target_workspace_id: workspaceId });
  });

  it("returns an empty review for the RPC's absent or inaccessible case result", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: missingCase });

    await expect(
      service().getReview(actorUserId, workspaceId, employeeId),
    ).resolves.toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "get_employee_onboarding_review_service",
      {
        actor_user_id: actorUserId,
        target_workspace_id: workspaceId,
        target_employee_id: employeeId,
      },
    );
  });

  it.each([
    { code: "42501", message: "employee onboarding review required" },
    {
      code: "PGRST003",
      message: "Timed out acquiring connection from connection pool",
    },
    { code: "P0002", message: "Unexpected record missing" },
  ])("preserves other failures: $code", async (error) => {
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(
      service().getReview(actorUserId, workspaceId, employeeId),
    ).rejects.toThrow(error.message);
  });

  it("stops document downloads before reading storage when the case is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: missingCase });
    await expect(
      service().getDocumentDownload(
        actorUserId,
        workspaceId,
        employeeId,
        "40000000-0000-4000-8000-000000000001",
      ),
    ).rejects.toThrow("Employee document is unavailable");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
