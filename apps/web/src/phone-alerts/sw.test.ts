import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

// BILDIRIM-15: the service worker (public/sw.js) shows every alert it gets and opens its screen inside the
// app. It is plain JavaScript with no build step, so it runs here against a fake worker scope.
const source = readFileSync(fileURLToPath(new URL("../../public/sw.js", import.meta.url)), "utf8");
const origin = "https://app.newfork.test";

type Listener = (event: Record<string, unknown>) => void;

function load(clients: { url: string; focused?: boolean }[] = []) {
  const listeners = new Map<string, Listener>();
  const shown: { title: string; options: NotificationOptions }[] = [];
  const windows = clients.map((client) => ({
    url: client.url,
    focus: vi.fn(async function (this: unknown) {
      return this;
    }),
    postMessage: vi.fn(),
  }));
  const scope = {
    location: { origin },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async (title: string, options: NotificationOptions) => void shown.push({ title, options })) },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async () => null),
    },
  };
  new Function("self", source)(scope);
  async function fire(type: string, event: Record<string, unknown>) {
    let waiting: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ ...event, waitUntil: (promise: Promise<unknown>) => (waiting = promise) });
    await waiting;
  }
  return { scope, shown, windows, fire };
}

function pushEvent(body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { data: { text: () => text, json: () => JSON.parse(text) } };
}

const declarative = {
  web_push: 8030,
  notification: { title: "Your Wed, Oct 21 shift changed", body: "Harbor & Vine · Now 9:00 AM–3:00 PM.", navigate: `${origin}/app/employee-hub/schedule`, tag: "n-1" },
};

describe("the service worker", () => {
  it("shows the alert it gets, folded under its tag, linked to its screen", async () => {
    const worker = load();
    await worker.fire("push", pushEvent(declarative));
    expect(worker.shown).toEqual([
      {
        title: "Your Wed, Oct 21 shift changed",
        options: {
          body: "Harbor & Vine · Now 9:00 AM–3:00 PM.",
          tag: "n-1",
          renotify: false,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          lang: "en-US",
          data: { url: "/app/employee-hub/schedule" },
        },
      },
    ]);
  });

  it("shows something for every push, even one it cannot read", async () => {
    const worker = load();
    await worker.fire("push", pushEvent("not json"));
    await worker.fire("push", { data: null });
    expect(worker.shown.map((alert) => [alert.title, alert.options.data])).toEqual([
      ["New notification", { url: "/app" }],
      ["New notification", { url: "/app" }],
    ]);
  });

  it("never links outside the app", async () => {
    const worker = load();
    for (const navigate of ["https://evil.example/app", "//evil.example/x", "javascript:alert(1)", `${origin}//evil.example`, `${origin}/\\evil`]) {
      await worker.fire("push", pushEvent({ ...declarative, notification: { ...declarative.notification, navigate } }));
    }
    expect(worker.shown.map((alert) => (alert.options.data as { url: string }).url)).toEqual(["/app", "/app", "/app", "/app", "/app"]);
  });

  it("a tap opens the screen in the open app, or opens the app there", async () => {
    const open = load([{ url: `${origin}/app/workspace` }]);
    const close = vi.fn();
    await open.fire("notificationclick", { notification: { close, data: { url: "/app/requests" } } });
    expect(close).toHaveBeenCalled();
    expect(open.windows[0]!.focus).toHaveBeenCalled();
    expect(open.windows[0]!.postMessage).toHaveBeenCalledWith({ type: "newfork:open", url: "/app/requests" });
    expect(open.scope.clients.openWindow).not.toHaveBeenCalled();

    const none = load([{ url: "https://other.example/" }]);
    await none.fire("notificationclick", { notification: { close: vi.fn(), data: { url: "/app/requests" } } });
    expect(none.scope.clients.openWindow).toHaveBeenCalledWith(`${origin}/app/requests`);

    const outside = load();
    await outside.fire("notificationclick", { notification: { close: vi.fn(), data: { url: "https://evil.example/" } } });
    expect(outside.scope.clients.openWindow).toHaveBeenCalledWith(`${origin}/app`);
  });

  it("still caches nothing and answers no request", () => {
    const worker = load();
    expect(source).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(source).not.toMatch(/caches\./);
    expect(worker.scope.skipWaiting).not.toHaveBeenCalled();
  });
});
