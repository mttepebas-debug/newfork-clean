import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ResendSendError, sendResendEmail } from "../email/resend-email";
import { renderNotificationEmail } from "./email-template";
import { inLanes } from "./lanes";

/**
 * The email channel's worker (BILDIRIM-14, KARARLAR S-130). The dispatcher (BILDIRIM-DAGITICI) runs batch
 * after batch until its deadline: claim due email deliveries (the database leases them, takes them fairly
 * across workspaces and asks again who may still get them), send each through Resend with the delivery's
 * own idempotency key, and say how each went. Starts are spaced for Resend's rate limit, a few at once, and
 * none starts close to the deadline: what is left is given back untried. A delivery whose run died anyway
 * is claimed again when its lease runs out, with the same key, so Resend never sends it twice.
 * The address and the key never reach a log or an error.
 */
interface EmailRpcClient {
  rpc(
    functionName:
      | "claim_notification_emails_service"
      | "finish_notification_email_service"
      | "release_notification_emails_service",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface NotificationEmailLog {
  info(details: Record<string, unknown>, message: string): void;
  error(details: Record<string, unknown>, message: string): void;
}

export interface NotificationEmailBatchResult {
  claimed: number;
  sent: number;
  retried: number;
  dead: number;
  released: number;
}

export interface NotificationEmailWorker {
  /** One claim's worth; no send starts within LEAST_LEFT_MS of the deadline (ms, on the worker's clock). */
  runBatch(log: NotificationEmailLog, deadline?: number): Promise<NotificationEmailBatchResult>;
}

const itemSchema = z.object({
  delivery_id: z.string().uuid(),
  to: z.string().min(3),
  subject: z.string().min(1),
  title: z.string().min(1),
  body: z.string().nullable(),
  // A path inside the app with no control character, as the table checks it (person_notifications_url_check).
  url: z.string().regex(/^\/(?:[^/\\\u0000-\u001f\u007f][^\u0000-\u001f\u007f]*)?$/).nullable(),
  workspace_name: z.string().nullable(),
  level: z.enum(["required", "important", "optional"]),
  topic: z.string().min(1),
  idempotency_key: z.string().min(1).max(256),
});

const BATCH_SIZE = 25;
// A run alone (no dispatcher's deadline) stops starting sends after this.
const BUDGET_MS = 7_000;
// Resend takes 10 requests a second for the whole team; notices start 8 a second and leave 2 to
// invitations, password resets and exports. Four are on the wire at most.
const SPACING_MS = 125;
const IN_FLIGHT = 4;
const SEND_TIMEOUT_MS = 4_000;
// A send is started only with at least this much of the run left.
const LEAST_LEFT_MS = 2_000;

export interface NotificationEmailWorkerOptions {
  readonly resendApiKey: string;
  readonly from: string;
  readonly appUrl: string;
  readonly send?: typeof sendResendEmail;
  readonly now?: () => number;
  readonly pause?: (ms: number) => Promise<void>;
}

export function createNotificationEmailWorker(
  options: NotificationEmailWorkerOptions & { readonly url: string; readonly serviceRoleKey: string },
): NotificationEmailWorker {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as EmailRpcClient;
  return createNotificationEmailWorkerWithClient(client, options);
}

export function createNotificationEmailWorkerWithClient(
  client: EmailRpcClient,
  options: NotificationEmailWorkerOptions,
): NotificationEmailWorker {
  const send = options.send ?? sendResendEmail;
  const now = options.now ?? (() => Date.now());
  const pause = options.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function finish(id: string, outcome: "sent" | "retry" | "dead", providerId: string | null, error: string | null) {
    const response = await client.rpc("finish_notification_email_service", {
      target_delivery: id,
      target_outcome: outcome,
      target_provider_id: providerId,
      target_error: error,
    });
    if (response.error) throw new Error(`finish failed: ${response.error.message}`);
  }

  return {
    async runBatch(log, deadline = now() + BUDGET_MS) {
      const claim = await client.rpc("claim_notification_emails_service", { target_batch_size: BATCH_SIZE });
      if (claim.error) throw new Error(`claim failed: ${claim.error.message}`);
      const rows: unknown[] = z.array(z.unknown()).parse(claim.data);
      const result: NotificationEmailBatchResult = { claimed: rows.length, sent: 0, retried: 0, dead: 0, released: 0 };
      const giveBack: string[] = [];
      let stopping = false;
      // Starts are SPACING_MS apart, whichever lane starts next.
      let nextStart = now();

      await inLanes(rows, IN_FLIGHT, async (row) => {
        // One row the worker cannot read never stops the others: it is dead, or, without even an id,
        // left to its lease (it comes back and dies there, lease_exhausted).
        const read = itemSchema.safeParse(row);
        if (!read.success) {
          const id = z.object({ delivery_id: z.string().uuid() }).safeParse(row);
          if (id.success) {
            await finish(id.data.delivery_id, "dead", null, "bad_item");
            result.dead += 1;
            log.info({ delivery: id.data.delivery_id, code: "bad_item" }, "notification email not sent");
          } else {
            log.error({ code: "bad_item" }, "notification email row without an id");
          }
          return;
        }
        const item = read.data;
        if (stopping || deadline - now() < LEAST_LEFT_MS) {
          stopping = true;
          giveBack.push(item.delivery_id);
          return;
        }
        const wait = nextStart - now();
        nextStart = Math.max(now(), nextStart) + SPACING_MS;
        if (wait > 0) await pause(wait);
        // The wait took time too: ask again before starting.
        const left = deadline - now();
        if (stopping || left < LEAST_LEFT_MS) {
          stopping = true;
          giveBack.push(item.delivery_id);
          return;
        }
        const email = renderNotificationEmail(item, options.appUrl);
        try {
          const sent = await send({
            apiKey: options.resendApiKey,
            failure: "Notification delivery failed",
            message: {
              from: options.from,
              to: item.to,
              subject: email.subject,
              html: email.html,
              text: email.text,
              idempotencyKey: item.idempotency_key,
            },
            signal: AbortSignal.timeout(Math.min(SEND_TIMEOUT_MS, left)),
          });
          await finish(item.delivery_id, "sent", sent.id, null);
          result.sent += 1;
        } catch (error) {
          // Only our own code is kept: an unknown failure's message may carry the address.
          const failure = error instanceof ResendSendError ? error : null;
          const code = failure?.code ?? "network";
          const retry = failure === null || failure.status === null || failure.status === 429 || failure.status >= 500;
          await finish(item.delivery_id, retry ? "retry" : "dead", null, code);
          if (retry) result.retried += 1;
          else result.dead += 1;
          log.info({ delivery: item.delivery_id, code, retry }, "notification email not sent");
        }
      });
      if (giveBack.length > 0) {
        const released = await client.rpc("release_notification_emails_service", { target_deliveries: giveBack });
        if (released.error) throw new Error(`release failed: ${released.error.message}`);
        result.released = giveBack.length;
      }
      return result;
    },
  };
}

/** Resend's word on an email, applied by the database (apply_notification_email_event_service). */
export function createNotificationEmailEvents(options: { readonly url: string; readonly serviceRoleKey: string }) {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    async apply(event: { type: string; emailId: string; to: string | null; bounceType: string | null }) {
      const response = await client.rpc("apply_notification_email_event_service", {
        target_type: event.type,
        target_provider_id: event.emailId,
        target_email: event.to,
        target_bounce_type: event.bounceType,
      });
      if (response.error) throw new Error(`apply failed: ${response.error.message}`);
      return String(response.data);
    },
  };
}
