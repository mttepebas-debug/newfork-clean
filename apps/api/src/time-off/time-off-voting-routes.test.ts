import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import { timeOffVotingService } from "./time-off-voting-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const requestId = "98060000-0000-4000-8000-000000000001";
const key = "98060000-0000-4000-8000-000000000003";
const fingerprint = "0123456789abcdef0123456789abcdef";
const context = {
  userId,
  workspace: { id: workspaceId, name: "Meyhouse" },
  membership: { role: "manager", status: "active" },
  permissions: [],
  actions: [],
} as unknown as ActiveWorkspaceContext;
type Rpc = Parameters<typeof timeOffVotingService>[0]["rpc"];
type Failure = { code: string; message: string; hint?: string; details?: string };

function app(rpc: Rpc, resolved: ActiveWorkspaceContext | null = context) {
  return buildApp({ timeOffVotingService: timeOffVotingService({ rpc }), contextResolver: { resolve: async () => resolved } });
}
const answers = (data: unknown) => vi.fn(async () => ({ data, error: null }));
const fails = (error: Failure) => vi.fn(async () => ({ data: null, error }));
const no = (hint: string, action: string): Failure => ({ code: "42501", message: "Not allowed", hint, details: action });

const day = { segment_date: "2035-01-15", start_time: null, end_time: null, ends_next_day: false };
const endpoints = [
  {
    name: "Ali asks for time off (Employee Hub > Request time off)",
    path: "",
    body: { periods: [day, { ...day, segment_date: "2035-01-16" }], reason: "Family", expected_timezone: "America/New_York", operation_id: key },
    bad: [{ periods: [day, { ...day, segment_date: "2035-01-18" }], expected_timezone: "America/New_York", operation_id: key },
      { periods: [day], expected_timezone: "America/New_York", operation_id: key, location_id: workspaceId }],
    data: { status: "pending", request_id: requestId, revision: 1, decide_by: "2035-01-14T14:00:00+00:00" },
    rpc: ["submit_time_off_service", {
      actor: userId, w: workspaceId, reason: "Family", expected_timezone: "America/New_York", operation_id: key,
      periods: [day, { ...day, segment_date: "2035-01-16" }],
    }],
    action: "time_off.request_own", conflict: "overlapping time off request exists",
  },
  {
    name: "Ali asks to cancel approved hours",
    path: `/${requestId}/cancellation`,
    body: { expected_revision: 3, reason: "", operation_id: key,
      periods: [{ segment_id: key, starts_at: "2035-01-15T15:00:00Z", ends_at: "2035-01-15T19:00:00Z" }] },
    bad: [{ expected_revision: 3, operation_id: key, periods: [] }],
    data: { status: "pending", request_id: key, revision: 1, decide_by: "2035-01-14T15:00:00+00:00" },
    rpc: ["request_time_off_cancellation_service", {
      actor: userId, w: workspaceId, parent_id: requestId, expected_revision: 3, reason: "", operation_id: key,
      periods: [{ segment_id: key, starts_at: "2035-01-15T15:00:00Z", ends_at: "2035-01-15T19:00:00Z" }],
    }],
    action: "time_off.request_own", conflict: "A cancellation request is already pending for this leave",
  },
  {
    name: "Ayse votes on it (Requests > Time off)",
    path: `/${requestId}/verdict`,
    body: { verdict: "approve", note: "", expected_impact: fingerprint },
    bad: [{ verdict: "partial_approve", expected_impact: fingerprint }, { verdict: "approve" }],
    data: { status: "pending", final: false, alone: false, remaining: 1, revision: 2, request_id: requestId },
    rpc: ["decide_time_off_service", { actor: userId, w: workspaceId, rid: requestId, verdict: "approve", note: "", expected_impact: fingerprint }],
    action: "time_off.decide", conflict: null,
  },
  {
    name: "A manager revokes it with a reason",
    path: `/${requestId}/revoke`,
    body: { expected_revision: 4, reason: "Short staffed" },
    bad: [{ expected_revision: 4, reason: "  " }, { reason: "Short staffed" }],
    data: { status: "revoked", request_id: requestId, revision: 5 },
    rpc: ["revoke_time_off_service", { actor: userId, w: workspaceId, rid: requestId, expected_revision: 4, reason: "Short staffed" }],
    action: "time_off.revoke", conflict: null,
  },
] as const;

function post(built: ReturnType<typeof app>, path: string, body: unknown) {
  return built.inject({
    method: "POST",
    url: `/v1/workspaces/${workspaceId}/time-off${path}`,
    headers: { authorization: "Bearer valid-token" },
    payload: body as Record<string, unknown>,
  });
}

describe.each(endpoints)("$name (FB-6.3.5)", (endpoint) => {
  it("asks the database as the signed-in person and answers with what it said", async () => {
    const rpc = answers(endpoint.data);
    const built = app(rpc);
    const response = await post(built, endpoint.path, endpoint.body);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(endpoint.data);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(...endpoint.rpc);
    await built.close();
  });

  it("answers the core's no with 403 and its reason", async () => {
    const built = app(fails(no("authz.rank", endpoint.action)));
    const response = await post(built, endpoint.path, endpoint.body);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.rank", detail: endpoint.action });
    await built.close();
  });

  it("answers somebody who is not a member with 404, asking nobody", async () => {
    const rpc = answers(endpoint.data);
    const built = app(rpc, null);
    expect((await post(built, endpoint.path, endpoint.body)).statusCode).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    await built.close();
  });

  it("answers the core's not-a-member with 404", async () => {
    const built = app(fails(no("authz.not_member", endpoint.action)));
    expect((await post(built, endpoint.path, endpoint.body)).statusCode).toBe(404);
    await built.close();
  });

  it("answers a stale screen with 409", async () => {
    const built = app(fails({ code: "40001", message: "This request is already closed" }));
    const response = await post(built, endpoint.path, endpoint.body);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("This request is already closed");
    await built.close();
  });

  // BL-1043: the key says which 409 this is, so the screen looks again only
  // when the request changed and not, say, for a request key sent twice.
  it("passes the database's time_off key on with the 409", async () => {
    const built = app(fails({ code: "PT409", message: "This request is already closed", hint: "time_off.changed" }));
    const response = await post(built, endpoint.path, endpoint.body);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "This request is already closed", reason: "time_off.changed" });
    await built.close();
  });

  it("refuses an invalid body before asking anybody", async () => {
    const rpc = answers(endpoint.data);
    const built = app(rpc);
    for (const body of endpoint.bad) expect((await post(built, endpoint.path, body)).statusCode).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    await built.close();
  });

  it("passes the database's invalid-input sentence on with 400", async () => {
    const built = app(fails({ code: "22023", message: "A request is one run of days in a row" }));
    const response = await post(built, endpoint.path, endpoint.body);
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("A request is one run of days in a row");
    await built.close();
  });
});

describe.each(endpoints.filter((e) => e.conflict))("$name: a request already in the way", (endpoint) => {
  it("is a conflict, 409", async () => {
    const built = app(fails({ code: "23514", message: endpoint.conflict! }));
    const response = await post(built, endpoint.path, endpoint.body);
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe(endpoint.conflict);
    await built.close();
  });
});
