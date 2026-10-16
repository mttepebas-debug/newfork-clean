import * as Sentry from "@sentry/react";

// Registers public/sw.js, the worker phone alerts (web push) will need. It
// caches nothing, so registering it changes nothing a user sees today.

type BuildEnv = { readonly PROD: boolean; readonly MODE: string };

function reportFailure(error: unknown) {
  console.error("Service worker registration failed", error);
  Sentry.captureException(error);
}

/** Production builds only: Vite dev and tests never get a worker in front of them. */
export function shouldRegisterServiceWorker(env: BuildEnv, win: Window): boolean {
  return env.PROD && env.MODE !== "test" && win.isSecureContext === true && "serviceWorker" in win.navigator;
}

/** Never throws: a browser that refuses the worker still runs the app; the failure is reported. */
export async function registerServiceWorker(
  env: BuildEnv = import.meta.env,
  win: Window = window,
  report: (error: unknown) => void = reportFailure,
): Promise<ServiceWorkerRegistration | null> {
  if (!shouldRegisterServiceWorker(env, win)) return null;
  // After load, so the worker's download does not compete with the first screen.
  if (win.document.readyState !== "complete") {
    await new Promise<void>((resolve) => win.addEventListener("load", () => resolve(), { once: true }));
  }
  try {
    return await win.navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    report(error);
    return null;
  }
}
