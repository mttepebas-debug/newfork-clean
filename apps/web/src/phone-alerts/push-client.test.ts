import { describe, expect, it, vi } from "vitest";
import {
  applicationServerKey,
  deviceLabel,
  dropPhoneAlertsHere,
  readPhoneAlertsState,
  syncPhoneAlerts,
  turnOffPhoneAlerts,
  turnOnPhoneAlerts,
} from "./push-client";
import type { InstallEnv } from "./install-state";

// BILDIRIM-15: this browser's side of phone alerts, against a fake browser.
const chromeWindows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const iphoneSafari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const publicKey = "BMrl6GP3sbnxj3ja-qHzuk2nqqdq1hInECTnvMVnrvA6ACgNuMRuq1-RAiNfhYgHuf-8o6kDQhWmqOXKt7c4eLw";
const endpoint = "https://fcm.googleapis.com/fcm/send/abc";

const oldKey = "B" + "o".repeat(86);

function fakeWindow(
  options: { ua?: string; permission?: NotificationPermission; answer?: NotificationPermission; subscribed?: boolean; registered?: boolean; key?: string } = {},
) {
  let subscription: PushSubscription | null = null;
  const unsubscribe = vi.fn(async () => {
    subscription = null;
    return true;
  });
  const make = (key: ArrayBuffer) =>
    ({
      endpoint,
      options: { userVisibleOnly: true, applicationServerKey: key },
      getKey: (name: string) => new Uint8Array(name === "p256dh" ? 65 : 16).fill(name === "p256dh" ? 4 : 7).buffer,
      unsubscribe,
    }) as unknown as PushSubscription;
  if (options.subscribed) subscription = make(applicationServerKey(options.key ?? publicKey).buffer);
  const pushManager = {
    getSubscription: vi.fn(async () => subscription),
    subscribe: vi.fn(async (init: PushSubscriptionOptionsInit) => {
      subscription = make((init.applicationServerKey as Uint8Array<ArrayBuffer>).buffer);
      return subscription;
    }),
  };
  const worker = { pushManager } as unknown as ServiceWorkerRegistration;
  const serviceWorker = {
    getRegistration: vi.fn(async () => (options.registered === false ? undefined : worker)),
    register: vi.fn(async () => worker),
  };
  const notification = {
    permission: options.permission ?? "default",
    requestPermission: vi.fn(async () => options.answer ?? "granted"),
  };
  const win = {
    navigator: { userAgent: options.ua ?? chromeWindows, maxTouchPoints: 0, serviceWorker },
    isSecureContext: true,
    matchMedia: () => ({ matches: false }),
    PushManager: function PushManager() {},
    Notification: notification,
  } as unknown as Window;
  return { win, pushManager, serviceWorker, notification, unsubscribe };
}

function server() {
  return { save: vi.fn(async () => ({ devices: 1 })), remove: vi.fn(async () => ({ devices: 0 })) };
}

describe("phone alerts in this browser", () => {
  it("reads where this device stands without asking", async () => {
    expect(await readPhoneAlertsState(fakeWindow().win)).toBe("off");
    expect(await readPhoneAlertsState(fakeWindow({ permission: "denied" }).win)).toBe("blocked");
    expect(await readPhoneAlertsState(fakeWindow({ permission: "granted", subscribed: true }).win)).toBe("on");
    expect(await readPhoneAlertsState(fakeWindow({ permission: "granted" }).win)).toBe("off");
    const iphone = fakeWindow({ ua: iphoneSafari });
    delete (iphone.win as { PushManager?: unknown }).PushManager;
    expect(await readPhoneAlertsState(iphone.win)).toBe("needs-install");
  });

  it("turns on: asks, subscribes with the server's key, and saves this device", async () => {
    const browser = fakeWindow({ registered: false });
    const api = server();
    expect(await turnOnPhoneAlerts(publicKey, api, browser.win)).toBe("on");
    expect(browser.notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(browser.serviceWorker.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    const options = (browser.pushManager.subscribe.mock.calls[0] as unknown as [PushSubscriptionOptionsInit])[0];
    expect(options.userVisibleOnly).toBe(true);
    expect(Array.from(options.applicationServerKey as Uint8Array)).toEqual(Array.from(applicationServerKey(publicKey)));
    expect(api.save).toHaveBeenCalledWith({
      endpoint,
      keys: { p256dh: "BAQE".repeat(21) + "BAQ", auth: "BwcHBwcHBwcHBwcHBwcHBw" },
      label: "Chrome on Windows",
    });
  });

  it("a no in the browser is blocked, closing the prompt stays off, and nothing is saved", async () => {
    const api = server();
    expect(await turnOnPhoneAlerts(publicKey, api, fakeWindow({ answer: "denied" }).win)).toBe("blocked");
    expect(await turnOnPhoneAlerts(publicKey, api, fakeWindow({ answer: "default" }).win)).toBe("off");
    expect(api.save).not.toHaveBeenCalled();
  });

  it("turns off: the server forgets this device, then the browser does", async () => {
    const browser = fakeWindow({ permission: "granted", subscribed: true });
    const api = server();
    await turnOffPhoneAlerts(api, browser.win);
    expect(api.remove).toHaveBeenCalledWith(endpoint);
    expect(browser.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("turning off forgets this device in the browser even when the server cannot be reached", async () => {
    const browser = fakeWindow({ permission: "granted", subscribed: true });
    const api = server();
    api.remove.mockRejectedValueOnce(new Error("offline"));
    await expect(turnOffPhoneAlerts(api, browser.win)).rejects.toThrow("offline");
    expect(browser.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("a session that ends forgets this device in the browser, asking nobody", async () => {
    const browser = fakeWindow({ permission: "granted", subscribed: true });
    await dropPhoneAlertsHere(browser.win);
    expect(browser.unsubscribe).toHaveBeenCalledTimes(1);
    await expect(dropPhoneAlertsHere(fakeWindow().win)).resolves.toBeUndefined();
  });

  it("a subscription made with an old server key is replaced, on Turn on and at start", async () => {
    const atStart = fakeWindow({ permission: "granted", subscribed: true, key: oldKey });
    const api = server();
    await syncPhoneAlerts(api, publicKey, atStart.win);
    expect(atStart.unsubscribe).toHaveBeenCalledTimes(1);
    expect(atStart.pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledTimes(1);

    const same = fakeWindow({ permission: "granted", subscribed: true });
    await syncPhoneAlerts(api, publicKey, same.win);
    expect(same.unsubscribe).not.toHaveBeenCalled();
    expect(same.pushManager.subscribe).not.toHaveBeenCalled();

    const tapped = fakeWindow({ subscribed: true, key: oldKey, answer: "granted" });
    expect(await turnOnPhoneAlerts(publicKey, api, tapped.win)).toBe("on");
    expect(tapped.unsubscribe).toHaveBeenCalledTimes(1);
    expect(tapped.pushManager.subscribe).toHaveBeenCalledTimes(1);
  });

  it("at every start while allowed, tells the server this device again, and never asks", async () => {
    const browser = fakeWindow({ permission: "granted", subscribed: true });
    const api = server();
    await syncPhoneAlerts(api, publicKey, browser.win);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(browser.notification.requestPermission).not.toHaveBeenCalled();
    const asked = fakeWindow();
    await syncPhoneAlerts(api, publicKey, asked.win);
    expect(api.save).toHaveBeenCalledTimes(1);
    api.save.mockRejectedValueOnce(new Error("offline"));
    await expect(syncPhoneAlerts(api, publicKey, browser.win)).resolves.toBeUndefined();
  });

  it("names the device plainly", () => {
    const env = (userAgent: string, standalone = false): InstallEnv => ({
      userAgent,
      maxTouchPoints: /iPhone/.test(userAgent) ? 5 : 0,
      standalone,
      secure: true,
      serviceWorker: true,
      pushManager: true,
      notification: true,
    });
    expect(deviceLabel(env(chromeWindows))).toBe("Chrome on Windows");
    expect(deviceLabel(env(iphoneSafari, true))).toBe("iPhone · Home Screen app");
    expect(deviceLabel(env("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"))).toBe(
      "Chrome on Android",
    );
    expect(deviceLabel(env("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5; rv:131.0) Gecko/20100101 Firefox/131.0"))).toBe("Firefox on Mac");
  });
});
