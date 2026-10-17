import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { NotificationEmailBatchResult, NotificationEmailLog, NotificationEmailWorker } from "./email-worker";
import type { NotificationPushWorker } from "./push-worker";

/**
 * One dispatcher for every notification channel (BILDIRIM-DAGITICI, Mert 2026-10-17). The cron calls it
 * every 5 seconds while a delivery is due and no run holds the lease:
 *   * it takes the lease (one run at a time, so the quota count and the providers' rate limits hold);
 *   * each channel's worker runs batch after batch, side by side, until the deadline or until nothing is due;
 *   * it lets the lease go, then hands each new alert (a quota at 80% or full, a delivery waiting over
 *     2 minutes) to `report`, which tells Mert.
 * A run ends inside the cron call's 10 s. SMS gets a worker here when it comes.
 */
interface DispatchRpcClient {
  rpc(
    functionName: "begin_notification_dispatch_service" | "end_notification_dispatch_service" | "notification_dispatch_alerts_service",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

const alertSchema = z.object({
  kind: z.enum(["quota_day_80", "quota_day_full", "quota_month_80", "quota_month_full", "late"]),
  channel: z.enum(["email", "push", "sms"]),
  period: z.string(),
  sent: z.number().int().optional(),
  limit: z.number().int().optional(),
  waiting_seconds: z.number().int().optional(),
  due: z.number().int().optional(),
});
export type NotificationDispatchAlert = z.infer<typeof alertSchema>;

export type ChannelTotals = NotificationEmailBatchResult & { batches: number };

export type NotificationDispatchResult =
  | { readonly ran: false }
  | { readonly ran: true; readonly email: ChannelTotals | null; readonly push: ChannelTotals | null; readonly alerts: number };

export interface NotificationDispatcher {
  run(log: NotificationEmailLog): Promise<NotificationDispatchResult>;
}

export interface NotificationDispatcherOptions {
  readonly email: NotificationEmailWorker | null;
  readonly push: NotificationPushWorker | null;
  /** Tells Mert; answers whether it went out (no Sentry, no telling: the log still has it). */
  readonly report: (alert: NotificationDispatchAlert) => Promise<boolean>;
  readonly now?: () => number;
}

// The cron's call gives up after 10 s; the run stops starting work well before.
const BUDGET_MS = 8_000;
// A batch is started only with at least this much left.
const LEAST_LEFT_MS = 2_500;
// Longer than a run, so a run that dies frees the lease soon after.
const LEASE_SECONDS = 15;

export function createNotificationDispatcher(
  options: NotificationDispatcherOptions & { readonly url: string; readonly serviceRoleKey: string },
): NotificationDispatcher {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as DispatchRpcClient;
  return createNotificationDispatcherWithClient(client, options);
}

export function createNotificationDispatcherWithClient(
  client: DispatchRpcClient,
  options: NotificationDispatcherOptions,
): NotificationDispatcher {
  const now = options.now ?? (() => Date.now());

  async function drain(worker: NotificationEmailWorker | NotificationPushWorker | null, deadline: number, log: NotificationEmailLog) {
    if (!worker) return null;
    const totals: ChannelTotals = { claimed: 0, sent: 0, retried: 0, dead: 0, released: 0, batches: 0 };
    while (deadline - now() >= LEAST_LEFT_MS) {
      const batch = await worker.runBatch(log, deadline);
      totals.batches += 1;
      totals.claimed += batch.claimed;
      totals.sent += batch.sent;
      totals.retried += batch.retried;
      totals.dead += batch.dead;
      totals.released += batch.released;
      // Nothing due, or out of time: the next cron call goes on.
      if (batch.claimed === 0 || batch.released > 0) break;
    }
    return totals;
  }

  return {
    async run(log) {
      const begun = await client.rpc("begin_notification_dispatch_service", { target_seconds: LEASE_SECONDS });
      if (begun.error) throw new Error(`begin failed: ${begun.error.message}`);
      const runId = z.string().uuid().nullable().parse(begun.data ?? null);
      if (!runId) return { ran: false };

      const deadline = now() + BUDGET_MS;
      const [email, push] = await Promise.allSettled([drain(options.email, deadline, log), drain(options.push, deadline, log)]);
      const ended = await client.rpc("end_notification_dispatch_service", { target_run: runId });
      if (ended.error) log.error({ code: "end_failed" }, "notification dispatch lease not let go; it runs out");

      // The alerts are asked even after a channel failed: a failing channel is what makes a queue late.
      const raised = await client.rpc("notification_dispatch_alerts_service", {});
      if (raised.error) throw new Error(`alerts failed: ${raised.error.message}`);
      const alerts = z.array(alertSchema).parse(raised.data ?? []);
      for (const alert of alerts) {
        const told = await options.report(alert);
        log.error({ alert: alert.kind, channel: alert.channel, period: alert.period, told }, "notification delivery alert");
      }

      const failed = [email, push].find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
      if (failed) throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
      return {
        ran: true,
        email: email.status === "fulfilled" ? email.value : null,
        push: push.status === "fulfilled" ? push.value : null,
        alerts: alerts.length,
      };
    },
  };
}

/** The alert as Mert reads it in Sentry's email: what, how much, and what happens now. */
export function alertMessage(alert: NotificationDispatchAlert): string {
  const channel = alert.channel === "email" ? "Email" : alert.channel === "push" ? "Phone alert" : "SMS";
  const used = alert.sent !== undefined && alert.limit !== undefined ? ` (${alert.sent} of ${alert.limit})` : "";
  switch (alert.kind) {
    case "quota_day_80":
      return `${channel} notifications: 80% of today's plan limit used${used}. At the limit only required notices go until tomorrow (UTC).`;
    case "quota_day_full":
      return `${channel} notifications: today's plan limit is used up${used}. Only required notices go until tomorrow (UTC); the rest wait.`;
    case "quota_month_80":
      return `${channel} notifications: 80% of this month's plan limit used${used}. At the limit only required notices go until next month.`;
    case "quota_month_full":
      return `${channel} notifications: this month's plan limit is used up${used}. Only required notices go until next month; the rest wait.`;
    case "late":
      return `${channel} notifications are late: ${alert.due ?? "some"} due, the oldest waiting ${Math.round((alert.waiting_seconds ?? 0) / 60)} min.`;
  }
}
