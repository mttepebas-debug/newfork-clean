import webpush from "web-push";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PushSendError } from "./push-worker";
import { createWebPushSend } from "./web-push-send";

// BILDIRIM-15: the one place an alert leaves the server, over the real web-push package with its network
// call replaced. A push service's status comes back as a number, its wait in seconds; no answer at all is
// PushSendError, and nothing of the address or the alert is in it.
const vapid = { publicKey: "B" + "k".repeat(86), privateKey: "p".repeat(43), subject: "mailto:alerts@newfork.test" };
const target = { endpoint: "https://fcm.googleapis.com/fcm/send/device-1", keys: { p256dh: "B" + "p".repeat(86), auth: "a".repeat(22) } };
const options = { ttl: 3_600, urgency: "high" as const, topic: "t".repeat(32), timeoutMs: 3_000 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("web-push send", () => {
  it("sends the alert signed with our VAPID key, for its time, urgency and topic", async () => {
    const spy = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    expect(await createWebPushSend(vapid)(target, "{}", options)).toEqual({ status: 201, retryAfter: null });
    expect(spy).toHaveBeenCalledWith(target, "{}", {
      vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: 3_600,
      urgency: "high",
      topic: "t".repeat(32),
      timeout: 3_000,
      contentEncoding: "aes128gcm",
    });
  });

  it("a push service's refusal is its status and its wait", async () => {
    const error = (status: number, headers: Record<string, string>) =>
      Object.assign(Object.create(webpush.WebPushError.prototype) as Error, { statusCode: status, headers, body: "", endpoint: target.endpoint });
    const spy = vi.spyOn(webpush, "sendNotification");
    spy.mockRejectedValueOnce(error(410, {}));
    expect(await createWebPushSend(vapid)(target, "{}", options)).toEqual({ status: 410, retryAfter: null });
    spy.mockRejectedValueOnce(error(429, { "retry-after": "120" }));
    expect(await createWebPushSend(vapid)(target, "{}", options)).toEqual({ status: 429, retryAfter: 120 });
    spy.mockRejectedValueOnce(error(503, { "retry-after": new Date(Date.now() + 60_000).toUTCString() }));
    const later = await createWebPushSend(vapid)(target, "{}", options);
    expect(later.status).toBe(503);
    expect(later.retryAfter).toBeGreaterThanOrEqual(58);
    expect(later.retryAfter).toBeLessThanOrEqual(60);
  });

  it("no answer at all is a timeout or a network failure, saying nothing of the address", async () => {
    const spy = vi.spyOn(webpush, "sendNotification");
    spy.mockRejectedValueOnce(new Error("Socket timeout"));
    await expect(createWebPushSend(vapid)(target, "{}", options)).rejects.toEqual(new PushSendError("timeout"));
    spy.mockRejectedValueOnce(new Error(`getaddrinfo ENOTFOUND ${target.endpoint}`));
    const failure = await createWebPushSend(vapid)(target, "{}", options).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PushSendError);
    expect((failure as PushSendError).code).toBe("network");
    expect(String((failure as Error).message)).not.toContain("fcm.googleapis");
  });
});
