import { describe, expect, it } from "vitest";

import {
  iosVersion,
  isAndroidChrome,
  isIPhoneSafari,
  isStandalone,
  phoneAlertsSupport,
  readInstallEnv,
  safariRelease,
  supportsPush,
  type InstallEnv,
} from "./install-state";

// Real user agents (2026); the iPad one is iPadOS asking for the desktop site.
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  // Safari 26 and later freeze "OS 18_6" in the user agent; only "Version/" carries the real release.
  iphone26:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  iphone27:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Mobile/15E148 Safari/604.1",
  iphoneOld:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1",
  iphoneHomeScreen:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.0",
  // Gmail's own browser: a WebKit view that names no Safari.
  iphoneMailView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  ipadDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  androidEdge:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 EdgA/141.0.0.0",
  androidFirefox: "Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
};

const pushReady = { secure: true, serviceWorker: true, pushManager: true, notification: true };
const noPush = { secure: true, serviceWorker: true, pushManager: false, notification: false };

function env(overrides: Partial<InstallEnv>): InstallEnv {
  return { userAgent: UA.desktopChrome, maxTouchPoints: 0, standalone: false, ...pushReady, ...overrides };
}

describe("iosVersion", () => {
  it("reads Safari's Version first, since iOS 26 and later freeze OS 18_6", () => {
    expect(iosVersion(UA.iphone26)).toBe(26);
    expect(iosVersion(UA.iphone27)).toBe(27.01);
    expect(iosVersion("Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) Version/26 Mobile/15E148 Safari/604.1")).toBe(26);
  });

  it("reads earlier releases the same way", () => {
    expect(iosVersion(UA.iphoneSafari)).toBe(18.05);
    expect(iosVersion(UA.iphoneOld)).toBe(16.03);
    expect(iosVersion(UA.ipadDesktop)).toBe(18.05);
  });

  it("falls back to OS n_n where Safari names no Version, as in the Home Screen app", () => {
    expect(iosVersion(UA.iphoneHomeScreen)).toBe(18.05);
    expect(iosVersion("Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe(16.04);
    expect(iosVersion(UA.desktopChrome)).toBeNull();
  });
});

describe("isIPhoneSafari", () => {
  it("is Safari on an iPhone, in the browser", () => {
    expect(isIPhoneSafari(env({ userAgent: UA.iphoneSafari, maxTouchPoints: 5, ...noPush }))).toBe(true);
  });

  it("counts an iPad that asks for the desktop site, which looks like a Mac with touch", () => {
    expect(isIPhoneSafari(env({ userAgent: UA.ipadDesktop, maxTouchPoints: 5, ...noPush }))).toBe(true);
    expect(isIPhoneSafari(env({ userAgent: UA.macSafari, maxTouchPoints: 0 }))).toBe(false);
  });

  it("is not the app already opened from the Home Screen", () => {
    expect(isIPhoneSafari(env({ userAgent: UA.iphoneHomeScreen, maxTouchPoints: 5, standalone: true }))).toBe(false);
  });

  it("is not Chrome on iPhone, which adds to the Home Screen from its own menu, nor an app's own browser", () => {
    expect(isIPhoneSafari(env({ userAgent: UA.iphoneChrome, maxTouchPoints: 5, ...noPush }))).toBe(false);
    expect(isIPhoneSafari(env({ userAgent: UA.iphoneFirefox, maxTouchPoints: 5, ...noPush }))).toBe(false);
    expect(isIPhoneSafari(env({ userAgent: UA.iphoneMailView, maxTouchPoints: 5, ...noPush }))).toBe(false);
  });

  it("is not Android or a computer", () => {
    expect(isIPhoneSafari(env({ userAgent: UA.androidChrome, maxTouchPoints: 5 }))).toBe(false);
    expect(isIPhoneSafari(env({ userAgent: UA.desktopChrome }))).toBe(false);
  });
});

describe("isAndroidChrome", () => {
  it("is Chrome on Android", () => {
    expect(isAndroidChrome(env({ userAgent: UA.androidChrome, maxTouchPoints: 5 }))).toBe(true);
  });

  it("is not another Android browser built on Chrome, nor Firefox", () => {
    for (const userAgent of [UA.androidSamsung, UA.androidEdge, UA.androidFirefox]) {
      expect(isAndroidChrome(env({ userAgent, maxTouchPoints: 5 }))).toBe(false);
    }
  });

  it("is not Chrome on a computer or an iPhone", () => {
    expect(isAndroidChrome(env({ userAgent: UA.desktopChrome }))).toBe(false);
    expect(isAndroidChrome(env({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 }))).toBe(false);
  });
});

describe("supportsPush", () => {
  it("needs a secure page, a service worker, the push manager and notifications", () => {
    expect(supportsPush(env({}))).toBe(true);
    expect(supportsPush(env({ secure: false }))).toBe(false);
    expect(supportsPush(env({ serviceWorker: false }))).toBe(false);
    expect(supportsPush(env({ pushManager: false }))).toBe(false);
    expect(supportsPush(env({ notification: false }))).toBe(false);
  });
});

describe("safariRelease", () => {
  it("picks the step set from Safari's Version", () => {
    expect(safariRelease(UA.iphone27)).toBe(27);
    expect(safariRelease(UA.iphone26)).toBe(26);
    expect(safariRelease(UA.iphoneSafari)).toBe(18);
    expect(safariRelease(UA.iphoneOld)).toBeNull();
  });
});

describe("phoneAlertsSupport", () => {
  const phone = (userAgent: string, more: Partial<InstallEnv> = {}) =>
    phoneAlertsSupport(env({ userAgent, maxTouchPoints: 5, ...noPush, ...more }));

  it("asks iPhone Safari to add the app to the Home Screen first, with its own release's steps", () => {
    expect(phone(UA.iphone27)).toEqual({ kind: "needs-install", device: "phone", browser: "safari", ios: 27 });
    expect(phone(UA.iphone26)).toEqual({ kind: "needs-install", device: "phone", browser: "safari", ios: 26 });
    expect(phone(UA.iphoneSafari)).toEqual({ kind: "needs-install", device: "phone", browser: "safari", ios: 18 });
  });

  it("lets Chrome on iPhone add the app itself, without a release it cannot read", () => {
    expect(phone(UA.iphoneChrome)).toEqual({ kind: "needs-install", device: "phone", browser: "chrome", ios: null });
  });

  it("sends every other iPhone tab to Safari: other browsers, apps' own browsers and email apps'", () => {
    expect(phone(UA.iphoneFirefox)).toEqual({ kind: "other-browser", where: "browser" });
    expect(phone(UA.iphoneInstagram)).toEqual({ kind: "other-browser", where: "inapp" });
    expect(phone(UA.iphoneMailView)).toEqual({ kind: "other-browser", where: "mail" });
  });

  it("lets the Home Screen app on iPhone turn alerts on", () => {
    expect(
      phoneAlertsSupport(env({ userAgent: UA.iphoneHomeScreen, maxTouchPoints: 5, standalone: true })),
    ).toEqual({ kind: "ready", device: "phone", installed: true });
  });

  it("lets Android Chrome turn alerts on in the browser", () => {
    expect(phoneAlertsSupport(env({ userAgent: UA.androidChrome, maxTouchPoints: 5 }))).toEqual({
      kind: "ready",
      device: "phone",
      installed: false,
    });
  });

  it("calls a computer a computer", () => {
    expect(phoneAlertsSupport(env({}))).toEqual({ kind: "ready", device: "computer", installed: false });
  });

  it("offers nothing where adding to the Home Screen would not help", () => {
    // iOS before 16.4 has no web push even from the Home Screen.
    expect(phone(UA.iphoneOld)).toEqual({ kind: "unsupported" });
    expect(phone(UA.iphoneChrome.replace("18_5", "16_3"))).toEqual({ kind: "unsupported" });
    // An old Home Screen app, or any page that is not https.
    expect(phone(UA.iphoneHomeScreen, { standalone: true })).toEqual({ kind: "unsupported" });
    expect(phone(UA.iphone27, { secure: false })).toEqual({ kind: "unsupported" });
    expect(phoneAlertsSupport(env({ userAgent: UA.androidChrome, maxTouchPoints: 5, secure: false }))).toEqual({
      kind: "unsupported",
    });
  });
});

describe("readInstallEnv and isStandalone", () => {
  function fakeWindow(options: { displayMode?: boolean; iosStandalone?: boolean; push?: boolean }) {
    const navigator: Record<string, unknown> = { userAgent: UA.iphoneSafari, maxTouchPoints: 5 };
    if (options.iosStandalone !== undefined) navigator.standalone = options.iosStandalone;
    if (options.push) navigator.serviceWorker = {};
    const win: Record<string, unknown> = {
      navigator,
      isSecureContext: true,
      matchMedia: (query: string) => ({ matches: query === "(display-mode: standalone)" && !!options.displayMode }),
    };
    if (options.push) {
      win.PushManager = function PushManager() {};
      win.Notification = function Notification() {};
    }
    return win as unknown as Window;
  }

  it("reads standalone from the display mode, or from Safari's own flag", () => {
    expect(isStandalone(fakeWindow({ displayMode: true }))).toBe(true);
    expect(isStandalone(fakeWindow({ iosStandalone: true }))).toBe(true);
    expect(isStandalone(fakeWindow({ iosStandalone: false }))).toBe(false);
    expect(isStandalone(fakeWindow({}))).toBe(false);
  });

  it("reads what the browser offers without asking for anything", () => {
    expect(readInstallEnv(fakeWindow({ push: true }))).toEqual({
      userAgent: UA.iphoneSafari,
      maxTouchPoints: 5,
      standalone: false,
      secure: true,
      serviceWorker: true,
      pushManager: true,
      notification: true,
    });
    expect(readInstallEnv(fakeWindow({}))).toMatchObject({ serviceWorker: false, pushManager: false, notification: false });
  });

  it("copes with a window that has no matchMedia", () => {
    const win = { navigator: { userAgent: UA.desktopChrome, maxTouchPoints: 0 }, isSecureContext: false } as unknown as Window;
    expect(isStandalone(win)).toBe(false);
  });
});
