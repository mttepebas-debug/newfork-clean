import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { registerScheduleRoutes } from "./schedule-routes";
import type { ScheduleReadService } from "./schedule-service";
const id = "afa70000-0000-4000-8000-000000000001";
const actor = "afa70000-0000-4000-8000-000000000002";
const context = { userId: actor, workspace: { id }, membership: { role: "owner", status: "active" }, permissions: ["schedule.manage"] } as ActiveWorkspaceContext;
const body = { expected_session_revision: 3, starts_on: "2035-01-15", ends_on: "2035-01-21", shift_ids: [id] };
function setup(value: ActiveWorkspaceContext | null = context) {
  const app = Fastify();
  const previewDefaultHours = vi.fn().mockResolvedValue({ changed_count: 1 });
  const applyDefaultHours = vi.fn().mockResolvedValue({ revision: 4 });
  registerScheduleRoutes(app, { service: { previewDefaultHours, applyDefaultHours } as unknown as ScheduleReadService, contextResolver: { resolve: vi.fn().mockResolvedValue(value) } });
  return { app, previewDefaultHours, applyDefaultHours };
}
const url = (action: string) => `/v1/workspaces/${id}/schedule/edit-sessions/${id}/default-hours-${action}`;
describe("default-hours review routes", () => {
  it("binds preview to the authenticated manager and parses bounded selection", async () => {
    const { app, previewDefaultHours } = setup();
    const response = await app.inject({ method: "POST", url: url("preview"), headers: { authorization: "Bearer test" }, payload: { ...body, actor: "spoof" } });
    expect(response.statusCode).toBe(200);
    expect(previewDefaultHours).toHaveBeenCalledWith({ actorUserId: actor, workspaceId: id, sessionId: id, command: { ...body, overrides: [] } });
    expect((await app.inject({ method: "POST", url: url("preview"), payload: { ...body, shift_ids: [id, id] } })).statusCode).toBe(400);
    await app.close();
  });
  it("requires active manager scope and rejects employee or cross-workspace context", async () => {
    for (const value of [null, { ...context, membership: { ...context.membership, role: "employee" } }, { ...context, membership: { ...context.membership, status: "pending_activation" } }, { ...context, workspace: { ...context.workspace, id: actor } }]) {
      const { app, previewDefaultHours } = setup(value as ActiveWorkspaceContext | null);
      expect([403, 404]).toContain((await app.inject({ method: "POST", url: url("preview"), headers: { authorization: "Bearer test" }, payload: body })).statusCode);
      expect(previewDefaultHours).not.toHaveBeenCalled(); await app.close();
    }
  });
  it("requires fingerprint and retry key and preserves stale database errors", async () => {
    const { app, applyDefaultHours } = setup();
    expect((await app.inject({ method: "POST", url: url("apply"), headers: { authorization: "Bearer test" }, payload: body })).statusCode).toBe(400);
    applyDefaultHours.mockRejectedValueOnce(Object.assign(new Error("Review changed"), { code: "40001" }));
    const command = { ...body, fingerprint: "a".repeat(64), idempotency_key: actor, acknowledge_reference_overlaps: true, confirm_availability: true };
    const response = await app.inject({ method: "POST", url: url("apply"), headers: { authorization: "Bearer test" }, payload: command });
    expect(response.statusCode).toBe(409);
    expect(applyDefaultHours).toHaveBeenCalledWith({ actorUserId: actor, workspaceId: id, sessionId: id, command: { ...command, overrides: [] } });
    await app.close();
  });
});
