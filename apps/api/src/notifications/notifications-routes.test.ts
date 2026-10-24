import Fastify from "fastify";
import { authzActionKeys, permissionSchema, type ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import { rpcFailure } from "../http-error";
import { registerNotificationRoutes } from "./notifications-routes";
import { encodeNotificationCursor } from "./notifications-cursor";
import type { NotificationsService } from "./notifications-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const rowId = "13253395-6150-43b9-bb13-364014baae15";

const member = {
  userId,
  workspace: {
    id: workspaceId,
    name: "Meyhouse",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
  membership: {
    id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
    userId,
    workspaceId,
    access: { employee: true, management: null },
    status: "active",
  },
  permissions: [...permissionSchema.options],
  actions: [...authzActionKeys],
  onboarding: { status: "complete", currentStep: 2, revision: 1 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: false, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const page = { items: [], has_more: false, next_cursor: null, unseen_count: 2, unread_count: 3, needs_action_count: 1 };

function serviceMock(): NotificationsService {
  return {
    feed: vi.fn(async () => page),
    counts: vi.fn(async () => ({ unseen_count: 2, unread_count: 3, needs_action_count: 1 })),
    markSeen: vi.fn(async () => ({ unseen_count: 0 })),
    markRead: vi.fn(async () => ({ updated: 1, unread_count: 2 })),
    markUnread: vi.fn(async () => ({ updated: 1, unread_count: 4 })),
  };
}

function appWith(service: NotificationsService, context: ActiveWorkspaceContext | Error = member) {
  return buildApp({
    contextResolver: {
      resolve: async () => {
        if (context instanceof Error) throw context;
        return context;
      },
    },
    notificationsService: service,
  });
}

const w = `/v1/workspaces/${workspaceId}/notifications`;
const auth = { authorization: "Bearer token" };
const actor = { actorUserId: userId, workspaceId };

describe("notification routes", () => {
  it("reads a page with its filter, cursor and size", async () => {
    const service = serviceMock();
    const last = { at: "2026-10-16T16:38:10.2327+00:00", id: rowId };
    const before = encodeNotificationCursor(last);
    const response = await appWith(service).inject({
      method: "GET", url: `${w}?filter=needs_action&before=${encodeURIComponent(before)}&limit=5`, headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(page);
    expect(service.feed).toHaveBeenCalledWith({ ...actor, query: { filter: "needs_action", before: last, limit: 5 } });
  });

  it("answers the badge count", async () => {
    const service = serviceMock();
    const response = await appWith(service).inject({ method: "GET", url: `${w}/count`, headers: auth });
    expect(response.json()).toEqual({ unseen_count: 2, unread_count: 3, needs_action_count: 1 });
    expect(service.counts).toHaveBeenCalledWith(actor);
  });

  it("marks the list seen", async () => {
    const service = serviceMock();
    const response = await appWith(service).inject({ method: "POST", url: `${w}/seen`, headers: auth });
    expect(response.json()).toEqual({ unseen_count: 0 });
    expect(service.markSeen).toHaveBeenCalledWith(actor);
  });

  it("reads rows by id, or all of them", async () => {
    const service = serviceMock();
    const app = appWith(service);
    expect((await app.inject({ method: "POST", url: `${w}/read`, headers: auth, payload: { ids: [rowId] } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `${w}/read`, headers: auth, payload: { all: true } })).statusCode).toBe(200);
    expect(service.markRead).toHaveBeenNthCalledWith(1, { ...actor, read: { ids: [rowId] } });
    expect(service.markRead).toHaveBeenNthCalledWith(2, { ...actor, read: { all: true } });
  });

  it("marks rows unread again by id (S-251)", async () => {
    const service = serviceMock();
    const response = await appWith(service).inject({ method: "POST", url: `${w}/unread`, headers: auth, payload: { ids: [rowId] } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ updated: 1, unread_count: 4 });
    expect(service.markUnread).toHaveBeenCalledWith({ ...actor, unread: { ids: [rowId] } });
  });

  it.each([
    ["no body", undefined],
    ["an empty body", {}],
    ["no ids", { ids: [] }],
    ["a bad id", { ids: ["not-a-uuid"] }],
    ["all of them", { all: true }],
    ["more than 100 ids", { ids: Array.from({ length: 101 }, () => rowId) }],
  ] as const)("refuses to mark unread with %s, with 400 and never asks the core", async (_name, payload) => {
    const service = serviceMock();
    const response = await appWith(service).inject({ method: "POST", url: `${w}/unread`, headers: auth, payload });
    expect(response.statusCode).toBe(400);
    expect(service.markUnread).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", `${w}?filter=archived`, undefined],
    ["GET", `${w}?limit=0`, undefined],
    ["GET", `${w}?before=yesterday`, undefined],
    ["GET", `${w}?before=${encodeURIComponent("2026-10-16T16:38:10+00:00")}`, undefined],
    ["POST", `${w}/read`, {}],
    ["POST", `${w}/read`, { ids: ["not-a-uuid"] }],
    ["GET", "/v1/workspaces/not-a-uuid/notifications", undefined],
  ] as const)("refuses %s %s with 400 and never asks the core", async (method, url, payload) => {
    const service = serviceMock();
    const response = await appWith(service).inject({ method, url, headers: auth, payload });
    expect(response.statusCode).toBe(400);
    expect(service.feed).not.toHaveBeenCalled();
    expect(service.markRead).not.toHaveBeenCalled();
  });

  it("answers a stranger with 404 before reading the body", async () => {
    const service = serviceMock();
    const notMember = rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.not_member" });
    const response = await appWith(service, notMember).inject({ method: "POST", url: `${w}/read`, headers: auth, payload: {} });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ reason: "authz.not_member" });
    expect(service.markRead).not.toHaveBeenCalled();
  });

  it("answers a stranger marking unread with 404 before reading the body", async () => {
    const service = serviceMock();
    const notMember = rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.not_member" });
    const response = await appWith(service, notMember).inject({ method: "POST", url: `${w}/unread`, headers: auth, payload: {} });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ reason: "authz.not_member" });
    expect(service.markUnread).not.toHaveBeenCalled();
  });

  it("answers someone without notifications.read_own marking unread with 403", async () => {
    const service = serviceMock();
    const without = { ...member, actions: member.actions.filter((action) => action !== "notifications.read_own") };
    const response = await appWith(service, without).inject({ method: "POST", url: `${w}/unread`, headers: auth, payload: { ids: [rowId] } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.out_of_scope", detail: "notifications.read_own" });
    expect(service.markUnread).not.toHaveBeenCalled();
  });

  it("keeps the core's refusal of an unread mark: 404 for a stranger, 403 otherwise", async () => {
    const service = serviceMock();
    vi.mocked(service.markUnread)
      .mockRejectedValueOnce(rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.not_member" }))
      .mockRejectedValueOnce(rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.not_active" }));
    const app = appWith(service);
    const send = () => app.inject({ method: "POST", url: `${w}/unread`, headers: auth, payload: { ids: [rowId] } });
    const stranger = await send();
    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toMatchObject({ reason: "authz.not_member" });
    const inactive = await send();
    expect(inactive.statusCode).toBe(403);
    expect(inactive.json()).toMatchObject({ reason: "authz.not_active" });
  });

  it("answers someone without notifications.read_own with 403", async () => {
    const service = serviceMock();
    const without = { ...member, actions: member.actions.filter((action) => action !== "notifications.read_own") };
    const response = await appWith(service, without).inject({ method: "GET", url: w, headers: auth });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.out_of_scope", detail: "notifications.read_own" });
    expect(service.feed).not.toHaveBeenCalled();
  });

  it("keeps the core's 403 for a row the person may not read", async () => {
    const service = serviceMock();
    vi.mocked(service.markRead).mockRejectedValue(rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.out_of_scope" }));
    const response = await appWith(service).inject({ method: "POST", url: `${w}/read`, headers: auth, payload: { all: true } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.out_of_scope" });
  });

  it("asks for a session", async () => {
    const response = await appWith(serviceMock()).inject({ method: "GET", url: w });
    expect(response.statusCode).toBe(401);
  });

  it("says when the service is not configured", async () => {
    const app = Fastify();
    registerNotificationRoutes(app, { service: null, contextResolver: { resolve: async () => member } });
    const response = await app.inject({ method: "GET", url: `${w}/count`, headers: auth });
    expect(response.statusCode).toBe(503);
  });
});
