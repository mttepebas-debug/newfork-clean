import { createHmac } from "node:crypto";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerNotificationEmailRoutes, type ResendEvent } from "./notification-email-routes";

// BILDIRIM-14: the cron route runs the email worker with the cron secret; Resend's webhook is taken only
// with a valid Svix signature over the raw body, within five minutes, and says what happened to an email.
const secretBytes = Buffer.from("resend-webhook-test-secret");
const webhookSecret = `whsec_${secretBytes.toString("base64")}`;
const now = 1_760_000_000_000;

function sign(id: string, timestamp: number, body: string, bytes = secretBytes) {
  return `v1,${createHmac("sha256", bytes).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

function build(options: { worker?: boolean; cronSecret?: string; webhookSecret?: string } = {}) {
  const lines: Record<string, unknown>[] = [];
  const app = Fastify({ logger: { level: "info", stream: { write: (line: string) => lines.push(JSON.parse(line)) } } });
  const runBatch = vi.fn(async () => ({ claimed: 1, sent: 1, retried: 0, dead: 0, released: 0 }));
  const apply = vi.fn(async (_event: ResendEvent) => "delivered");
  registerNotificationEmailRoutes(app, {
    worker: options.worker === false ? null : { runBatch },
    cronSecret: "cronSecret" in options ? options.cronSecret : "s",
    webhookSecret: "webhookSecret" in options ? options.webhookSecret : webhookSecret,
    events: { apply },
    now: () => now,
  });
  return { app, runBatch, apply, lines };
}

function delivered(emailId = "re_1") {
  return JSON.stringify({ type: "email.delivered", created_at: "2026-10-17T08:00:00Z", data: { email_id: emailId, to: ["ali@example.test"] } });
}

async function post(app: ReturnType<typeof build>["app"], body: string, headers: Record<string, string>) {
  return app.inject({ method: "POST", url: "/webhooks/resend", payload: body, headers: { "content-type": "application/json", ...headers } });
}

describe("notification email cron route", () => {
  it("runs the worker only with the cron secret", async () => {
    const { app, runBatch } = build();
    expect((await app.inject({ method: "POST", url: "/internal/cron/notification-email", headers: { authorization: "Bearer no" } })).statusCode).toBe(401);
    expect(runBatch).not.toHaveBeenCalled();
    const ok = await app.inject({ method: "POST", url: "/internal/cron/notification-email", headers: { authorization: "Bearer s" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ claimed: 1, sent: 1, retried: 0, dead: 0, released: 0 });
    await app.close();
  });

  it("answers 503 without the worker (no Resend key or sender) or the secret, and claims nothing", async () => {
    const noWorker = build({ worker: false });
    expect((await noWorker.app.inject({ method: "GET", url: "/internal/cron/notification-email", headers: { authorization: "Bearer s" } })).statusCode).toBe(503);
    await noWorker.app.close();
    const noSecret = build({ cronSecret: undefined });
    expect((await noSecret.app.inject({ method: "GET", url: "/internal/cron/notification-email" })).statusCode).toBe(503);
    expect(noSecret.runBatch).not.toHaveBeenCalled();
    await noSecret.app.close();
  });

  it("logs a failed run with its message and answers without internals", async () => {
    const { app, runBatch, lines } = build();
    runBatch.mockRejectedValueOnce(new Error("claim failed: permission denied for table notification_deliveries"));
    const response = await app.inject({ method: "POST", url: "/internal/cron/notification-email", headers: { authorization: "Bearer s" } });
    expect(response.statusCode).toBe(500);
    expect(response.payload).not.toContain("notification_deliveries");
    expect(lines.some((line) => line.msg === "notification email run failed")).toBe(true);
    await app.close();
  });
});

describe("Resend webhook", () => {
  it("takes a signed event and applies what it says", async () => {
    const { app, apply } = build();
    const body = delivered();
    const ts = Math.floor(now / 1000);
    const response = await post(app, body, { "svix-id": "msg_1", "svix-timestamp": String(ts), "svix-signature": sign("msg_1", ts, body) });
    expect(response.statusCode).toBe(200);
    expect(apply).toHaveBeenCalledWith({ type: "email.delivered", emailId: "re_1", to: "ali@example.test", bounceType: null });
    await app.close();
  });

  it("accepts any one of the signatures it is sent", async () => {
    const { app, apply } = build();
    const body = delivered();
    const ts = Math.floor(now / 1000);
    const signatures = `v1,${Buffer.from("not it").toString("base64")} ${sign("msg_2", ts, body)}`;
    const response = await post(app, body, { "svix-id": "msg_2", "svix-timestamp": String(ts), "svix-signature": signatures });
    expect(response.statusCode).toBe(200);
    expect(apply).toHaveBeenCalledOnce();
    await app.close();
  });

  it("refuses a wrong signature, a changed body, another secret, and a time outside five minutes", async () => {
    const { app, apply } = build();
    const body = delivered();
    const ts = Math.floor(now / 1000);
    const cases: Record<string, string>[] = [
      { "svix-id": "msg_3", "svix-timestamp": String(ts), "svix-signature": "v1,bm90IGl0" },
      { "svix-id": "msg_3", "svix-timestamp": String(ts), "svix-signature": sign("msg_3", ts, delivered("re_other")) },
      { "svix-id": "msg_3", "svix-timestamp": String(ts), "svix-signature": sign("msg_3", ts, body, Buffer.from("other")) },
      { "svix-id": "msg_3", "svix-timestamp": String(ts - 301), "svix-signature": sign("msg_3", ts - 301, body) },
      { "svix-id": "msg_3", "svix-timestamp": String(ts + 301), "svix-signature": sign("msg_3", ts + 301, body) },
      { "svix-timestamp": String(ts), "svix-signature": sign("", ts, body) },
    ];
    for (const headers of cases) expect((await post(app, body, headers)).statusCode).toBe(401);
    expect(apply).not.toHaveBeenCalled();
    await app.close();
  });

  it("reads a bounce's kind and ignores what it does not use", async () => {
    const { app, apply } = build();
    const ts = Math.floor(now / 1000);
    const bounce = JSON.stringify({ type: "email.bounced", data: { email_id: "re_9", to: ["Bea@Example.test"], bounce: { type: "Permanent" } } });
    await post(app, bounce, { "svix-id": "m", "svix-timestamp": String(ts), "svix-signature": sign("m", ts, bounce) });
    expect(apply).toHaveBeenLastCalledWith({ type: "email.bounced", emailId: "re_9", to: "bea@example.test", bounceType: "Permanent" });
    const opened = JSON.stringify({ type: "email.opened", data: { email_id: "re_9" } });
    const response = await post(app, opened, { "svix-id": "n", "svix-timestamp": String(ts), "svix-signature": sign("n", ts, opened) });
    expect(response.statusCode).toBe(200);
    expect(apply).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("answers 503 when its secret is shorter than 24 bytes", async () => {
    const weak = build({ webhookSecret: `whsec_${Buffer.from("short").toString("base64")}` });
    const body = delivered();
    const ts = Math.floor(now / 1000);
    const response = await post(weak.app, body, {
      "svix-id": "m", "svix-timestamp": String(ts), "svix-signature": sign("m", ts, body, Buffer.from("short")),
    });
    expect(response.statusCode).toBe(503);
    expect(weak.apply).not.toHaveBeenCalled();
    await weak.app.close();
  });

  it("answers 503 without its secret, and keeps the address out of the log", async () => {
    const off = build({ webhookSecret: undefined });
    expect((await post(off.app, delivered(), {})).statusCode).toBe(503);
    await off.app.close();
    const { app, apply, lines } = build();
    apply.mockRejectedValueOnce(new Error("apply failed"));
    const body = delivered();
    const ts = Math.floor(now / 1000);
    const response = await post(app, body, { "svix-id": "msg_4", "svix-timestamp": String(ts), "svix-signature": sign("msg_4", ts, body) });
    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(lines)).not.toContain("ali@example.test");
    await app.close();
  });
});
