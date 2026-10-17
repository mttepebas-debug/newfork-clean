import webpush from "web-push";
import type { VapidDetails } from "./channel-config";
import { PushSendError, type PushSend } from "./push-worker";

/**
 * The one place an alert leaves the server (BILDIRIM-15): web-push encrypts it for the device (RFC 8291,
 * aes128gcm) and signs the request with our VAPID key (RFC 8292). The push service's status comes back as
 * a number; no answer at all is PushSendError. Nothing here logs.
 */
export function createWebPushSend(vapid: VapidDetails): PushSend {
  return async (target, payload, options) => {
    try {
      const sent = await webpush.sendNotification({ endpoint: target.endpoint, keys: { ...target.keys } }, payload, {
        vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
        TTL: options.ttl,
        urgency: options.urgency,
        topic: options.topic,
        timeout: options.timeoutMs,
        contentEncoding: "aes128gcm",
      });
      return { status: sent.statusCode, retryAfter: retryAfter(sent.headers) };
    } catch (error) {
      if (error instanceof webpush.WebPushError) {
        return { status: error.statusCode, retryAfter: retryAfter(error.headers) };
      }
      const message = error instanceof Error ? error.message : "";
      throw new PushSendError(/timeout|timed out|ETIMEDOUT/i.test(message) ? "timeout" : "network");
    }
  };
}

/** Retry-After in seconds, from a number or an HTTP date. */
function retryAfter(headers: Record<string, string | string[] | undefined> | undefined): number | null {
  const raw = headers?.["retry-after"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const when = Date.parse(value);
  return Number.isNaN(when) ? null : Math.max(0, Math.round((when - Date.now()) / 1000));
}
