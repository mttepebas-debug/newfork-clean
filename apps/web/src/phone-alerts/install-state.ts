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

/** The Safari step set an iPhone gets: 27 and 26 hide Share behind a menu, 18 keeps it in the bar. */
export type SafariRelease = 27 | 26 | 18;

export type PhoneAlertsSupport =
  /**
   * iPhone Safari or Chrome: push only works once Newfork is on the Home Screen (iOS 16.4+). Chrome on
   * iPhone adds it from its own Share button and names no iOS release (its "OS 18_6" is frozen).
   */
  | { readonly kind: "needs-install"; readonly device: "phone"; readonly browser: "safari"; readonly ios: SafariRelease }
  | { readonly kind: "needs-install"; readonly device: "phone"; readonly browser: "chrome"; readonly ios: null }
  /** Another iPhone browser, an app's own browser or an email app's: alerts need Safari first. */
  | { readonly kind: "other-browser"; readonly where: "browser" | "inapp" | "mail" }
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

const OTHER_IOS_BROWSER = /FxiOS|EdgiOS|OPiOS|GSA\/|DuckDuckGo/;
const IN_APP_BROWSER = /FBAN|FBAV|Instagram|LinkedInApp/;

export function isIPhoneSafari(env: InstallEnv): boolean {
  if (!isIOS(env) || env.standalone) return false;
  // Every iOS browser is WebKit; the others name themselves.
  return /Safari\//.test(env.userAgent) && !/CriOS/.test(env.userAgent) && !OTHER_IOS_BROWSER.test(env.userAgent) && !IN_APP_BROWSER.test(env.userAgent);
}

/** Safari's step set from its Version: 27 and later, 26, or 16.4 to 18 (null below 16.4, which has no web push). */
export function safariRelease(userAgent: string): SafariRelease | null {
  const version = iosVersion(userAgent) ?? 0;
  if (version >= 27) return 27;
  if (version >= 26) return 26;
  return version >= 16.04 ? 18 : null;
}

/** Where an iPhone tab that is not Safari stands: Chrome can add Newfork itself; every other one sends the person to Safari. */
function otherIPhoneTab(env: InstallEnv): PhoneAlertsSupport | null {
  const ua = env.userAgent;
  if (/CriOS/.test(ua)) {
    const os = /OS (\d+)_(\d+)/.exec(ua);
    const release = os ? Number(os[1]) + Number(os[2]) / 100 : 0;
    return release >= 16.04 ? { kind: "needs-install", device: "phone", browser: "chrome", ios: null } : null;
  }
  if (OTHER_IOS_BROWSER.test(ua)) return { kind: "other-browser", where: "browser" };
  if (IN_APP_BROWSER.test(ua)) return { kind: "other-browser", where: "inapp" };
  // A WebKit view that names no Safari: most often the email app the invite was opened in.
  if (!/Safari\//.test(ua)) return { kind: "other-browser", where: "mail" };
  return null;
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
  if (!env.secure || !isIOS(env) || env.standalone) return { kind: "unsupported" };
  // Safari tabs have no push; the Home Screen app does from iOS 16.4.
  if (isIPhoneSafari(env)) {
    const ios = safariRelease(env.userAgent);
    return ios ? { kind: "needs-install", device: "phone", browser: "safari", ios } : { kind: "unsupported" };
  }
  return otherIPhoneTab(env) ?? { kind: "unsupported" };
}
