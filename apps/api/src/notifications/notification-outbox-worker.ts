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

const maintenanceSchema = z.object({
  expired: z.number().int().nonnegative(),
  invalidated: z.number().int().nonnegative(),
  skipped_busy: z.number().int().nonnegative(),
});
type MaintenanceResult = z.infer<typeof maintenanceSchema>;

const documentMaintenanceSchema = z.object({
  checked: z.number().int().nonnegative(),
  enqueued: z.number().int().nonnegative(),
  // BL-965: cases the database skipped after an error; a database without the field skipped none
  failed_cases: z.number().int().nonnegative().default(0),
});
type DocumentMaintenanceResult = z.infer<typeof documentMaintenanceSchema>;
export const readDocumentMaintenance = (data: unknown): DocumentMaintenanceResult => documentMaintenanceSchema.parse(data);

/** A maintenance step that threw; the cron route logs the message (BL-965). */
export interface MaintenanceFailure {
  readonly failed: true;
  readonly error: string;
}
const maintenanceFailure = (error: unknown): MaintenanceFailure => ({
  failed: true,
  error: error instanceof Error ? error.message : String(error),
});

export interface NotificationOutboxBatchResult {
  documentMaintenance?: DocumentMaintenanceResult | MaintenanceFailure;
  maintenance?: MaintenanceResult | MaintenanceFailure;
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
  return createNotificationOutboxWorkerWithClient(client, {
    ...options,
    prepareDocuments: async () => {
      const result = await client.rpc("documents_maintain_service", {
        target_batch_size: 100,
      });
      if (result.error) throw new Error(result.error.message);
      return readDocumentMaintenance(result.data);
    },
    prepareBatch: async () => {
      const result = await client.rpc("shift_exchanges_maintain_service", {
        target_batch_size: 100,
      });
      if (result.error) throw new Error(result.error.message);
      return maintenanceSchema.parse(result.data);
    },
  });
}

export function createNotificationOutboxWorkerWithClient(
  client: NotificationRpcClient,
  options: {
    readonly prepareDocuments?: () => Promise<DocumentMaintenanceResult>;
    readonly prepareBatch?: () => Promise<MaintenanceResult>;
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
      // Deadline closures produce their outbox events before this batch leases work.
      // A maintenance fault remains observable without blocking unrelated delivery.
      let maintenance: NotificationOutboxBatchResult["maintenance"];
      if (options.prepareBatch) {
        try {
          maintenance = await options.prepareBatch();
        } catch (error) {
          maintenance = maintenanceFailure(error);
        }
      }
      let documentMaintenance: NotificationOutboxBatchResult["documentMaintenance"];
      if (options.prepareDocuments) {
        try {
          documentMaintenance = await options.prepareDocuments();
        } catch (error) {
          documentMaintenance = maintenanceFailure(error);
        }
      }
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
        failed:
          (maintenance && "failed" in maintenance ? 1 : 0) +
          (documentMaintenance && "failed" in documentMaintenance ? 1 : 0),
        ...(documentMaintenance ? { documentMaintenance } : {}),
        ...(maintenance ? { maintenance } : {}),
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
