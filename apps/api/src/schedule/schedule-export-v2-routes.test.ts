import Fastify from "fastify";
import type { ActiveWorkspaceContext, ScheduleReadModel, ScheduleExportV2Scope } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { replyWithError, rpcFailure } from "../http-error";
import { registerScheduleExportV2Routes } from "./schedule-export-v2-routes";
import type { ScheduleReadService } from "./schedule-service";

const id = (n: number) => `afa70000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = { userId: id(1), workspace: { id: id(2) }, membership: { access: { employee: false, management: "owner" }, status: "active" },
  onboarding: { status: "complete" }, documentAccess: { restricted: false }, permissions: ["schedule.export"],
  actions: ["schedule.export"] } as unknown as ActiveWorkspaceContext;
const scope: ScheduleExportV2Scope = { week_start: "2026-09-14", dates: ["2026-09-14"], location_ids: [id(3)],
  employee_ids: [id(4)], shift_ids: [id(5)], source: { kind: "published" } };
const model = { workspace_id: id(2), week_start: scope.week_start, locations: [{ id: id(3), short_name: "MRK" }],
  employees: [{ id: id(4) }], shifts: [{ id: id(5), employee_id: id(4), location_id: id(3), scheduled_date: scope.dates[0] }] } as ScheduleReadModel;

function setup(value: ActiveWorkspaceContext | null = context) {
  const app = Fastify();
  app.setErrorHandler(replyWithError);
  const getReadModel = vi.fn().mockResolvedValue(model);
  const listDrafts = vi.fn().mockResolvedValue({ drafts: [{ id: id(6), workspace_id: id(2), week_start: scope.week_start, revision: 3 }] });
  const listWeeklyShifts = vi.fn().mockResolvedValue({ shifts: model.shifts });
  // An open edit: one unsaved shift (id 7) the published model does not have yet.
  const getEditSession = vi.fn().mockResolvedValue({ id: id(10), workspace_id: id(2), week_start: scope.week_start, revision: 4,
    location_ids: [id(3)], shifts: [{ id: id(7), employee_id: id(4), location_id: id(3), scheduled_date: scope.dates[0] }] });
  const resolve = vi.fn().mockResolvedValue(value);
  registerScheduleExportV2Routes(app, { service: { getReadModel, listDrafts, listWeeklyShifts, getEditSession } as unknown as ScheduleReadService, contextResolver: { resolve } });
  const post = (payload: unknown = scope, authorization: string | undefined = "Bearer test") => app.inject({
    method: "POST", url: `/v1/workspaces/${id(2)}/schedule/export-v2/authorize`, headers: { ...(authorization ? { authorization } : {}), "content-type": "application/json" }, payload: JSON.stringify(payload),
  });
  return { app, post, getReadModel, listDrafts, listWeeklyShifts, getEditSession, resolve };
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
  it.each([
    ["no-token", 401, "session.required"],
    ["no-context", 404, "authz.not_member"],
    ["other-workspace", 404, "authz.not_member"],
    // The authorization core decides who may export (rank, permission, onboarding, access); the route only reads its answer (B-5).
    ["no-export-action", 403, "authz.out_of_scope"],
  ] as const)("denies %s before reading schedule data", async (reason, status, key) => {
    const value = structuredClone(context) as ActiveWorkspaceContext & { actions: string[] };
    if (reason === "other-workspace") value.workspace.id = id(99);
    if (reason === "no-export-action") value.actions = [];
    const { app, post, getReadModel } = setup(reason === "no-context" ? null : value);
    const response = await post(scope, reason === "no-token" ? "" : "Bearer test");
    expect(response.statusCode).toBe(status);
    expect(response.json().reason).toBe(key);
    expect(getReadModel).not.toHaveBeenCalled(); await app.close();
  });
  it("follows the core, not the membership role: an employee the core allows to export is authorized", async () => {
    const { app, post } = setup({ ...context, membership: { ...context.membership, access: { employee: true, management: null } } } as ActiveWorkspaceContext);
    expect((await post()).statusCode).toBe(200); await app.close();
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
  it("exports an open edit as it is now: reads the person's own edit, checks its revision, never a saved draft (Mert 2026-10-12)", async () => {
    const { app, post, getEditSession, listDrafts, listWeeklyShifts } = setup();
    const payload = { ...scope, shift_ids: [id(7)], source: { kind: "edit_session", id: id(10), revision: 4 } };
    expect((await post(payload)).statusCode).toBe(200);
    expect(getEditSession).toHaveBeenCalledWith(id(1), id(2), id(10));
    expect(listDrafts).not.toHaveBeenCalled(); expect(listWeeklyShifts).not.toHaveBeenCalled();
    // A newer edit, a shift the edit does not have, or another week: refresh, nothing is authorized.
    expect((await post({ ...payload, source: { ...payload.source, revision: 3 } })).statusCode).toBe(409);
    expect((await post({ ...payload, shift_ids: [id(5)] })).statusCode).toBe(409);
    getEditSession.mockResolvedValueOnce({ id: id(10), workspace_id: id(2), week_start: "2026-09-21", revision: 4, location_ids: [id(3)], shifts: [] });
    expect((await post(payload)).statusCode).toBe(409);
    // An edit from another workspace is not this export's edit.
    getEditSession.mockResolvedValueOnce({ id: id(10), workspace_id: id(99), week_start: scope.week_start, revision: 4, location_ids: [id(3)], shifts: [] });
    expect((await post(payload)).statusCode).toBe(409);
    // The core refuses the edit (42501, e.g. edit rights taken away): the route fails closed and nothing leaks.
    getEditSession.mockRejectedValueOnce(rpcFailure({ message: "schedule.edit refused", code: "42501", hint: "authz.out_of_scope" }));
    const refused = await post(payload); expect(refused.statusCode).toBe(503);
    expect(refused.body).not.toContain("refused"); expect(refused.body).not.toContain("authz.");
    // Someone else's edit: the database answers as if it did not exist (P0002), the same closed answer.
    getEditSession.mockRejectedValueOnce(rpcFailure({ message: "edit session not found", code: "P0002" }));
    const missing = await post(payload); expect(missing.statusCode).toBe(503); expect(missing.body).not.toContain("edit session not found");
    await app.close();
  });
  it("in an open edit, its own locations come from the edit and the other locations from what is published", async () => {
    const { app, post, getReadModel } = setup();
    const payload = { ...scope, shift_ids: [id(7)], source: { kind: "edit_session", id: id(10), revision: 4 } };
    // Published shift 5 sits at the edited location, so the edit replaced it: no longer exportable.
    expect((await post({ ...payload, shift_ids: [id(5)] })).statusCode).toBe(409);
    // Published shift 9 sits at another location the edit does not cover: still a cross-location reference.
    const other = { ...model.shifts[0]!, id: id(9), location_id: id(8) };
    getReadModel.mockResolvedValue({ ...model, locations: [...model.locations, { id: id(8), short_name: null }], shifts: [...model.shifts, other] });
    expect((await post({ ...payload, ghost_shift_ids: [id(9)] })).statusCode).toBe(200);
    expect((await post({ ...payload, ghost_shift_ids: [id(99)] })).statusCode).toBe(403);
    // A published shift at the edited location is not a reference either.
    expect((await post({ ...payload, ghost_shift_ids: [id(5)] })).statusCode).toBe(403);
    await app.close();
  });
  it("fails closed on revoked permissions, missing short names or a failing source read", async () => {
    const { app, post, getReadModel, resolve } = setup();
    expect((await post()).statusCode).toBe(200);
    resolve.mockResolvedValueOnce({ ...context, actions: [] }); expect((await post()).statusCode).toBe(403);
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
    { ...scope, source: { kind: "edit_session", id: id(10) } },
  ])("rejects malformed export scopes", async payload => {
    const { app, post, getReadModel } = setup(); expect((await post(payload)).statusCode).toBe(400);
    expect(getReadModel).not.toHaveBeenCalled(); await app.close();
  });
});
