import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmployeeHubService } from "./employee-hub-service";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
const actorUserId = "af990000-0000-4000-8000-000000000001";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const location_id = "af990000-0000-4000-8000-000000000003";
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: { status: "pending", request_id: actorUserId, revision: 1 }, error: null }); });
describe("employee hourly time-off service", () => {
  it("routes cancellation through the authenticated actor and preserves parent revision and exact periods", async () => {
    const service = createEmployeeHubService({ url: "http://example.test", serviceRoleKey: "test" });
    const periods = [{ segment_id: actorUserId, starts_at: "2035-01-15T09:00:00Z", ends_at: "2035-01-15T12:00:00Z" }];
    await service.actOnRequest({ actorUserId, workspaceId, action: { request_id: actorUserId, kind: "time_off", action: "request_cancellation", expected_revision: 2, operation_id: actorUserId, reason: "Plans changed", periods } });
    expect(rpc).toHaveBeenCalledWith("submit_employee_time_off_cancellation_service", { actor: actorUserId, w: workspaceId, parent_id: actorUserId, expected_revision: 2, operation_id: actorUserId, reason: "Plans changed", periods });
  });
  it("preserves exact periods, occurrences and operation identity at the database boundary", async () => {
    const service = createEmployeeHubService({ url: "http://example.test", serviceRoleKey: "test" });
    const periods = [{ segment_date: "2035-01-15", start_time: "23:00:01", end_time: "02:00:02", ends_next_day: true, end_fold: "later" as const }];
    await service.submitTimeOff({ actorUserId, workspaceId, request: { location_id, reason: "", periods, request_id: actorUserId, expected_timezone: "UTC" } });
    expect(rpc).toHaveBeenCalledWith("submit_employee_time_off_periods_service", {
      actor_user_id: actorUserId, target_workspace_id: workspaceId, target_location_id: location_id, target_reason: "",
      target_periods: periods, target_operation_id: actorUserId,
      target_expected_timezone: "UTC",
    });
  });
  it("retains the dates-only compatibility path", async () => {
    const service = createEmployeeHubService({ url: "http://example.test", serviceRoleKey: "test" });
    await service.submitTimeOff({ actorUserId, workspaceId, request: { location_id, reason: "", dates: ["2035-01-15"] } });
    expect(rpc).toHaveBeenCalledWith("submit_employee_time_off_service", expect.objectContaining({ target_dates: ["2035-01-15"] }));
  });
});
