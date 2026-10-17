import { pushEndpointSchema, pushKeysSchema } from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { NotificationEmailBatchResult, NotificationEmailLog } from "./email-worker";

/**
 * The phone alerts' worker (BILDIRIM-15, KARARLAR S-138). Every minute a push is due, the cron route runs
 * one batch: claim due push deliveries (the database leases them, asks again who may still get them and
 * lists the devices that have not taken each yet), send each device its alert through its push service,
 * and say, device by device, how each answered. Deliveries go one after another, a delivery's devices at
 * once; none starts once the run's time is up, so a run ends well inside the function's 10 s, and what is
 * left is given back untried. A device that took an alert is never sent it again; a duplicate after a
 * crash is folded by the push service (topic) or the device (tag).
 * No address, key or alert text reaches a log or an error.
 */
interface PushRpcClient {
  rpc(
    functionName: "claim_notification_push_service" | "finish_notification_push_service" | "release_notification_push_service",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export type NotificationPushBatchResult = NotificationEmailBatchResult;

export interface NotificationPushWorker {
  runBatch(log: NotificationEmailLog): Promise<NotificationPushBatchResult>;
}

/** Thrown by a sender that got no answer at all. */
export class PushSendError extends Error {
  constructor(readonly code: "timeout" | "network") {
    super(`push send failed: ${code}`);
    this.name = "PushSendError";
  }
}

export interface PushTarget {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}

export interface PushSendOptions {
  readonly ttl: number;
  readonly urgency: "high" | "normal";
  readonly topic: string;
  readonly timeoutMs: number;
}

/** Sends one encrypted alert; answers the push service's status, or throws PushSendError. */
export type PushSend = (target: PushTarget, payload: string, options: PushSendOptions) => Promise<{ status: number; retryAfter: number | null }>;

// Read loosely, then each device checked on its own: one bad address never stops the others.
const targetSchema = z.object({
  subscription_id: z.string().uuid(),
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
});

const itemSchema = z.object({
  delivery_id: z.string().uuid(),
  ttl: z.number().int().min(0).max(86_400),
  urgency: z.enum(["high", "normal"]),
  topic: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  payload: z.object({
    title: z.string().min(1),
    body: z.string().nullable(),
    // A path inside the app with no control character, as the table checks it (person_notifications_url_check).
    url: z.string().regex(/^\/(?:[^/\\\u0000-\u001f\u007f][^\u0000-\u001f\u007f]*)?$/),
    tag: z.string().min(1).max(64),
  }),
  targets: z.array(targetSchema).max(10),
});

type Answer = { subscription_id: string; outcome: "accepted" | "gone" | "refused" | "retry" | "too_large"; code: string | null; retry_after: number | null };

const BATCH_SIZE = 25;
const BUDGET_MS = 7_000;
const SEND_TIMEOUT_MS = 3_000;
// A delivery is started only with at least this much of the run left.
const LEAST_LEFT_MS = 2_500;
// The encrypted record holds 4096 bytes; the alert stays well under it.
const MOST_PAYLOAD_BYTES = 3_000;

export interface NotificationPushWorkerOptions {
  readonly appUrl: string;
  readonly send: PushSend;
  readonly now?: () => number;
}

export function createNotificationPushWorker(
  options: NotificationPushWorkerOptions & { readonly url: string; readonly serviceRoleKey: string },
): NotificationPushWorker {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as PushRpcClient;
  return createNotificationPushWorkerWithClient(client, options);
}

/** What a push service's status means for this device. */
function answerFor(status: number, retryAfter: number | null): Pick<Answer, "outcome" | "code" | "retry_after"> {
  if (status >= 200 && status < 300) return { outcome: "accepted", code: null, retry_after: null };
  const code = `http_${status}`;
  if (status === 404 || status === 410) return { outcome: "gone", code, retry_after: null };
  if (status === 413) return { outcome: "too_large", code, retry_after: null };
  if (status === 429 || status >= 500) {
    return { outcome: "retry", code, retry_after: retryAfter === null ? null : Math.min(Math.max(Math.round(retryAfter), 0), 86_400) };
  }
  return { outcome: "refused", code, retry_after: null };
}

export function createNotificationPushWorkerWithClient(client: PushRpcClient, options: NotificationPushWorkerOptions): NotificationPushWorker {
  const now = options.now ?? (() => Date.now());
  const origin = new URL(options.appUrl).origin;

  async function finish(id: string, results: Answer[]): Promise<string> {
    const response = await client.rpc("finish_notification_push_service", { target_delivery: id, target_results: results });
    if (response.error) throw new Error(`finish failed: ${response.error.message}`);
    return String(response.data);
  }

  function count(result: NotificationPushBatchResult, status: string) {
    if (status === "sent") result.sent += 1;
    else if (status === "failed") result.retried += 1;
    else if (status === "dead") result.dead += 1;
  }

  return {
    async runBatch(log) {
      const started = now();
      const claim = await client.rpc("claim_notification_push_service", { target_batch_size: BATCH_SIZE });
      if (claim.error) throw new Error(`claim failed: ${claim.error.message}`);
      const rows: unknown[] = z.array(z.unknown()).parse(claim.data);
      const result: NotificationPushBatchResult = { claimed: rows.length, sent: 0, retried: 0, dead: 0, released: 0 };
      const giveBack: string[] = [];

      for (const row of rows) {
        // One row the worker cannot read never stops the others: with an id it is finished as reaching no
        // device; without one it is left to its lease (it comes back and dies there, lease_exhausted).
        const read = itemSchema.safeParse(row);
        if (!read.success) {
          const id = z.object({ delivery_id: z.string().uuid() }).safeParse(row);
          if (id.success) {
            count(result, await finish(id.data.delivery_id, []));
            log.info({ delivery: id.data.delivery_id, code: "bad_item" }, "notification push not sent");
          } else {
            log.error({ code: "bad_item" }, "notification push row without an id");
          }
          continue;
        }
        const item = read.data;
        const left = BUDGET_MS - (now() - started);
        if (giveBack.length > 0 || left < LEAST_LEFT_MS) {
          giveBack.push(item.delivery_id);
          continue;
        }

        // Declarative Web Push (Safari 18.4+ shows it without the worker); our worker reads the same.
        const payload = JSON.stringify({
          web_push: 8030,
          notification: {
            title: item.payload.title,
            ...(item.payload.body ? { body: item.payload.body } : {}),
            navigate: origin + item.payload.url,
            tag: item.payload.tag,
            lang: "en-US",
          },
        });
        let answers: Answer[];
        if (Buffer.byteLength(payload, "utf8") > MOST_PAYLOAD_BYTES) {
          answers = item.targets.map((t) => ({ subscription_id: t.subscription_id, outcome: "too_large", code: "payload_too_large", retry_after: null }));
        } else {
          const sendOptions: PushSendOptions = {
            ttl: item.ttl,
            urgency: item.urgency,
            topic: item.topic,
            timeoutMs: Math.min(SEND_TIMEOUT_MS, left),
          };
          answers = await Promise.all(
            item.targets.map(async (t): Promise<Answer> => {
              // Our server posts only to the four push services, whatever the database handed over.
              if (!pushEndpointSchema.safeParse(t.endpoint).success || !pushKeysSchema.safeParse({ p256dh: t.p256dh, auth: t.auth }).success) {
                return { subscription_id: t.subscription_id, outcome: "refused", code: "bad_endpoint", retry_after: null };
              }
              try {
                const sent = await options.send({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, sendOptions);
                return { subscription_id: t.subscription_id, ...answerFor(sent.status, sent.retryAfter) };
              } catch (error) {
                // Only our own code is kept: an unknown failure's message may carry the address.
                const code = error instanceof PushSendError ? error.code : "network";
                return { subscription_id: t.subscription_id, outcome: "retry", code, retry_after: null };
              }
            }),
          );
        }
        const status = await finish(item.delivery_id, answers);
        count(result, status);
        const codes = answers.filter((a) => a.outcome !== "accepted").map((a) => a.code);
        if (codes.length > 0) log.info({ delivery: item.delivery_id, status, codes }, "notification push not taken by every device");
      }
      if (giveBack.length > 0) {
        const released = await client.rpc("release_notification_push_service", { target_deliveries: giveBack });
        if (released.error) throw new Error(`release failed: ${released.error.message}`);
        result.released = giveBack.length;
      }
      return result;
    },
  };
}
