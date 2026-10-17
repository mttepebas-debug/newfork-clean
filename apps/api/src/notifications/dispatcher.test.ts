import { describe, expect, it, vi } from "vitest";
import { alertMessage, createNotificationDispatcherWithClient, type NotificationDispatchAlert } from "./dispatcher";
import type { NotificationEmailBatchResult, NotificationEmailLog } from "./email-worker";

// BILDIRIM-DAGITICI (Mert 2026-10-17): one dispatcher for every channel. It takes the lease or does nothing,
// runs each channel batch after batch side by side until the deadline or until nothing is due, lets the
// lease go even when a channel fails, and hands each new alert to whoever tells Mert.
const runId = "5d6f1a0e-1c1a-4d2b-9a55-0f0b6f2c9a01";
const empty: NotificationEmailBatchResult = { claimed: 0, sent: 0, retried: 0, dead: 0, released: 0 };
const batch = (sent: number, released = 0): NotificationEmailBatchResult => ({ claimed: sent + released, sent, retried: 0, dead: 0, released });

function fakeClient(options: { lease?: string | null; alerts?: unknown[] } = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "begin_notification_dispatch_service") return { data: options.lease === undefined ? runId : options.lease, error: null };
      if (fn === "notification_dispatch_alerts_service") return { data: options.alerts ?? [], error: null };
      return { data: null, error: null };
    }),
  };
  return { client, calls, names: () => calls.map((c) => c.fn) };
}

const log: NotificationEmailLog = { info: () => undefined, error: () => undefined };

describe("notification dispatcher", () => {
  it("does nothing while another run holds the lease", async () => {
    const fake = fakeClient({ lease: null });
    const email = { runBatch: vi.fn(async () => batch(1)) };
    const dispatcher = createNotificationDispatcherWithClient(fake.client, { email, push: null, report: vi.fn() });
    expect(await dispatcher.run(log)).toEqual({ ran: false });
    expect(email.runBatch).not.toHaveBeenCalled();
    expect(fake.names()).toEqual(["begin_notification_dispatch_service"]);
    expect(fake.calls[0]?.args).toEqual({ target_seconds: 15 });
  });

  it("runs every channel batch after batch until nothing is due, then lets the lease go and asks for alerts", async () => {
    const fake = fakeClient();
    const email = { runBatch: vi.fn().mockResolvedValueOnce(batch(25)).mockResolvedValueOnce(batch(3)).mockResolvedValueOnce(empty) };
    const push = { runBatch: vi.fn().mockResolvedValueOnce(batch(7)).mockResolvedValueOnce(empty) };
    const dispatcher = createNotificationDispatcherWithClient(fake.client, { email, push, report: vi.fn(), now: () => 0 });
    const result = await dispatcher.run(log);
    expect(result).toEqual({
      ran: true,
      email: { claimed: 28, sent: 28, retried: 0, dead: 0, released: 0, batches: 3 },
      push: { claimed: 7, sent: 7, retried: 0, dead: 0, released: 0, batches: 2 },
      alerts: 0,
    });
    // Both workers get the run's deadline: 8 s from its start.
    expect(email.runBatch).toHaveBeenCalledWith(log, 8_000);
    expect(push.runBatch).toHaveBeenCalledWith(log, 8_000);
    expect(fake.names().slice(-2)).toEqual(["end_notification_dispatch_service", "notification_dispatch_alerts_service"]);
    expect(fake.calls.find((c) => c.fn === "end_notification_dispatch_service")?.args).toEqual({ target_run: runId });
  });

  it("stops at the deadline, and when a batch gave work back", async () => {
    const clock = { now: 0 };
    const fake = fakeClient();
    const email = {
      runBatch: vi.fn(async () => {
        clock.now += 3_000;
        return batch(10);
      }),
    };
    const push = { runBatch: vi.fn().mockResolvedValueOnce(batch(4, 6)) };
    const dispatcher = createNotificationDispatcherWithClient(fake.client, { email, push, report: vi.fn(), now: () => clock.now });
    await dispatcher.run(log);
    // 0 → 3 s → 6 s; at 6 s only 2 s are left, too little for a third batch.
    expect(email.runBatch).toHaveBeenCalledTimes(2);
    expect(push.runBatch).toHaveBeenCalledTimes(1);
  });

  it("lets the lease go and still tells the alerts when a channel fails, then fails the run", async () => {
    const alert: NotificationDispatchAlert = { kind: "late", channel: "push", period: "2026-10-17T21:30", waiting_seconds: 180, due: 4 };
    const fake = fakeClient({ alerts: [alert] });
    const report = vi.fn(async (_alert: NotificationDispatchAlert) => true);
    const email = { runBatch: vi.fn(async () => empty) };
    const push = { runBatch: vi.fn(async () => Promise.reject(new Error("claim failed: boom"))) };
    const dispatcher = createNotificationDispatcherWithClient(fake.client, { email, push, report });
    await expect(dispatcher.run(log)).rejects.toThrow("claim failed: boom");
    expect(fake.names()).toContain("end_notification_dispatch_service");
    expect(report).toHaveBeenCalledWith(alert);
  });

  it("tells each new alert once, the way Mert reads it", async () => {
    const alerts: NotificationDispatchAlert[] = [
      { kind: "quota_day_80", channel: "email", period: "2026-10-17", sent: 56, limit: 70 },
      { kind: "quota_month_full", channel: "email", period: "2026-10", sent: 2100, limit: 2100 },
    ];
    const fake = fakeClient({ alerts });
    const report = vi.fn(async (_alert: NotificationDispatchAlert) => true);
    const dispatcher = createNotificationDispatcherWithClient(fake.client, { email: { runBatch: async () => empty }, push: null, report });
    expect(await dispatcher.run(log)).toMatchObject({ ran: true, alerts: 2, push: null });
    expect(report.mock.calls.map(([a]) => a)).toEqual(alerts);
    expect(alertMessage(alerts[0]!)).toBe(
      "Email notifications: 80% of today's plan limit used (56 of 70). At the limit only required notices go until tomorrow (UTC).",
    );
    expect(alertMessage(alerts[1]!)).toBe(
      "Email notifications: this month's plan limit is used up (2100 of 2100). Only required notices go until next month; the rest wait.",
    );
    expect(alertMessage({ kind: "late", channel: "push", period: "p", waiting_seconds: 185, due: 3 })).toBe(
      "Phone alert notifications are late: 3 due, the oldest waiting 3 min.",
    );
  });

  it("refuses an alert it does not know rather than tell it wrongly", async () => {
    const fake = fakeClient({ alerts: [{ kind: "quota_week", channel: "email", period: "x" }] });
    const report = vi.fn(async (_alert: NotificationDispatchAlert) => true);
    const dispatcher = createNotificationDispatcherWithClient(fake.client, { email: null, push: { runBatch: async () => empty }, report });
    await expect(dispatcher.run(log)).rejects.toThrow();
    expect(report).not.toHaveBeenCalled();
    expect(fake.names()).toContain("end_notification_dispatch_service");
  });
});
