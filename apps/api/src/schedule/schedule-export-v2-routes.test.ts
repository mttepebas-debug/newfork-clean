import Fastify from "fastify";
import type { ActiveWorkspaceContext, ScheduleReadModel, ScheduleExportV2Scope } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { registerScheduleExportV2Routes } from "./schedule-export-v2-routes";
import type { ScheduleReadService } from "./schedule-service";

const id = (n: number) => `afa70000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = { userId: id(1), workspace: { id: id(2) }, membership: { role: "owner", status: "active" },
  onboarding: { status: "complete" }, permissions: ["schedule.export"] } as ActiveWorkspaceContext;
const scope: ScheduleExportV2Scope = { week_start: "2026-09-14", dates: ["2026-09-14"], location_ids: [id(3)],
  employee_ids: [id(4)], shift_ids: [id(5)], source: { kind: "published" } };
const model = { workspace_id: id(2), week_start: scope.week_start, locations: [{ id: id(3), short_name: "MRK" }],
  employees: [{ id: id(4) }], shifts: [{ id: id(5), employee_id: id(4), location_id: id(3), scheduled_date: scope.dates[0] }] } as ScheduleReadModel;

function setup(value: ActiveWorkspaceContext | null = context) {
  const app = Fastify();
  const getReadModel = vi.fn().mockResolvedValue(model);
  const listDrafts = vi.fn().mockResolvedValue({ drafts: [{ id: id(6), workspace_id: id(2), week_start: scope.week_start, revision: 3 }] });
  const listWeeklyShifts = vi.fn().mockResolvedValue({ shifts: model.shifts });
  const resolve = vi.fn().mockResolvedValue(value);
  registerScheduleExportV2Routes(app, { service: { getReadModel, listDrafts, listWeeklyShifts } as unknown as ScheduleReadService, contextResolver: { resolve } });
  const post = (payload: unknown = scope, authorization: string | undefined = "Bearer test") => app.inject({
    method: "POST", url: `/v1/workspaces/${id(2)}/schedule/export-v2/authorize`, headers: { ...(authorization ? { authorization } : {}), "content-type": "application/json" }, payload: JSON.stringify(payload),
  });
  return { app, post, getReadModel, listDrafts, listWeeklyShifts, resolve };
}

describe("Export v2 read-only server authorization", () => {
  it("uses the authenticated actor, checks the current scope and disables response caching", async () => {
    const { app, post, getReadModel, listDrafts } = setup();
    const response = await post();
    expect(response.statusCode).toBe(200); expect(response.json()).toEqual({ authorized: true });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(getReadModel).toHaveBeenCalledWith(id(1), id(2), scope.week_start); expect(listDrafts).not.toHaveBeenCalled();
    await app.close();
  });
  it.each(["no-token", "no-context", "employee", "inactive", "onboarding", "no-permission", "other-workspace"])("denies %s before reading schedule data", async reason => {
    const value = structuredClone(context);
    if (reason === "employee") value.membership.role = "employee";
    if (reason === "inactive") value.membership.status = "pending_activation" as typeof value.membership.status;
    if (reason === "onboarding") value.onboarding.status = "required" as typeof value.onboarding.status;
    if (reason === "no-permission") value.permissions = [];
    if (reason === "other-workspace") value.workspace.id = id(99);
    const { app, post, getReadModel } = setup(reason === "no-context" ? null : value);
    expect((await post(scope, reason === "no-token" ? "" : "Bearer test")).statusCode).toBe(403);
    expect(getReadModel).not.toHaveBeenCalled(); await app.close();
  });
  it.each([
    { ...scope, location_ids: [id(99)] }, { ...scope, employee_ids: [id(99)] },
  ])("denies inaccessible location or employee ids", async payload => {
    const { app, post } = setup(); expect((await post(payload)).statusCode).toBe(403); await app.close();
  });
  it.each([
    { ...scope, shift_ids: [id(99)] }, { ...scope, dates: ["2026-09-15"] }, { ...scope, employee_ids: [] },
  ])("rejects a shift outside the captured source/date/employee scope", async payload => {
    const { app, post } = setup(); expect((await post(payload)).statusCode).toBe(409); await app.close();
  });
  it("rechecks draft existence, workspace/week and revision before its scoped shift read", async () => {
    const { app, post, listWeeklyShifts, listDrafts } = setup();
    const payload = { ...scope, source: { kind: "draft", id: id(6), revision: 3 } };
    expect((await post(payload)).statusCode).toBe(200);
    expect(listWeeklyShifts).toHaveBeenCalledWith({ actorUserId: id(1), workspaceId: id(2), weekStart: scope.week_start,
      locationIds: [id(3)], draftId: id(6), includeLive: false });
    expect((await post({ ...payload, source: { ...payload.source, revision: 2 } })).statusCode).toBe(409);
    listDrafts.mockResolvedValue({ drafts: [] });
    expect((await post(payload)).statusCode).toBe(403);
    expect(listWeeklyShifts).toHaveBeenCalledTimes(1); await app.close();
  });
  it("fails closed on revoked permissions, missing short names or a failing source read", async () => {
    const { app, post, getReadModel, resolve } = setup();
    expect((await post()).statusCode).toBe(200);
    resolve.mockResolvedValueOnce({ ...context, permissions: [] }); expect((await post()).statusCode).toBe(403);
    getReadModel.mockResolvedValueOnce({ ...model, locations: [{ id: id(3), short_name: null }] }); expect((await post()).statusCode).toBe(409);
    getReadModel.mockRejectedValueOnce(new Error("private database diagnostic"));
    const failed = await post(); expect(failed.statusCode).toBe(503); expect(failed.body).not.toContain("private database");
    await app.close();
  });
  it("authorizes visible cross-location references only within actor/date/employee scope", async () => {
    const { app, post, getReadModel } = setup();
    const other = { ...model.shifts[0]!, id: id(9), location_id: id(8) };
    getReadModel.mockResolvedValue({ ...model, locations: [...model.locations, { id: id(8), short_name: null }], shifts: [...model.shifts, other] });
    expect((await post({ ...scope, ghost_shift_ids: [id(9)] })).statusCode).toBe(200);
    expect((await post({ ...scope, ghost_shift_ids: [id(99)] })).statusCode).toBe(403);
    expect((await post({ ...scope, ghost_shift_ids: [id(5)] })).statusCode).toBe(403);
    getReadModel.mockResolvedValue({ ...model, shifts: [...model.shifts, other] });
    expect((await post({ ...scope, ghost_shift_ids: [id(9)] })).statusCode).toBe(403);
    await app.close();
  });
  it.each([
    { ...scope, source: { kind: "edit" } }, { ...scope, actor_user_id: id(99) },
    { ...scope, location_ids: [] }, { ...scope, dates: ["2026-09-21"] },
    { ...scope, shift_ids: [id(5), id(5)] },
  ])("rejects malformed or edit-session export scopes", async payload => {
    const { app, post, getReadModel } = setup(); expect((await post(payload)).statusCode).toBe(400);
    expect(getReadModel).not.toHaveBeenCalled(); await app.close();
  });
});
