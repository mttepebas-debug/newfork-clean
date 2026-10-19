import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import { rpcFailure } from "../http-error";
import { timeOffShortenService, type TimeOffShortenService } from "./time-off-shorten-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const requestId = "98050000-0000-4000-8000-000000000001";
const context = {
  userId,
  workspace: { id: workspaceId, name: "Meyhouse" },
  membership: { access: { employee: false, management: "manager" }, status: "active" },
  permissions: [],
  actions: [],
} as unknown as ActiveWorkspaceContext;
const period = { segment_id: "98050000-0000-4000-8000-000000000002", starts_at: "2030-01-09T15:00:00Z", ends_at: "2030-01-09T19:00:00Z" };
const change = {
  expected_revision: 2,
  periods: [period],
  note: "Covering a sick call",
  operation_id: "98050000-0000-4000-8000-000000000003",
};

function app(service: TimeOffShortenService, resolved: ActiveWorkspaceContext | null = context) {
  return buildApp({ timeOffShortenService: service, contextResolver: { resolve: async () => resolved } });
}
function post(built: ReturnType<typeof app>, body: unknown, workspace = workspaceId) {
  return built.inject({
    method: "POST",
    url: `/v1/workspaces/${workspace}/time-off/${requestId}/shorten`,
    headers: { authorization: "Bearer valid-token" },
    payload: body as Record<string, unknown>,
  });
}
const refusal = (hint: string) =>
  rpcFailure({ code: "42501", message: "Not allowed", hint, details: "time_off.decide" });

describe("A manager shortens approved time off (BL-127)", () => {
  it("asks the database as the signed-in manager and answers with the leave's new state", async () => {
    const rpc = vi.fn(async () => ({ data: { status: "approved", request_id: requestId, revision: 3 }, error: null }));
    const built = app(timeOffShortenService({ rpc }));
    const response = await post(built, change);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "approved", request_id: requestId, revision: 3 });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("shorten_time_off_service", {
      actor: userId, w: workspaceId, rid: requestId, expected_revision: 2,
      periods: change.periods, note: change.note, operation_id: change.operation_id,
    });
    await built.close();
  });

  it("answers the core's no with 403 and its reason", async () => {
    const built = app({ shorten: vi.fn(async () => { throw refusal("authz.rank"); }) });
    const response = await post(built, change);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.rank", detail: "time_off.decide" });
    await built.close();
  });

  it("answers somebody who is not a member with 404", async () => {
    const shorten = vi.fn();
    const built = app({ shorten }, null);
    const response = await post(built, change);
    expect(response.statusCode).toBe(404);
    expect(shorten).not.toHaveBeenCalled();
    await built.close();
  });

  // BL-1043: "the leave changed meanwhile" says so with its key.
  it("passes the database's time_off key on with the 409", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "PT409", message: "stale approved leave; refresh before shortening it", hint: "time_off.changed" },
    }));
    const built = app(timeOffShortenService({ rpc }));
    const response = await post(built, change);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ reason: "time_off.changed" });
    await built.close();
  });

  it("refuses a change without approved hours before asking anybody", async () => {
    const shorten = vi.fn();
    const built = app({ shorten });
    for (const body of [{ ...change, periods: [] }, { ...change, operation_id: "x" },
      { ...change, periods: [{ ...period, ends_at: period.starts_at }] }]) {
      expect((await post(built, body)).statusCode).toBe(400);
    }
    expect(shorten).not.toHaveBeenCalled();
    await built.close();
  });
});
