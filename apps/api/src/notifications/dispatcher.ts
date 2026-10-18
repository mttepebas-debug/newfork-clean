import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { NotificationEmailBatchResult, NotificationEmailLog, NotificationEmailWorker } from "./email-worker";
import type { NotificationPushWorker } from "./push-worker";

/**
 * One dispatcher for every notification channel (BILDIRIM-DAGITICI, Mert 2026-10-17). The cron calls it
 * every 5 seconds while a delivery is due and no run holds the lease:
 *   * it takes the lease (one run at a time, so the quota count and the providers' rate limits hold);
 *   * each channel's worker runs batch after batch, side by side, until the deadline or until nothing is due;
 *   * it lets the lease go, then tells Mert each alert not told yet (a quota at 80% or full, a delivery
 *     waiting over 2 minutes); an alert is marked told only once its send went out, so a failed one comes back.
 * The heartbeat (every 5 minutes, whatever is due) tells the same alerts and checks in with Sentry's cron
 * monitor: if the dispatcher cannot run at all, the queue still raises "late", and if even the heartbeat
 * stops arriving, Sentry tells Mert itself.
 * Sends end by the deadline (their timeouts are cut to the time left), then a few database calls follow:
 * a run ends well inside the cron call's 10 s. SMS gets a worker here when it comes.
 */
interface DispatchRpcClient {
  rpc(
    functionName:
      | "begin_notification_dispatch_service"
      | "end_notification_dispatch_service"
      | "notification_dispatch_alerts_service"
      | "raise_notification_alerts_service",
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
  | { readonly ran: false; readonly alerts: number }
  | { readonly ran: true; readonly email: ChannelTotals | null; readonly push: ChannelTotals | null; readonly alerts: number };

export interface NotificationDispatcher {
  run(log: NotificationEmailLog): Promise<NotificationDispatchResult>;
  /** The heartbeat: tells the alerts and checks in, whether or not anything is due. */
  heartbeat(log: NotificationEmailLog): Promise<{ readonly alerts: number }>;
}

/** Sentry's cron monitor check-in; answers whether it went out. */
export type CheckIn = (status: "ok" | "error") => Promise<boolean>;

export interface NotificationDispatcherOptions {
  readonly email: NotificationEmailWorker | null;
  readonly push: NotificationPushWorker | null;
  /** Tells Mert; answers whether it went out. Not told: it stays untold and comes back next time. */
  readonly report: (alert: NotificationDispatchAlert) => Promise<boolean>;
  readonly checkIn: CheckIn;
  readonly now?: () => number;
}

// Sends end by the deadline; a few database calls after it keep the run well inside the cron call's 10 s.
const BUDGET_MS = 7_000;
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

  /** Tells each alert not told yet; marks told only what went out. Answers how many were told. */
  async function tellAlerts(log: NotificationEmailLog): Promise<number> {
    const raised = await client.rpc("notification_dispatch_alerts_service", {});
    if (raised.error) throw new Error(`alerts failed: ${raised.error.message}`);
    const alerts = z.array(alertSchema).parse(raised.data ?? []);
    const told: NotificationDispatchAlert[] = [];
    for (const alert of alerts) {
      const sent = await options.report(alert).catch(() => false);
      log.error({ alert: alert.kind, channel: alert.channel, period: alert.period, told: sent }, "notification delivery alert");
      if (sent) told.push(alert);
    }
    if (told.length > 0) {
      const marked = await client.rpc("raise_notification_alerts_service", {
        target_alerts: told.map(({ kind, channel, period }) => ({ kind, channel, period })),
      });
      if (marked.error) throw new Error(`raise failed: ${marked.error.message}`);
    }
    return told.length;
  }

  return {
    async run(log) {
      const begun = await client.rpc("begin_notification_dispatch_service", { target_seconds: LEASE_SECONDS });
      if (begun.error) throw new Error(`begin failed: ${begun.error.message}`);
      const runId = z.string().uuid().nullable().parse(begun.data ?? null);
      if (!runId) return { ran: false, alerts: 0 };

      const deadline = now() + BUDGET_MS;
      const [email, push] = await Promise.allSettled([drain(options.email, deadline, log), drain(options.push, deadline, log)]);
      const ended = await client.rpc("end_notification_dispatch_service", { target_run: runId });
      if (ended.error) log.error({ code: "end_failed" }, "notification dispatch lease not let go; it runs out");

      // The alerts are asked even after a channel failed: a failing channel is what makes a queue late.
      const alerts = await tellAlerts(log);

      const failed = [email, push].find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
      if (failed) throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
      return {
        ran: true,
        email: email.status === "fulfilled" ? email.value : null,
        push: push.status === "fulfilled" ? push.value : null,
        alerts,
      };
    },

    async heartbeat(log) {
      try {
        const alerts = await tellAlerts(log);
        await options.checkIn("ok");
        return { alerts };
      } catch (error) {
        // The database or the alerts did not answer: Sentry hears it now rather than at the next missed beat.
        await options.checkIn("error").catch(() => false);
        throw error;
      }
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

/** Sentry's cron monitor for the heartbeat: every 5 minutes, missed after 5 more, two misses make an issue. */
export const HEARTBEAT_MONITOR = {
  slug: "notification-delivery",
  config: {
    schedule: { type: "crontab" as const, value: "*/5 * * * *" },
    checkinMargin: 5,
    maxRuntime: 2,
    failureIssueThreshold: 2,
    recoveryThreshold: 1,
    timezone: "UTC",
  },
};
