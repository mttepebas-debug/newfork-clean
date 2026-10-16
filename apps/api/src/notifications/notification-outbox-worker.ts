import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const leasedOutboxItemSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  attempt_count: z.coerce.number().int().positive(),
});

const failureResultSchema = z.object({
  status: z.enum(["retry", "dead_letter"]),
});
const processResultSchema = z.object({
  status: z.enum(["processed", "skipped"]).default("processed"),
});

interface NotificationRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

// Delivery only. Closing expired shift exchanges and document deadlines run on the maintenance
// cron (apps/api/src/maintenance, BILDIRIM-01), so this worker can go without taking them along.
export interface NotificationOutboxBatchResult {
  leased: number;
  processed: number;
  skipped: number;
  retried: number;
  dead_lettered: number;
  failed: number;
}

export interface NotificationOutboxWorker {
  runBatch(): Promise<NotificationOutboxBatchResult>;
}

export function createNotificationOutboxWorker(options: {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly workerId?: string;
  readonly batchSize?: number;
  readonly leaseSeconds?: number;
  readonly maxAttempts?: number;
  readonly retryBaseDelaySeconds?: number;
}): NotificationOutboxWorker {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as NotificationRpcClient;
  return createNotificationOutboxWorkerWithClient(client, options);
}

export function createNotificationOutboxWorkerWithClient(
  client: NotificationRpcClient,
  options: {
    readonly workerId?: string;
    readonly batchSize?: number;
    readonly leaseSeconds?: number;
    readonly maxAttempts?: number;
    readonly retryBaseDelaySeconds?: number;
  } = {},
): NotificationOutboxWorker {
  const workerId =
    options.workerId ?? `notification-worker-${crypto.randomUUID()}`;
  const batchSize = options.batchSize ?? 25;
  const leaseSeconds = options.leaseSeconds ?? 60;
  const maxAttempts = options.maxAttempts ?? 5;
  const retryBaseDelaySeconds = options.retryBaseDelaySeconds ?? 15;

  return {
    async runBatch() {
      const leaseResponse = await client.rpc(
        "lease_notification_outbox_service",
        {
          target_worker_id: workerId,
          target_batch_size: batchSize,
          target_lease_seconds: leaseSeconds,
        },
      );
      if (leaseResponse.error) throw new Error(leaseResponse.error.message);
      const leased = z
        .array(leasedOutboxItemSchema)
        .parse(leaseResponse.data ?? []);
      const result: NotificationOutboxBatchResult = {
        leased: leased.length,
        processed: 0,
        skipped: 0,
        retried: 0,
        dead_lettered: 0,
        failed: 0,
      };

      for (const item of leased) {
        try {
          const processResponse = await client.rpc(
            "process_notification_outbox_service",
            {
              target_worker_id: workerId,
              target_outbox_id: item.id,
            },
          );
          if (processResponse.error)
            throw new Error(processResponse.error.message);
          const processResult = processResultSchema.parse(
            processResponse.data ?? {},
          );
          if (processResult.status === "skipped") result.skipped += 1;
          else result.processed += 1;
        } catch (error) {
          const failureResponse = await client.rpc(
            "fail_notification_outbox_service",
            {
              target_worker_id: workerId,
              target_outbox_id: item.id,
              target_error: safeErrorMessage(error),
              target_max_attempts: maxAttempts,
              target_base_delay_seconds: retryBaseDelaySeconds,
            },
          );
          if (failureResponse.error) {
            result.failed += 1;
            continue;
          }
          const failure = failureResultSchema.parse(failureResponse.data);
          if (failure.status === "dead_letter") result.dead_lettered += 1;
          else result.retried += 1;
        }
      }

      return result;
    },
  };
}

function safeErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Notification processing failed";
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 500);
}
