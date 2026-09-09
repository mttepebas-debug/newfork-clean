import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScheduleRequestsService } from "./schedule-requests-service";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
const actorUserId = "af990000-0000-4000-8000-000000000001";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const requestId = "af990000-0000-4000-8000-000000000003";
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: { status: "partially_approved", request_id: requestId, revision: 2 }, error: null }); });
describe("hourly time-off decisions", () => {
  it("preserves the operation key and each physical decision piece", async () => {
    const service = createScheduleRequestsService({ url: "http://example.test", serviceRoleKey: "test" });
    const decisions = [{ segment_id: requestId, pieces: [
      { starts_at: "2035-01-15T10:00:00Z", ends_at: "2035-01-15T12:00:00Z", status: "approved" as const },
      { starts_at: "2035-01-15T12:00:00Z", ends_at: "2035-01-15T17:00:00Z", status: "denied" as const },
    ] }];
    await service.resolveTimeOff({ actorUserId, workspaceId, requestId, decision: { expected_revision: 1, action: "partial_approve", note: "Morning approved", operation_id: actorUserId, segment_decisions: decisions } });
    expect(rpc).toHaveBeenCalledWith("resolve_time_off_period_decision_service", {
      actor_user_id: actorUserId, w: workspaceId, request_id: requestId, expected_revision: 1, action: "partial_approve", note: "Morning approved", decisions, operation_id: actorUserId,
    });
  });
  it("retains revision-guarded decisions for older clients", async () => {
    const service = createScheduleRequestsService({ url: "http://example.test", serviceRoleKey: "test" });
    await service.resolveTimeOff({ actorUserId, workspaceId, requestId, decision: { expected_revision: 1, action: "approve", note: "", segment_decisions: [] } });
    expect(rpc).toHaveBeenCalledWith("resolve_schedule_time_off_request_service", expect.objectContaining({ target_expected_revision: 1, target_action: "approve" }));
  });
  it("carries the reviewed fingerprint and dispositions into the atomic assignment writer", async () => {
    const service = createScheduleRequestsService({ url: "http://example.test", serviceRoleKey: "test" });
    const dispositions = [{ shift_id: requestId, action: "release_entire_shift" as const }];
    await service.resolveTimeOff({ actorUserId, workspaceId, requestId, decision: { expected_revision: 1, action: "approve", note: "Release for leave", segment_decisions: [], operation_id: actorUserId, assignment_fingerprint: "a".repeat(64), assignment_decisions: dispositions } });
    expect(rpc).toHaveBeenCalledWith("decide_time_off_with_assignments_service", { actor: actorUserId, w: workspaceId, rid: requestId, expected_revision: 1, action: "approve", note: "Release for leave", decisions: [], operation_id: actorUserId, expected_impact: "a".repeat(64), dispositions });
  });
});
