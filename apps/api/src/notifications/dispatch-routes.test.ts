import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerNotificationDispatchRoutes } from "./dispatch-routes";
import type { NotificationDispatchResult } from "./dispatcher";

// BILDIRIM-DAGITICI: the cron doors of every notification channel run the dispatcher and its heartbeat with
// the cron secret; the per-channel doors are gone.
function build(options: { dispatcher?: boolean; cronSecret?: string } = {}) {
  const lines: Record<string, unknown>[] = [];
  const app = Fastify({ logger: { level: "info", stream: { write: (line: string) => lines.push(JSON.parse(line)) } } });
  const ran: NotificationDispatchResult = { ran: true, email: null, push: null, alerts: 0 };
  const run = vi.fn(async () => ran);
  const heartbeat = vi.fn(async () => ({ alerts: 0 }));
  registerNotificationDispatchRoutes(app, {
    dispatcher: options.dispatcher === false ? null : { run, heartbeat },
    cronSecret: "cronSecret" in options ? options.cronSecret : "s",
  });
  return { app, run, heartbeat, lines };
}

describe("notification dispatch cron route", () => {
  it("runs the dispatcher only with the cron secret", async () => {
    const { app, run } = build();
    expect((await app.inject({ method: "POST", url: "/internal/cron/notification-dispatch", headers: { authorization: "Bearer no" } })).statusCode).toBe(401);
    expect(run).not.toHaveBeenCalled();
    const ok = await app.inject({ method: "POST", url: "/internal/cron/notification-dispatch", headers: { authorization: "Bearer s" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ran: true, email: null, push: null, alerts: 0 });
    expect((await app.inject({ method: "GET", url: "/internal/cron/notification-dispatch", headers: { authorization: "Bearer s" } })).statusCode).toBe(200);
    await app.close();
  });

  it("answers 503 without a dispatcher (no channel set up) or the secret, and runs nothing", async () => {
    const none = build({ dispatcher: false });
    expect((await none.app.inject({ method: "POST", url: "/internal/cron/notification-dispatch", headers: { authorization: "Bearer s" } })).statusCode).toBe(503);
    await none.app.close();
    const noSecret = build({ cronSecret: undefined });
    expect((await noSecret.app.inject({ method: "POST", url: "/internal/cron/notification-dispatch" })).statusCode).toBe(503);
    expect(noSecret.run).not.toHaveBeenCalled();
    await noSecret.app.close();
  });

  it("logs a failed run with its message and answers without internals", async () => {
    const { app, run, lines } = build();
    run.mockRejectedValueOnce(new Error("claim failed: permission denied for table notification_deliveries"));
    const response = await app.inject({ method: "POST", url: "/internal/cron/notification-dispatch", headers: { authorization: "Bearer s" } });
    expect(response.statusCode).toBe(500);
    expect(response.payload).not.toContain("notification_deliveries");
    expect(lines.some((line) => line.msg === "notification dispatch failed")).toBe(true);
    await app.close();
  });

  it("runs the heartbeat only with the cron secret, and answers its failure without internals", async () => {
    const { app, run, heartbeat, lines } = build();
    expect((await app.inject({ method: "POST", url: "/internal/cron/notification-heartbeat" })).statusCode).toBe(401);
    expect(heartbeat).not.toHaveBeenCalled();
    const ok = await app.inject({ method: "POST", url: "/internal/cron/notification-heartbeat", headers: { authorization: "Bearer s" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ alerts: 0 });
    expect(run).not.toHaveBeenCalled();
    heartbeat.mockRejectedValueOnce(new Error("alerts failed: permission denied for table notification_alerts"));
    const failed = await app.inject({ method: "GET", url: "/internal/cron/notification-heartbeat", headers: { authorization: "Bearer s" } });
    expect(failed.statusCode).toBe(500);
    expect(failed.payload).not.toContain("notification_alerts");
    expect(lines.some((line) => line.msg === "notification heartbeat failed")).toBe(true);
    await app.close();
  });

  it("has no per-channel cron doors any more", async () => {
    const { app } = build();
    for (const url of ["/internal/cron/notification-email", "/internal/cron/notification-push"]) {
      expect((await app.inject({ method: "POST", url, headers: { authorization: "Bearer s" } })).statusCode).toBe(404);
    }
    await app.close();
  });
});
