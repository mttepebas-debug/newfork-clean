import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Background domain work with no signed-in person (BILDIRIM-01, K1 and K2): close shift exchanges
 * whose deadline passed or whose shift changed, and restrict people whose document deadline passed
 * (KARARLAR K:87 "Kısıtlı kişi"). It used to run inside the notification worker; it has its own
 * cron now so the notification system can go without taking this work with it.
 */
interface MaintenanceRpcClient {
  rpc(
    functionName: "shift_exchanges_maintain_service" | "documents_maintain_service",
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

const shiftExchangeMaintenanceSchema = z.object({
  expired: z.number().int().nonnegative(),
  invalidated: z.number().int().nonnegative(),
  skipped_busy: z.number().int().nonnegative(),
});
type ShiftExchangeMaintenance = z.infer<typeof shiftExchangeMaintenanceSchema>;

const documentMaintenanceSchema = z.object({
  checked: z.number().int().nonnegative(),
  enqueued: z.number().int().nonnegative(),
  // BL-965: cases the database skipped after an error; a database without the field skipped none
  failed_cases: z.number().int().nonnegative().default(0),
  // Requirements newly restricted for a passed deadline; a database without the field said nothing
  suspended: z.number().int().nonnegative().default(0),
});
type DocumentMaintenance = z.infer<typeof documentMaintenanceSchema>;
export const readDocumentMaintenance = (data: unknown): DocumentMaintenance => documentMaintenanceSchema.parse(data);

/** A step that threw; the cron route logs the message and answers only { failed: true } (BL-965). */
export interface MaintenanceFailure {
  readonly failed: true;
  readonly error: string;
}

export interface MaintenanceBatchResult {
  shiftExchanges: ShiftExchangeMaintenance | MaintenanceFailure;
  documents: DocumentMaintenance | MaintenanceFailure;
  failed: number;
}

export interface MaintenanceWorker {
  runBatch(): Promise<MaintenanceBatchResult>;
}

export function createMaintenanceWorker(options: {
  readonly url: string;
  readonly serviceRoleKey: string;
}): MaintenanceWorker {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as MaintenanceRpcClient;
  return createMaintenanceWorkerWithClient(client);
}

export function createMaintenanceWorkerWithClient(client: MaintenanceRpcClient): MaintenanceWorker {
  // One step failing never stops the other.
  async function step<T>(name: "shift_exchanges_maintain_service" | "documents_maintain_service", read: (data: unknown) => T) {
    try {
      const response = await client.rpc(name, { target_batch_size: 100 });
      if (response.error) throw new Error(response.error.message);
      return read(response.data);
    } catch (error) {
      return { failed: true, error: error instanceof Error ? error.message : String(error) } as const;
    }
  }

  return {
    async runBatch() {
      const shiftExchanges = await step("shift_exchanges_maintain_service", (data) => shiftExchangeMaintenanceSchema.parse(data));
      const documents = await step("documents_maintain_service", readDocumentMaintenance);
      return {
        shiftExchanges,
        documents,
        failed: ("failed" in shiftExchanges ? 1 : 0) + ("failed" in documents ? 1 : 0),
      };
    },
  };
}
