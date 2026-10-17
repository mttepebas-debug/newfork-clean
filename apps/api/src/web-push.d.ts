// The part of web-push (3.6.7, MPL-2.0, KARARLAR S-138) the API uses. The package ships no types; this
// declares only what src/notifications/web-push-send.ts calls, so no second dependency comes in for it.
declare module "web-push" {
  interface PushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }

  interface RequestOptions {
    vapidDetails?: { subject: string; publicKey: string; privateKey: string };
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
    topic?: string;
    timeout?: number;
    contentEncoding?: "aesgcm" | "aes128gcm";
  }

  interface SendResult {
    statusCode: number;
    body: string;
    headers: Record<string, string | string[] | undefined>;
  }

  class WebPushError extends Error {
    readonly statusCode: number;
    readonly headers: Record<string, string | string[] | undefined>;
    readonly body: string;
    readonly endpoint: string;
  }

  function sendNotification(subscription: PushSubscription, payload?: string | Buffer | null, options?: RequestOptions): Promise<SendResult>;

  const webpush: { sendNotification: typeof sendNotification; WebPushError: typeof WebPushError };
  export default webpush;
}
