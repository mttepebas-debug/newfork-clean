import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { registerScheduleRoutes } from "./schedule-routes";
import type { ScheduleReadService } from "./schedule-service";
const id = "afa80000-0000-4000-8000-000000000001";
const actor = "afa80000-0000-4000-8000-000000000002";
const context = { userId: actor, workspace: { id }, membership: { role: "owner", status: "active" }, permissions: ["schedule.manage"] } as ActiveWorkspaceContext;
const shift = { location_id: id, employee_id: null, job_id: id, shift_type_id: null, scheduled_date: "2035-01-15", start_time: "18:00", end_time: "20:00", unpaid_break_minutes: 30, hide_time_on_badge: false, label_ids: [], note: "" };
const body = { session_id: id, expected_session_revision: 3, shifts: [shift, shift] };
const headers = { authorization: "Bearer test", "idempotency-key": actor };
function setup(value: ActiveWorkspaceContext | null = context) {
  const app = Fastify(); const createShiftsBatch = vi.fn().mockResolvedValue({ revision: 5 });
  registerScheduleRoutes(app, { service: { createShiftsBatch } as unknown as ScheduleReadService, contextResolver: { resolve: vi.fn().mockResolvedValue(value) } });
  return { app, createShiftsBatch };
}
describe("atomic Schedule paste route", () => {
  it("binds one batch to the authenticated actor and forwards the retry key", async () => {
    const { app, createShiftsBatch } = setup();
    const response = await app.inject({ method: "POST", url: "/shifts/batch", headers, payload: { ...body, actor: id } });
    expect(response.statusCode).toBe(200);
    expect(createShiftsBatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ actorUserId: actor, workspaceId: id, sessionId: id, expectedSessionRevision: 3, idempotencyKey: actor, shifts: expect.arrayContaining([expect.objectContaining(shift)]) }));
    await app.close();
  });
  it("rejects an empty or oversized batch and a missing key before mutation", async () => {
    const { app, createShiftsBatch } = setup();
    for (const shifts of [[], Array.from({ length: 201 }, () => shift)]) {
      expect((await app.inject({ method: "POST", url: "/shifts/batch", headers, payload: { ...body, shifts } })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: "POST", url: "/shifts/batch", payload: body })).statusCode).toBe(400);
    expect(createShiftsBatch).not.toHaveBeenCalled(); await app.close();
  });
  it("rejects employee, inactive and unauthenticated contexts", async () => {
    for (const value of [null, { ...context, membership: { ...context.membership, role: "employee" } }, { ...context, membership: { ...context.membership, status: "pending_activation" } }]) {
      const { app, createShiftsBatch } = setup(value as ActiveWorkspaceContext | null);
      expect((await app.inject({ method: "POST", url: "/shifts/batch", headers, payload: body })).statusCode).toBe(403);
      expect(createShiftsBatch).not.toHaveBeenCalled(); await app.close();
    }
  });
  it("preserves stale-assessment errors as conflicts", async () => {
    const { app, createShiftsBatch } = setup();
    createShiftsBatch.mockRejectedValueOnce(Object.assign(new Error("Review changed"), { code: "40001" }));
    expect((await app.inject({ method: "POST", url: "/shifts/batch", headers, payload: body })).statusCode).toBe(409);
    await app.close();
  });
});
