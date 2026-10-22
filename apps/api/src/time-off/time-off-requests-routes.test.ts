import {
  authzActionKeys,
  type ActiveWorkspaceContext,
  type AuthzAction,
  type MyTimeOff,
  type TimeOffRequestView,
} from "@newfork/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import { rpcFailure } from "../http-error";
import { timeOffRequestsReady } from "./time-off-requests-routes";
import type { TimeOffRequestsService } from "./time-off-requests-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const requestId = "98020000-0000-4000-8000-000000000001";
const spoofed = "11111111-1111-4111-8111-111111111111";

function contextWith(actions: readonly AuthzAction[]): ActiveWorkspaceContext {
  return {
    userId,
    workspace: {
      id: workspaceId,
      name: "Meyhouse",
      logo_url: null,
      logo_file_name: null,
      logo_updated_at: null,
      schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
    },
    membership: { id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4", userId, workspaceId, access: { employee: true, management: null }, status: "active" },
    permissions: [],
    actions: [...actions],
    onboarding: { status: "complete", currentStep: 2 },
    documentAccess: { restricted: false },
    locationScope: { allLocations: false, locationIds: [] },
  };
}

const request: TimeOffRequestView = {
  id: requestId,
  kind: "leave",
  kind_of_leave: "vacation",
  status: "pending",
  starts_at: "2026-10-30T07:00:00+00:00",
  ends_at: "2026-11-02T08:00:00+00:00",
  all_day: true,
  time_timezone: "America/Los_Angeles",
  start_date: "2026-10-30",
  end_date: "2026-11-01",
  start_time: null,
  end_time: null,
  note: "Wedding",
  revision: 1,
  created_at: "2026-10-22T16:30:00+00:00",
  decided_at: null,
  decided_by_name: null,
  decision_note: null,
  ended_at: null,
  ended_note: null,
};
const mine: MyTimeOff = { time_zone: "America/Los_Angeles", today: "2026-10-22", location_names: ["Downtown"], requests: [request] };

function serviceMock(): TimeOffRequestsService {
  return {
    mine: vi.fn().mockResolvedValue(mine),
    ask: vi.fn().mockResolvedValue(request),
    withdraw: vi.fn().mockResolvedValue({ ...request, status: "withdrawn", revision: 2 }),
  };
}

const base = `/v1/workspaces/${workspaceId}/time-off-requests`;
const auth = { authorization: "Bearer valid-token" };
const ask = {
  kind_of_leave: "vacation",
  start_date: "2026-10-30",
  end_date: "2026-11-01",
  all_day: true,
  start_time: null,
  end_time: null,
  note: "Wedding",
  expected_timezone: "America/Los_Angeles",
  client_key: "5b1d0c9e-0f7e-4c8a-9a51-6f5f2b0c4d11",
};
const withdraw = { expected_revision: 1 };

// Each route, the action the core must have listed for it, and a valid body.
const routes = [
  ["GET", `${base}/mine`, "employee_hub.read", undefined],
  ["POST", base, "time_off.request_own", ask],
  ["POST", `${base}/${requestId}/withdraw`, "time_off.request_own", withdraw],
] as const;

describe("time off requests routes", () => {
  it.each(routes)("%s %s answers with what the database answers", async (method, url, action, payload) => {
    const app = buildApp({ timeOffRequestsService: serviceMock(), contextResolver: { resolve: async () => contextWith([action]) } });
    const response = await app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(url.endsWith("/mine") ? mine : url.endsWith("/withdraw") ? { ...request, status: "withdrawn", revision: 2 } : request);
    await app.close();
  });

  it.each(routes)("%s %s is refused without its action", async (method, url, action, payload) => {
    const service = serviceMock();
    const others = authzActionKeys.filter((key) => key !== action);
    const app = buildApp({ timeOffRequestsService: service, contextResolver: { resolve: async () => contextWith(others) } });
    const response = await app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.out_of_scope", detail: action });
    expect(Object.values(service).every((fn) => vi.mocked(fn).mock.calls.length === 0)).toBe(true);
    await app.close();
  });

  it.each(routes)("%s %s answers a non-member with 404", async (method, url, action, payload) => {
    const app = buildApp({
      timeOffRequestsService: serviceMock(),
      contextResolver: { resolve: async () => ({ ...contextWith([action]), workspace: { ...contextWith([]).workspace, id: otherWorkspaceId } }) },
    });
    const response = await app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ reason: "authz.not_member" });
    await app.close();
  });

  it("asks for a session before anything else", async () => {
    const app = buildApp({ timeOffRequestsService: serviceMock(), contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    expect((await app.inject({ method: "GET", url: `${base}/mine` })).statusCode).toBe(401);
    await app.close();
  });

  it("binds the person and the workspace from the token and the address, never the body", async () => {
    const service = serviceMock();
    const app = buildApp({ timeOffRequestsService: service, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    await app.inject({ method: "GET", url: `${base}/mine`, headers: auth });
    await app.inject({ method: "POST", url: base, headers: auth, payload: ask });
    await app.inject({ method: "POST", url: `${base}/${requestId}/withdraw`, headers: auth, payload: withdraw });
    const actor = { actorUserId: userId, workspaceId };
    expect(service.mine).toHaveBeenCalledExactlyOnceWith(actor);
    expect(service.ask).toHaveBeenCalledExactlyOnceWith({ ...actor, request: ask });
    expect(service.withdraw).toHaveBeenCalledExactlyOnceWith({ ...actor, requestId, expectedRevision: 1 });
    const smuggled = await app.inject({ method: "POST", url: base, headers: auth, payload: { ...ask, actor_user_id: spoofed } });
    expect(smuggled.statusCode).toBe(400);
    await app.close();
  });

  it.each([
    ["POST", base, { ...ask, kind_of_leave: "holiday" }],
    ["POST", base, { ...ask, all_day: false, start_time: "09:00", end_time: null }],
    ["POST", base, { ...ask, start_date: "10/30/2026" }],
    ["POST", base, { ...ask, client_key: "again" }],
    ["POST", base, { ...ask, note: "x".repeat(1001) }],
    ["POST", `${base}/${requestId}/withdraw`, { expected_revision: 0 }],
    ["POST", `${base}/${requestId}/withdraw`, {}],
    ["POST", `${base}/not-an-id/withdraw`, withdraw],
  ] as const)("%s %s refuses a body it cannot read", async (method, url, payload) => {
    const service = serviceMock();
    const app = buildApp({ timeOffRequestsService: service, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    const response = await app.inject({ method, url, headers: auth, payload });
    expect(response.statusCode).toBe(400);
    expect(service.ask).not.toHaveBeenCalled();
    expect(service.withdraw).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ["22023", "time_off.started", 400],
    ["22023", "time_off.too_long", 400],
    ["PT409", "time_off.overlap", 409],
    ["PT409", "time_off.timezone_changed", 409],
    ["55000", "time_off.no_location", 400],
    ["42501", "authz.rank", 403],
  ] as const)("passes the database's %s %s through as %i with its reason", async (code, hint, status) => {
    const service = serviceMock();
    vi.mocked(service.ask).mockRejectedValue(rpcFailure({ message: "Refused", code, hint }));
    const app = buildApp({ timeOffRequestsService: service, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    const response = await app.inject({ method: "POST", url: base, headers: auth, payload: ask });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ reason: hint });
    await app.close();
  });

  it("answers a request that is not there with 404 and its reason", async () => {
    const service = serviceMock();
    vi.mocked(service.withdraw).mockRejectedValue(rpcFailure({ message: "Time off request not found", code: "P0002", hint: "time_off.not_found" }));
    const app = buildApp({ timeOffRequestsService: service, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    const response = await app.inject({ method: "POST", url: `${base}/${requestId}/withdraw`, headers: auth, payload: withdraw });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ reason: "time_off.not_found" });
    await app.close();
  });

  it("says so when the database is not configured", async () => {
    const app = buildApp({ timeOffRequestsService: null, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    expect((await app.inject({ method: "GET", url: `${base}/mine`, headers: auth })).statusCode).toBe(503);
    await app.close();
  });
});

describe("time off requests gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is open outside production, and in production only once TIME_OFF_READY is true", () => {
    expect(timeOffRequestsReady({ NODE_ENV: "test" })).toBe(true);
    expect(timeOffRequestsReady({ NODE_ENV: "development" })).toBe(true);
    expect(timeOffRequestsReady({ NODE_ENV: "production" })).toBe(false);
    expect(timeOffRequestsReady({ NODE_ENV: "production", TIME_OFF_READY: "1" })).toBe(false);
    expect(timeOffRequestsReady({ NODE_ENV: "production", TIME_OFF_READY: "true" })).toBe(true);
  });

  it("leaves the routes out of a production app until then", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TIME_OFF_READY", "");
    const closed = buildApp({ timeOffRequestsService: serviceMock(), contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    expect((await closed.inject({ method: "GET", url: `${base}/mine`, headers: auth })).statusCode).toBe(404);
    await closed.close();
    vi.stubEnv("TIME_OFF_READY", "true");
    const open = buildApp({ timeOffRequestsService: serviceMock(), contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    expect((await open.inject({ method: "GET", url: `${base}/mine`, headers: auth })).statusCode).toBe(200);
    await open.close();
  });
});
