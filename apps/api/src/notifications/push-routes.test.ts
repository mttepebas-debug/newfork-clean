import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { notificationChannelsConfigFromEnvironment } from "./channel-config";
import { registerNotificationPushRoutes, type PushSubscriptionService } from "./push-routes";

// BILDIRIM-15: a signed-in person saves and removes their own devices (account-wide, no workspace); every screen asks which channels the server can
// send on, so none promises what is not set up.
const publicKey = "B" + "k".repeat(86);
const keys = { p256dh: "B" + "p".repeat(86), auth: "a".repeat(22) };
const endpoint = "https://fcm.googleapis.com/fcm/send/abc";

function build(options: { pushAvailable?: boolean } = {}) {
  const service: PushSubscriptionService = {
    save: vi.fn(async () => ({ devices: 1 })),
    remove: vi.fn(async () => ({ devices: 0 })),
  };
  const app = Fastify();
  registerNotificationPushRoutes(app, {
    service,
    // A session the auth server knows; any other token is signed out.
    verifySession: async (token: string) => token === "t",
    config: () => ({
      email: { available: true },
      push: options.pushAvailable === false ? { available: false, public_key: null } : { available: true, public_key: publicKey },
    }),
  });
  return { app, service };
}

describe("a person's devices", () => {
  it("says which channels the server can send on, to a signed-in person", async () => {
    const { app } = build();
    expect((await app.inject({ method: "GET", url: "/v1/account/notification-channels" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/v1/account/notification-channels", headers: { authorization: "Bearer expired" } })).statusCode).toBe(401);
    const response = await app.inject({ method: "GET", url: "/v1/account/notification-channels", headers: { authorization: "Bearer t" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: { available: true }, push: { available: true, public_key: publicKey } });
    await app.close();
  });

  it("saves this device for the person whose session it is", async () => {
    const { app, service } = build();
    const response = await app.inject({
      method: "PUT",
      url: "/v1/account/push-subscription",
      headers: { authorization: "Bearer t" },
      payload: { endpoint, keys, label: "Chrome on Windows" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ devices: 1 });
    expect(service.save).toHaveBeenCalledWith("t", { endpoint, keys, label: "Chrome on Windows" });
    await app.close();
  });

  it("refuses without a session, a lookalike address, or before phone alerts are set up", async () => {
    const { app, service } = build();
    expect((await app.inject({ method: "PUT", url: "/v1/account/push-subscription", payload: { endpoint, keys, label: null } })).statusCode).toBe(401);
    expect((await app.inject({
      method: "PUT",
      url: "/v1/account/push-subscription",
      headers: { authorization: "Bearer t" },
      payload: { endpoint: "https://fcm.googleapis.com.evil.com/x", keys, label: null },
    })).statusCode).toBe(400);
    expect(service.save).not.toHaveBeenCalled();
    await app.close();

    const off = build({ pushAvailable: false });
    expect((await off.app.inject({
      method: "PUT",
      url: "/v1/account/push-subscription",
      headers: { authorization: "Bearer t" },
      payload: { endpoint, keys, label: null },
    })).statusCode).toBe(503);
    expect(off.service.save).not.toHaveBeenCalled();
    await off.app.close();
  });

  it("removes this device by its address in the body, never the URL", async () => {
    const { app, service } = build({ pushAvailable: false });
    const response = await app.inject({
      method: "DELETE",
      url: "/v1/account/push-subscription",
      headers: { authorization: "Bearer t" },
      payload: { endpoint },
    });
    // Turning off works even when sending is not set up.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ devices: 0 });
    expect(service.remove).toHaveBeenCalledWith("t", endpoint);
    expect((await app.inject({ method: "DELETE", url: "/v1/account/push-subscription", headers: { authorization: "Bearer t" }, payload: {} })).statusCode).toBe(400);
    await app.close();
  });
});

describe("which channels the server can send on", () => {
  const vapid = { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: "p".repeat(43), VAPID_SUBJECT: "mailto:alerts@newfork.test" };

  it("email once Resend's key and sender are set", () => {
    expect(notificationChannelsConfigFromEnvironment({}).email.available).toBe(false);
    expect(notificationChannelsConfigFromEnvironment({ RESEND_API_KEY: "re_x" }).email.available).toBe(false);
    expect(notificationChannelsConfigFromEnvironment({ RESEND_API_KEY: "re_x", EMPLOYEE_INVITE_FROM: "Newfork <n@x.test>" }).email.available).toBe(true);
  });

  it("phone alerts once the three VAPID values are set and well formed", () => {
    expect(notificationChannelsConfigFromEnvironment(vapid).push).toEqual({ available: true, public_key: publicKey });
    expect(notificationChannelsConfigFromEnvironment({ ...vapid, VAPID_SUBJECT: undefined }).push).toEqual({ available: false, public_key: null });
    expect(notificationChannelsConfigFromEnvironment({ ...vapid, VAPID_SUBJECT: "alerts@newfork.test" }).push.available).toBe(false);
    expect(notificationChannelsConfigFromEnvironment({ ...vapid, VAPID_PUBLIC_KEY: "short" }).push.available).toBe(false);
    expect(notificationChannelsConfigFromEnvironment({ ...vapid, VAPID_PRIVATE_KEY: "" }).push.available).toBe(false);
    expect(notificationChannelsConfigFromEnvironment({ ...vapid, VAPID_SUBJECT: "https://newfork.test" }).push.available).toBe(true);
  });
});
