import {
  authzActionKeys,
  type ActiveWorkspaceContext,
  type AuthzAction,
  type NotificationPreferences,
  type NotificationWorkspaceSettings,
} from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import { rpcFailure } from "../http-error";
import type { NotificationSettingsService } from "./notification-settings-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
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
    membership: { id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4", userId, workspaceId, role: "owner", status: "active", allLocations: true },
    permissions: [],
    actions: [...actions],
    onboarding: { status: "complete", currentStep: 2 },
    documentAccess: { restricted: false },
    locationScope: { allLocations: true, locationIds: [] },
  };
}

const preferences: NotificationPreferences = {
  channels: {
    in_app: { locked: true },
    email: { workspace_enabled: true, address_on_file: true, suppressed: false },
    push: { workspace_enabled: true, devices: 0 },
    sms: { available: false, workspace_enabled: false },
  },
  topics: [{ key: "time_off", name: "Time off", email: { choice: null, default: true }, push: { choice: null, default: true } }],
};

const settings: NotificationWorkspaceSettings = {
  email_enabled: true,
  push_enabled: true,
  sms_enabled: false,
  sms_available: false,
  optional: [{ key: "people.joined", area: "people", description: "Somebody you invited joined", enabled: true }],
  always_sent: [{ key: "time_off.requested", area: "time_off", level: "important", description: "Somebody asked for time off" }],
};

function serviceMock(): NotificationSettingsService {
  return {
    readPreferences: vi.fn().mockResolvedValue(preferences),
    savePreferences: vi.fn().mockResolvedValue(preferences),
    readWorkspaceSettings: vi.fn().mockResolvedValue(settings),
    saveWorkspaceSettings: vi.fn().mockResolvedValue(settings),
  };
}

const prefsUrl = `/v1/workspaces/${workspaceId}/notification-preferences`;
const settingsUrl = `/v1/workspaces/${workspaceId}/settings/notifications`;
const auth = { authorization: "Bearer valid-token" };
const choices = { choices: [{ topic: "time_off", channel: "email", enabled: false }] };
const workspaceBody = { email_enabled: false, push_enabled: true, muted_types: ["people.joined"] };

// Each route, the action the core must have listed for it, and a valid body.
const routes = [
  ["GET", prefsUrl, "notifications.read_own", undefined],
  ["PUT", prefsUrl, "notifications.write_own", choices],
  ["GET", settingsUrl, "settings.organization.write", undefined],
  ["PUT", settingsUrl, "settings.organization.write", workspaceBody],
] as const;

describe("notification settings routes", () => {
  it.each(routes)("%s %s answers with what the database answers", async (method, url, action, payload) => {
    const service = serviceMock();
    const app = buildApp({ notificationSettingsService: service, contextResolver: { resolve: async () => contextWith([action]) } });
    const response = await app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(url === prefsUrl ? preferences : settings);
    await app.close();
  });

  it.each(routes)("%s %s is refused without its action", async (method, url, action, payload) => {
    const service = serviceMock();
    const others = authzActionKeys.filter((key) => key !== action);
    const app = buildApp({ notificationSettingsService: service, contextResolver: { resolve: async () => contextWith(others) } });
    const response = await app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.out_of_scope", detail: action });
    expect(Object.values(service).every((fn) => vi.mocked(fn).mock.calls.length === 0)).toBe(true);
    await app.close();
  });

  it.each(routes)("%s %s answers a non-member with 404", async (method, url, action, payload) => {
    const service = serviceMock();
    const app = buildApp({
      notificationSettingsService: service,
      contextResolver: { resolve: async () => ({ ...contextWith([action]), workspace: { ...contextWith([]).workspace, id: otherWorkspaceId } }) },
    });
    const response = await app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ reason: "authz.not_member" });
    await app.close();
  });

  it("asks for a session before anything else", async () => {
    const app = buildApp({ notificationSettingsService: serviceMock(), contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    const response = await app.inject({ method: "GET", url: prefsUrl });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("binds the person and the workspace from the token and the address, never the body", async () => {
    const service = serviceMock();
    const app = buildApp({ notificationSettingsService: service, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    await app.inject({ method: "GET", url: prefsUrl, headers: auth });
    await app.inject({ method: "PUT", url: prefsUrl, headers: auth, payload: choices });
    await app.inject({ method: "GET", url: settingsUrl, headers: auth });
    await app.inject({ method: "PUT", url: settingsUrl, headers: auth, payload: workspaceBody });
    const actor = { actorUserId: userId, workspaceId };
    expect(service.readPreferences).toHaveBeenCalledExactlyOnceWith(actor);
    expect(service.savePreferences).toHaveBeenCalledExactlyOnceWith({ ...actor, choices: choices.choices });
    expect(service.readWorkspaceSettings).toHaveBeenCalledExactlyOnceWith(actor);
    expect(service.saveWorkspaceSettings).toHaveBeenCalledExactlyOnceWith({ ...actor, settings: workspaceBody });
    // A body that names somebody else is not a valid body.
    const smuggled = await app.inject({ method: "PUT", url: prefsUrl, headers: auth, payload: { ...choices, actor_user_id: spoofed } });
    expect(smuggled.statusCode).toBe(400);
    await app.close();
  });

  it.each([
    ["PUT", prefsUrl, { choices: [] }],
    ["PUT", prefsUrl, { choices: [{ topic: "time_off", channel: "sms", enabled: true }] }],
    ["PUT", settingsUrl, { ...workspaceBody, sms_enabled: true }],
    ["PUT", settingsUrl, { email_enabled: "yes", push_enabled: true, muted_types: [] }],
  ] as const)("%s %s refuses a body it cannot read", async (method, url, payload) => {
    const service = serviceMock();
    const app = buildApp({ notificationSettingsService: service, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    const response = await app.inject({ method, url, headers: auth, payload });
    expect(response.statusCode).toBe(400);
    expect(service.savePreferences).not.toHaveBeenCalled();
    expect(service.saveWorkspaceSettings).not.toHaveBeenCalled();
    await app.close();
  });

  it("passes the database's refusal through with its reason", async () => {
    const service = serviceMock();
    vi.mocked(service.savePreferences).mockRejectedValue(
      rpcFailure({ message: "this topic is not a choice", code: "22023", hint: "notifications.topic_locked" }),
    );
    const app = buildApp({ notificationSettingsService: service, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    const response = await app.inject({ method: "PUT", url: prefsUrl, headers: auth, payload: choices });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ reason: "notifications.topic_locked" });
    await app.close();
  });

  it("says so when the database is not configured", async () => {
    const app = buildApp({ notificationSettingsService: null, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    const response = await app.inject({ method: "GET", url: prefsUrl, headers: auth });
    expect(response.statusCode).toBe(503);
    await app.close();
  });
});
