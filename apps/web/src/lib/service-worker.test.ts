import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { registerServiceWorker, shouldRegisterServiceWorker } from "./service-worker";

const production = { PROD: true, MODE: "production" };

function fakeWindow(options: { secure?: boolean; serviceWorker?: boolean; register?: () => Promise<unknown>; loaded?: boolean } = {}) {
  const listeners: Record<string, () => void> = {};
  const register = vi.fn(options.register ?? (() => Promise.resolve({ scope: "/" })));
  const navigator: Record<string, unknown> = {};
  if (options.serviceWorker ?? true) navigator.serviceWorker = { register };
  const win = {
    isSecureContext: options.secure ?? true,
    navigator,
    document: { readyState: options.loaded === false ? "loading" : "complete" },
    addEventListener: (type: string, listener: () => void) => {
      listeners[type] = listener;
    },
  } as unknown as Window;
  return { win, register, listeners };
}

describe("shouldRegisterServiceWorker", () => {
  it("registers only in a production build on a secure page that has service workers", () => {
    expect(shouldRegisterServiceWorker(production, fakeWindow().win)).toBe(true);
  });

  it("never registers in Vite dev or in tests, so a stale worker cannot sit in front of the dev server", () => {
    expect(shouldRegisterServiceWorker({ PROD: false, MODE: "development" }, fakeWindow().win)).toBe(false);
    expect(shouldRegisterServiceWorker({ PROD: false, MODE: "test" }, fakeWindow().win)).toBe(false);
    expect(shouldRegisterServiceWorker({ PROD: true, MODE: "test" }, fakeWindow().win)).toBe(false);
  });

  it("skips plain http and browsers without service workers", () => {
    expect(shouldRegisterServiceWorker(production, fakeWindow({ secure: false }).win)).toBe(false);
    expect(shouldRegisterServiceWorker(production, fakeWindow({ serviceWorker: false }).win)).toBe(false);
  });

  it("is off in this test run's own environment", () => {
    expect(shouldRegisterServiceWorker(import.meta.env, fakeWindow().win)).toBe(false);
  });
});

describe("registerServiceWorker", () => {
  it("registers /sw.js for the whole app", async () => {
    const { win, register } = fakeWindow();
    await registerServiceWorker(production, win, vi.fn());
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("waits for the page to finish loading first", async () => {
    const { win, register, listeners } = fakeWindow({ loaded: false });
    const done = registerServiceWorker(production, win, vi.fn());
    expect(register).not.toHaveBeenCalled();
    listeners.load!();
    await done;
    expect(register).toHaveBeenCalledOnce();
  });

  it("does nothing in dev", async () => {
    const { win, register } = fakeWindow();
    await expect(registerServiceWorker({ PROD: false, MODE: "development" }, win, vi.fn())).resolves.toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it("reports a failed registration and keeps the app running", async () => {
    const failure = new Error("SecurityError");
    const { win } = fakeWindow({ register: () => Promise.reject(failure) });
    const report = vi.fn();
    await expect(registerServiceWorker(production, win, report)).resolves.toBeNull();
    expect(report).toHaveBeenCalledWith(failure);
  });
});

describe("the service worker file", () => {
  const source = readFileSync("public/sw.js", "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  it("takes over at once on install and activate", () => {
    expect(source).toMatch(/addEventListener\(\s*["']install["']/);
    expect(source).toMatch(/skipWaiting\(\)/);
    expect(source).toMatch(/addEventListener\(\s*["']activate["']/);
    expect(source).toMatch(/clients\.claim\(\)/);
  });

  it("caches nothing and never answers requests, so every deploy is served fresh", () => {
    expect(source).not.toMatch(/["']fetch["']/);
    expect(source).not.toMatch(/\bcaches\b/);
    expect(source).not.toMatch(/respondWith/);
  });

  it("has no push handling yet", () => {
    expect(source).not.toMatch(/["']push["']/);
    expect(source).not.toMatch(/["']notificationclick["']/);
  });
});
