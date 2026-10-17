import { describe, expect, it } from "vitest";
import {
  isPushEndpoint,
  notificationChannelsConfigSchema,
  pushDevicesSchema,
  pushSubscriptionInputSchema,
  pushSubscriptionRemoveSchema,
} from "./push-alerts";

// Phone alerts (BILDIRIM-15): our server posts to the address a browser hands
// it, so only the four push services' are taken, exactly as the database's
// app_private.push_endpoint_ok takes them.
const keys = { p256dh: "B" + "p".repeat(86), auth: "a".repeat(22) };

describe("push service addresses", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:APA91b-x_y",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAA-x_y",
    "https://web.push.apple.com/QGuQyavXutnMH_x",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB%2bx",
  ])("takes %s", (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com.evil.com/fcm/send/x",
    "https://fcm.googleapis.com@evil.com/fcm/send/x",
    "https://user@fcm.googleapis.com/fcm/send/x",
    "https://user:pw@fcm.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com:443/fcm/send/x",
    "https://142.250.80.10/fcm/send/x",
    "https://[2607:f8b0::200a]/fcm/send/x",
    "https://evilpush.apple.com/x",
    "https://web.push.apple.com.evil.com/x",
    "https://push.apple.com/x",
    "https://updates.push.services.mozilla.com.evil.com/wpush/v2/x",
    "https://push.services.mozilla.com/wpush/v2/x",
    "https://FCM.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com/",
    "https://fcm.googleapis.com",
    "https://fcm.googleapis.com/fcm/send/x y",
    "https://fcm.googleapis.com/fcm/send/x\n",
    "https://fcm.googleapis.com\\@evil.com/x",
    "https://fcm.googleapis.com/x#frag",
    "https://example.com/fcm.googleapis.com/x",
    "https://" + "a".repeat(2000) + ".notify.windows.com/x",
  ])("refuses %s", (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(false);
  });
});

describe("push subscription shapes", () => {
  it("takes a browser's subscription and a device name", () => {
    const input = { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys, label: "Chrome on Windows" };
    expect(pushSubscriptionInputSchema.parse(input)).toEqual(input);
  });

  it("refuses a lookalike address, keys of another shape and anything extra", () => {
    expect(pushSubscriptionInputSchema.safeParse({ endpoint: "https://fcm.googleapis.com.evil.com/x", keys, label: null }).success).toBe(false);
    expect(pushSubscriptionInputSchema.safeParse({ endpoint: "https://fcm.googleapis.com/x", keys: { ...keys, auth: "a=" }, label: null }).success).toBe(false);
    expect(pushSubscriptionInputSchema.safeParse({ endpoint: "https://fcm.googleapis.com/x", keys, label: "Phone\n" }).success).toBe(false);
    expect(pushSubscriptionInputSchema.safeParse({ endpoint: "https://fcm.googleapis.com/x", keys, label: null, user_id: "x" }).success).toBe(false);
  });

  it("removes by address only", () => {
    expect(pushSubscriptionRemoveSchema.parse({ endpoint: "https://fcm.googleapis.com/fcm/send/x" })).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/x",
    });
    expect(pushDevicesSchema.parse({ devices: 2 })).toEqual({ devices: 2 });
  });

  it("says which channels the server can send on", () => {
    const config = { email: { available: true }, push: { available: true, public_key: "B" + "k".repeat(86) } };
    expect(notificationChannelsConfigSchema.parse(config)).toEqual(config);
    expect(notificationChannelsConfigSchema.safeParse({ ...config, push: { available: true, public_key: null } }).success).toBe(false);
    expect(notificationChannelsConfigSchema.parse({ ...config, push: { available: false, public_key: null } }).push.available).toBe(false);
  });
});
