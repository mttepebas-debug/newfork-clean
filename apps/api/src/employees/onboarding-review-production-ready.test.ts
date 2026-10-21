import type { ActiveWorkspaceContext } from "@newfork/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";

// KATILIM-ONAY (S-231, nf-guvenlik): what the drawer's Approve gets on a production API that has not been told
// it is ready (NODE_ENV=production, ONBOARDING_PRODUCTION_READY not "true"). The API asks the database with
// production_ready = false and the database refuses an activation with 55000 (review_employee_onboarding_service).
// This only records today's answer; it does not choose it.

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), auth: { getUser: vi.fn() } }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => mocks) }));

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const employeeId = "fe201916-aa0e-480b-9144-1e1c8da20a31";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";

const context: ActiveWorkspaceContext = {
  userId,
  workspace: {
    id: workspaceId,
    name: "Meyhouse",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
  membership: { id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4", userId, workspaceId, access: { employee: false, management: "owner" }, status: "active" },
  permissions: [],
  actions: ["onboarding.review"],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
};

describe("Approve on a production API not marked ready", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    vi.stubEnv("ONBOARDING_PRODUCTION_READY", undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("asks with production_ready false and answers the database's 55000 with 400", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "55000", message: "sensitive infrastructure readiness required", details: null, hint: null },
    });
    const app = buildApp({ contextResolver: { resolve: async () => context } });

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/employees/${employeeId}/onboarding/review`,
      headers: { authorization: "Bearer valid-token" },
      payload: { action: "activate", requirementId: null, revision: 3 },
    });

    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("review_employee_onboarding_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      target_employee_id: employeeId,
      review_action: "activate",
      target_requirement_id: null,
      review_reason: "",
      expected_revision: 3,
      production_ready: false,
    });
    expect(response.statusCode).toBe(400);
    // No reason key: the drawer shows the sentence as it is.
    expect(response.json()).toEqual({ error: "sensitive infrastructure readiness required", requestId: expect.any(String) });
    await app.close();
  });
});
