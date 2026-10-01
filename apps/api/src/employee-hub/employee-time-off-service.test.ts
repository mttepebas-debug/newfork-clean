import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmployeeHubService } from "./employee-hub-service";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
const actorUserId = "af990000-0000-4000-8000-000000000001";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const requestId = "af990000-0000-4000-8000-000000000003";
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: { status: "revoked", request_id: requestId, revision: 2 }, error: null }); });
describe("Employee Hub time off (FB-6.3.7)", () => {
  // Asking for and cancelling time off moved to /time-off (time-off-voting-routes); the hub only withdraws a pending request.
  it("withdraws a pending request as the signed-in person", async () => {
    const service = createEmployeeHubService({ url: "http://example.test", serviceRoleKey: "test" });
    await expect(service.actOnRequest({ actorUserId, workspaceId, action: { request_id: requestId, kind: "time_off", action: "cancel", expected_revision: 1 } }))
      .resolves.toEqual({ status: "revoked", request_id: requestId, revision: 2 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("employee_request_action_service", {
      actor_user_id: actorUserId, target_workspace_id: workspaceId, target_request_id: requestId,
      target_kind: "time_off", target_action: "cancel", target_expected_revision: 1,
    });
  });
  it("has no old submit path", () => {
    expect(createEmployeeHubService({ url: "http://example.test", serviceRoleKey: "test" })).not.toHaveProperty("submitTimeOff");
  });
});
