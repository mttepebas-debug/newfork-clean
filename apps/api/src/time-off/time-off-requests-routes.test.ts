import {
  authzActionKeys,
  type ActiveWorkspaceContext,
  type AuthzAction,
  type MyTimeOff,
  type MyTimeOffShifts,
  type TimeOffDeciderView,
  type TimeOffImpact,
  type TimeOffRequestView,
  type TimeOffRequestsPage,
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
  cancels_id: null,
  ended_by_name: null,
  used_until: null,
  cancellation: null,
};
const mine: MyTimeOff = { time_zone: "America/Los_Angeles", today: "2026-10-22", location_names: ["Downtown"], requests: [request] };
// D3: the answerer's side.
const decided: TimeOffDeciderView = { ...request, employee_id: "735032ec-0e98-4fb1-8005-c4ede5b1726b", employee_name: "Ali Person",
  location_names: ["Downtown"], shifts_opened: 0 };
const listed: TimeOffRequestsPage = { total: 1, waiting: 1, page: 1, page_size: 50, requests: [decided] };
const impact: TimeOffImpact = { request: decided, fingerprint: "11611d0e7f9542616aa542c39e615471", shift_count: 0, hidden_shift_count: 0, locations: [] };
const answered: TimeOffDeciderView = { ...decided, status: "approved", revision: 2, decided_by_name: "Mk Person" };
const shifts: MyTimeOffShifts = { count: 0, shifts: [] };
// D4: cancelling and taking back.
const cancellationId = "98020000-0000-4000-8000-000000000002";
const withCancellation: TimeOffRequestView = { ...request, status: "approved", revision: 2, cancellation: { id: cancellationId,
  status: "pending", note: "Plans changed", revision: 1, created_at: "2026-10-23T16:30:00+00:00", decided_at: null,
  decided_by_name: null, decision_note: null } };
const cancelAnswered: TimeOffDeciderView = { ...decided, id: cancellationId, kind: "cancel", cancels_id: requestId, status: "approved",
  decided_by_name: "Mk Person" };
const takenBack: TimeOffDeciderView = { ...decided, status: "revoked", revision: 3, ended_note: "Short-staffed", ended_by_name: "Mk Person" };

function serviceMock(): TimeOffRequestsService {
  return {
    mine: vi.fn().mockResolvedValue(mine),
    ask: vi.fn().mockResolvedValue(request),
    withdraw: vi.fn().mockResolvedValue({ ...request, status: "withdrawn", revision: 2 }),
    list: vi.fn().mockResolvedValue(listed),
    impact: vi.fn().mockResolvedValue(impact),
    answer: vi.fn().mockResolvedValue(answered),
    myShifts: vi.fn().mockResolvedValue(shifts),
    askCancellation: vi.fn().mockResolvedValue(withCancellation),
    answerCancellation: vi.fn().mockResolvedValue(cancelAnswered),
    takeBack: vi.fn().mockResolvedValue(takenBack),
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
const answer = { verdict: "approve", note: "Enjoy", expected_revision: 1, expected_impact: "11611d0e7f9542616aa542c39e615471" };
const askCancel = { note: "Plans changed", expected_revision: 2, client_key: "5b1d0c9e-0f7e-4c8a-9a51-6f5f2b0c4d12" };
const answerCancel = { verdict: "approve", note: null, expected_revision: 1 };
const takeBack = { note: "Short-staffed", expected_revision: 2 };

// Each route, the action the core must have listed for it, a valid body, and what it answers.
const routes = [
  ["GET", `${base}/mine`, "employee_hub.read", undefined, mine],
  ["POST", base, "time_off.request_own", ask, request],
  ["POST", `${base}/${requestId}/withdraw`, "time_off.request_own", withdraw, { ...request, status: "withdrawn", revision: 2 }],
  ["GET", `${base}/my-shifts?start=2026-10-30&end=2026-11-01`, "time_off.request_own", undefined, shifts],
  ["GET", base, "time_off.decide", undefined, listed],
  ["GET", `${base}/${requestId}/impact`, "time_off.decide", undefined, impact],
  ["POST", `${base}/${requestId}/answer`, "time_off.decide", answer, answered],
  ["POST", `${base}/${requestId}/cancellation`, "time_off.request_own", askCancel, withCancellation],
  ["POST", `${base}/${cancellationId}/answer-cancellation`, "time_off.decide", answerCancel, cancelAnswered],
  ["POST", `${base}/${requestId}/take-back`, "time_off.decide", takeBack, takenBack],
] as const;

describe("time off requests routes", () => {
  it.each(routes)("%s %s answers with what the database answers", async (method, url, action, payload, expected) => {
    const app = buildApp({ timeOffRequestsService: serviceMock(), contextResolver: { resolve: async () => contextWith([action]) } });
    const response = await app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expected);
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
    await app.inject({ method: "GET", url: `${base}?view=open&sort=starts&page=2&page_size=25&search=ali`, headers: auth });
    await app.inject({ method: "GET", url: `${base}/${requestId}/impact`, headers: auth });
    await app.inject({ method: "POST", url: `${base}/${requestId}/answer`, headers: auth, payload: answer });
    await app.inject({ method: "GET", url: `${base}/my-shifts?start=2026-10-30&end=2026-10-30&from=09:00&to=24:00`, headers: auth });
    await app.inject({ method: "POST", url: `${base}/${requestId}/cancellation`, headers: auth, payload: askCancel });
    await app.inject({ method: "POST", url: `${base}/${cancellationId}/answer-cancellation`, headers: auth, payload: answerCancel });
    await app.inject({ method: "POST", url: `${base}/${requestId}/take-back`, headers: auth, payload: { ...takeBack, note: "  Short-staffed " } });
    const actor = { actorUserId: userId, workspaceId };
    expect(service.mine).toHaveBeenCalledExactlyOnceWith(actor);
    expect(service.ask).toHaveBeenCalledExactlyOnceWith({ ...actor, request: ask });
    expect(service.withdraw).toHaveBeenCalledExactlyOnceWith({ ...actor, requestId, expectedRevision: 1 });
    expect(service.list).toHaveBeenCalledExactlyOnceWith({ ...actor, query: { view: "open", sort: "starts", page: 2, page_size: 25, search: "ali" } });
    expect(service.impact).toHaveBeenCalledExactlyOnceWith({ ...actor, requestId });
    expect(service.answer).toHaveBeenCalledExactlyOnceWith({ ...actor, requestId, answer });
    expect(service.myShifts).toHaveBeenCalledExactlyOnceWith({ ...actor, query: { start: "2026-10-30", end: "2026-10-30", from: "09:00", to: "24:00" } });
    expect(service.askCancellation).toHaveBeenCalledExactlyOnceWith({ ...actor, requestId, request: askCancel });
    expect(service.answerCancellation).toHaveBeenCalledExactlyOnceWith({ ...actor, requestId: cancellationId, answer: answerCancel });
    expect(service.takeBack).toHaveBeenCalledExactlyOnceWith({ ...actor, requestId, takeBack });
    const smuggledCancel = await app.inject({ method: "POST", url: `${base}/${requestId}/cancellation`, headers: auth,
      payload: { ...askCancel, actor_user_id: spoofed } });
    expect(smuggledCancel.statusCode).toBe(400);
    const smuggledAnswer = await app.inject({ method: "POST", url: `${base}/${requestId}/answer`, headers: auth, payload: { ...answer, actor_user_id: spoofed } });
    expect(smuggledAnswer.statusCode).toBe(400);
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
    ["POST", `${base}/${requestId}/answer`, { ...answer, verdict: "maybe" }],
    ["POST", `${base}/${requestId}/answer`, { ...answer, expected_impact: null }],
    ["POST", `${base}/${requestId}/answer`, { ...answer, note: "x".repeat(1001) }],
    ["POST", `${base}/${requestId}/answer`, { ...answer, expected_revision: 0 }],
    ["POST", `${base}/not-an-id/answer`, answer],
    ["GET", `${base}/not-an-id/impact`, undefined],
    ["GET", `${base}?page_size=30`, undefined],
    ["GET", `${base}?sort=name`, undefined],
    ["GET", `${base}?location_id=somewhere`, undefined],
    ["GET", `${base}/my-shifts?start=2026-10-30`, undefined],
    ["GET", `${base}/my-shifts?start=2026-10-30&end=2026-10-31&from=09:00`, undefined],
    ["GET", `${base}/my-shifts?start=10/30/2026&end=2026-10-31`, undefined],
    ["POST", `${base}/${requestId}/cancellation`, { ...askCancel, note: "x".repeat(1001) }],
    ["POST", `${base}/${requestId}/cancellation`, { ...askCancel, client_key: "again" }],
    ["POST", `${base}/${requestId}/cancellation`, { note: null, client_key: askCancel.client_key }],
    ["POST", `${base}/not-an-id/cancellation`, askCancel],
    ["POST", `${base}/${cancellationId}/answer-cancellation`, { ...answerCancel, verdict: "maybe" }],
    ["POST", `${base}/${cancellationId}/answer-cancellation`, { ...answerCancel, expected_impact: "abc" }],
    ["POST", `${base}/not-an-id/answer-cancellation`, answerCancel],
    ["POST", `${base}/${requestId}/take-back`, { ...takeBack, note: "   " }],
    ["POST", `${base}/${requestId}/take-back`, { expected_revision: 2 }],
    ["POST", `${base}/${requestId}/take-back`, { ...takeBack, note: "x".repeat(1001) }],
    ["POST", `${base}/not-an-id/take-back`, takeBack],
  ] as const)("%s %s refuses a question it cannot read", async (method, url, payload) => {
    const service = serviceMock();
    const app = buildApp({ timeOffRequestsService: service, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    const response = await app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(400);
    expect(Object.values(service).every((fn) => vi.mocked(fn).mock.calls.length === 0)).toBe(true);
    await app.close();
  });

  it.each([
    ["PT409", "time_off.changed", 409],
    ["PT409", "time_off.not_pending", 409],
    ["22023", "time_off.invalid", 400],
    ["P0002", "time_off.not_found", 404],
    ["42501", "authz.rank", 403],
    ["42501", "authz.document_blocked", 403],
  ] as const)("passes an answer's %s %s through as %i with its reason", async (code, hint, status) => {
    const service = serviceMock();
    vi.mocked(service.answer).mockRejectedValue(rpcFailure({ message: "Refused", code, hint }));
    const app = buildApp({ timeOffRequestsService: service, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    const response = await app.inject({ method: "POST", url: `${base}/${requestId}/answer`, headers: auth, payload: answer });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ reason: hint });
    await app.close();
  });

  it("lets a decline go without a picture of the shifts", async () => {
    const service = serviceMock();
    const app = buildApp({ timeOffRequestsService: service, contextResolver: { resolve: async () => contextWith(["time_off.decide"]) } });
    const decline = { verdict: "decline", note: null, expected_revision: 1, expected_impact: null };
    const response = await app.inject({ method: "POST", url: `${base}/${requestId}/answer`, headers: auth, payload: decline });
    expect(response.statusCode).toBe(200);
    expect(service.answer).toHaveBeenCalledExactlyOnceWith({ actorUserId: userId, workspaceId, requestId, answer: decline });
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

  it.each([
    ["askCancellation", `${base}/${requestId}/cancellation`, askCancel, "PT409", "time_off.cancel_pending", 409],
    ["askCancellation", `${base}/${requestId}/cancellation`, askCancel, "PT409", "time_off.not_approved", 409],
    ["askCancellation", `${base}/${requestId}/cancellation`, askCancel, "PT409", "time_off.ended", 409],
    ["askCancellation", `${base}/${requestId}/cancellation`, askCancel, "PT409", "time_off.key_reused", 409],
    ["askCancellation", `${base}/${requestId}/cancellation`, askCancel, "42501", "authz.out_of_scope", 403],
    ["answerCancellation", `${base}/${cancellationId}/answer-cancellation`, answerCancel, "PT409", "time_off.not_pending", 409],
    ["answerCancellation", `${base}/${cancellationId}/answer-cancellation`, answerCancel, "42501", "authz.rank", 403],
    ["takeBack", `${base}/${requestId}/take-back`, takeBack, "22023", "time_off.note_required", 400],
    ["takeBack", `${base}/${requestId}/take-back`, takeBack, "PT409", "time_off.changed", 409],
    ["takeBack", `${base}/${requestId}/take-back`, takeBack, "P0002", "time_off.not_found", 404],
    ["takeBack", `${base}/${requestId}/take-back`, takeBack, "42501", "authz.rank", 403],
  ] as const)("D4 %s at %s passes %s %s through as %i", async (method, url, payload, code, hint, status) => {
    const service = serviceMock();
    vi.mocked(service[method]).mockRejectedValue(rpcFailure({ message: "Refused", code, hint }));
    const app = buildApp({ timeOffRequestsService: service, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    const response = await app.inject({ method: "POST", url, headers: auth, payload });
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
