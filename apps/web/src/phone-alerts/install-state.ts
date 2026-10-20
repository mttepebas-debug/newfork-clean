// Where this browser stands on phone alerts (web push), read without asking for
// anything: no permission prompt, no subscription. Pure functions over a plain
// snapshot so every device can be tested from its user agent.

export type InstallEnv = {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
  /** Opened from the Home Screen (or an installed app window), not a browser tab. */
  readonly standalone: boolean;
  readonly secure: boolean;
  readonly serviceWorker: boolean;
  readonly pushManager: boolean;
  readonly notification: boolean;
};

export type PhoneAlertsSupport =
  /** iPhone Safari: push only works once Newfork is on the Home Screen (iOS 16.4+). */
  | { readonly kind: "needs-install"; readonly device: "phone" }
  /** The browser can ask for permission now. */
  | { readonly kind: "ready"; readonly device: "phone" | "computer"; readonly installed: boolean }
  /** No web push here, and installing would not change that. */
  | { readonly kind: "unsupported" };

type MaybeWindow = Window & {
  readonly navigator: Navigator & { readonly standalone?: boolean };
};

export function isStandalone(win: Window): boolean {
  const { navigator } = win as MaybeWindow;
  // iOS Safari before 16.4 never matched the media query; it has its own flag.
  if (navigator.standalone === true) return true;
  return typeof win.matchMedia === "function" && win.matchMedia("(display-mode: standalone)").matches;
}

export function readInstallEnv(win: Window): InstallEnv {
  return {
    userAgent: win.navigator.userAgent,
    maxTouchPoints: win.navigator.maxTouchPoints ?? 0,
    standalone: isStandalone(win),
    secure: win.isSecureContext === true,
    serviceWorker: "serviceWorker" in win.navigator,
    pushManager: "PushManager" in win,
    notification: "Notification" in win,
  };
}

function isIOS({ userAgent, maxTouchPoints }: InstallEnv): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  // iPadOS asks for the desktop site by default and calls itself a Mac; only touch gives it away.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/**
 * Major.minor of iOS. Safari's "Version/26.0" comes first: from Safari 26 the "OS 18_6" part is
 * frozen. The Home Screen app names no Version, so "OS 18_5" is the fallback there.
 */
export function iosVersion(userAgent: string): number | null {
  const match = /Version\/(\d+)(?:\.(\d+))?/.exec(userAgent) ?? /OS (\d+)_(\d+)/.exec(userAgent);
  return match ? Number(match[1]) + Number(match[2] ?? 0) / 100 : null;
}

export function isIPhoneSafari(env: InstallEnv): boolean {
  if (!isIOS(env) || env.standalone) return false;
  // Every iOS browser is WebKit; the others name themselves.
  return /Safari\//.test(env.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|DuckDuckGo/.test(env.userAgent);
}

export function isAndroidChrome({ userAgent }: InstallEnv): boolean {
  return (
    /Android/.test(userAgent) &&
    /Chrome\/\d+/.test(userAgent) &&
    !/SamsungBrowser|EdgA|OPR\/|YaBrowser|UCBrowser|; wv\)/.test(userAgent)
  );
}

export function supportsPush(env: InstallEnv): boolean {
  return env.secure && env.serviceWorker && env.pushManager && env.notification;
}

export function phoneAlertsSupport(env: InstallEnv): PhoneAlertsSupport {
  const phone = isIOS(env) || /Android|Mobile/.test(env.userAgent);
  if (supportsPush(env)) {
    return { kind: "ready", device: phone ? "phone" : "computer", installed: env.standalone };
  }
  // Safari tabs have no push; the Home Screen app does from iOS 16.4.
  if (env.secure && isIPhoneSafari(env) && (iosVersion(env.userAgent) ?? 0) >= 16.04) {
    return { kind: "needs-install", device: "phone" };
  }
  return { kind: "unsupported" };
}
