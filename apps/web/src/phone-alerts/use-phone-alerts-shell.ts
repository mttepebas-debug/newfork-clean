import { useEffect } from "react";
import { pushServer, useNotificationChannels } from "./channels-data";
import { isSchedulePath, markScheduleSeen } from "./home-card-memory";
import { syncPhoneAlerts } from "./push-client";

/** An alert's screen, as the service worker sends it: a path inside the app only. */
export function isAppPath(value: unknown): value is string {
  return typeof value === "string" && /^\/(?:[^/\\\u0000-\u001f\u007f][^\u0000-\u001f\u007f]*)?$/.test(value);
}

/**
 * What the signed-in app does for phone alerts (BILDIRIM-15): remembers that the person opened their
 * schedule here (the Home card waits for it), tells the server this device again at every start while
 * alerts are allowed, and moves to an alert's screen when the person taps it with the app open.
 */
export function usePhoneAlertsShell(userId: string | null, pathname: string, navigate: (path: string) => void) {
  const config = useNotificationChannels();

  useEffect(() => {
    if (isSchedulePath(pathname)) markScheduleSeen();
  }, [pathname]);

  useEffect(() => {
    if (userId && config.push.available) void syncPhoneAlerts(pushServer, config.push.public_key);
  }, [userId, config.push.available, config.push.public_key]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const worker = navigator.serviceWorker;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (data?.type === "newfork:open" && isAppPath(data.url)) navigate(data.url);
    };
    worker.addEventListener("message", onMessage);
    return () => worker.removeEventListener("message", onMessage);
  }, [navigate]);
}
