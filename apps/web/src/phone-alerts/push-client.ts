import type { PushSubscriptionInput } from "@newfork/shared";
import { phoneAlertsSupport, readInstallEnv, type InstallEnv } from "./install-state";

// This browser's side of phone alerts (BILDIRIM-15). The browser asks the
// person once, from a tap; it then holds one subscription per site, whose
// address and keys the server keeps as this device. Everything here takes the
// window it works on, so each device can be tested.

/** Where this device stands, read without asking anything. */
export type PhoneAlertsState =
  | "unsupported"
  /** iPhone Safari or Chrome: alerts come only to the Home Screen app. */
  | "needs-install"
  /** Another iPhone browser, an app's own or an email app's: the way is through Safari. */
  | "other"
  /** The person said no in the browser; a page cannot ask again. */
  | "blocked"
  | "off"
  | "on";

export interface PushServer {
  save(input: PushSubscriptionInput): Promise<{ devices: number }>;
  remove(endpoint: string): Promise<{ devices: number }>;
}

type PushWindow = Window & { readonly Notification?: typeof Notification };

function base64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  let text = "";
  for (const byte of new Uint8Array(buffer)) text += String.fromCharCode(byte);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** The VAPID public key as the browser wants it. */
export function applicationServerKey(publicKey: string): Uint8Array<ArrayBuffer> {
  const padded = publicKey.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(publicKey.length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** What Account → Notifications calls this device: "iPhone · Home Screen app", "Chrome on Windows". */
export function deviceLabel(env: InstallEnv): string {
  const ua = env.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1);
  if (ios) return `${/iPad/.test(ua) || /Macintosh/.test(ua) ? "iPad" : "iPhone"}${env.standalone ? " · Home Screen app" : ""}`;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const system = /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux|CrOS/.test(ua) ? "Linux" : null;
  return system ? `${browser} on ${system}` : browser;
}

async function registration(win: Window): Promise<ServiceWorkerRegistration> {
  // The production build registers the worker at load (lib/service-worker.ts); elsewhere it is registered here.
  return (await win.navigator.serviceWorker.getRegistration("/")) ?? (await win.navigator.serviceWorker.register("/sw.js", { scope: "/" }));
}

async function existing(win: Window): Promise<PushSubscription | null> {
  if (!("serviceWorker" in win.navigator)) return null;
  const found = await win.navigator.serviceWorker.getRegistration("/");
  return found ? found.pushManager.getSubscription() : null;
}

/** Whether the browser's subscription was made with this server key; one made with an older key is refused. */
function madeWith(subscription: PushSubscription, publicKey: string): boolean {
  const held = subscription.options?.applicationServerKey;
  // A browser that does not say keeps what it has.
  if (!held) return true;
  const mine = applicationServerKey(publicKey);
  const theirs = new Uint8Array(held);
  return theirs.length === mine.length && theirs.every((byte, i) => byte === mine[i]);
}

/** This browser's subscription for this server key: the one it has, or a new one in place of an old key's. */
async function subscribed(worker: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
  const held = await worker.pushManager.getSubscription();
  if (held && madeWith(held, publicKey)) return held;
  // The old key's subscription answers 403 for ever; the server removes it once its push service says gone.
  if (held) await held.unsubscribe();
  return worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
}

function input(subscription: PushSubscription, win: Window): PushSubscriptionInput {
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: base64Url(subscription.getKey("p256dh")), auth: base64Url(subscription.getKey("auth")) },
    label: deviceLabel(readInstallEnv(win)),
  };
}

export async function readPhoneAlertsState(win: PushWindow = window): Promise<PhoneAlertsState> {
  const support = phoneAlertsSupport(readInstallEnv(win));
  if (support.kind === "unsupported") return "unsupported";
  if (support.kind === "needs-install") return "needs-install";
  if (support.kind === "other-browser") return "other";
  const permission = win.Notification?.permission ?? "default";
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";
  return (await existing(win)) ? "on" : "off";
}

/**
 * Asks the browser (call it straight from the tap: iPhone asks only from one), subscribes this device with
 * the server's public key and saves it. A "no" is "blocked"; closing the prompt leaves it "off".
 */
export async function turnOnPhoneAlerts(publicKey: string, server: PushServer, win: PushWindow = window): Promise<PhoneAlertsState> {
  const permission = await win.Notification!.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";
  const subscription = await subscribed(await registration(win), publicKey);
  await server.save(input(subscription, win));
  return "on";
}

/**
 * Removes this device on the server, then in the browser. The browser forgets it even when the server
 * cannot be told: nothing more reaches this screen, and the server drops the address once it is gone.
 */
export async function turnOffPhoneAlerts(server: PushServer, win: Window = window): Promise<void> {
  const subscription = await existing(win);
  if (!subscription) return;
  try {
    await server.remove(subscription.endpoint);
  } finally {
    await subscription.unsubscribe();
  }
}

/** A session that ended (expired, or signed out elsewhere): this browser forgets the device, asking nobody. */
export async function dropPhoneAlertsHere(win: Window = window): Promise<void> {
  try {
    await (await existing(win))?.unsubscribe();
  } catch {
    // Nothing to forget.
  }
}

/**
 * At every start while alerts are allowed: tells the server this device again, so a subscription the
 * browser replaced, or one the server forgot, comes back; one made with an older server key is made anew.
 * Never asks anything; never throws.
 */
export async function syncPhoneAlerts(server: PushServer, publicKey: string, win: PushWindow = window): Promise<void> {
  try {
    if (win.Notification?.permission !== "granted" || !("serviceWorker" in win.navigator)) return;
    const worker = await win.navigator.serviceWorker.getRegistration("/");
    if (!worker || !(await worker.pushManager.getSubscription())) return;
    await server.save(input(await subscribed(worker, publicKey), win));
  } catch {
    // The next start tries again.
  }
}
