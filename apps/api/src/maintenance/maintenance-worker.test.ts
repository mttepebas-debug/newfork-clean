import { describe, expect, it, vi } from "vitest";
import { createMaintenanceWorkerWithClient, readDocumentMaintenance } from "./maintenance-worker";

// BILDIRIM-01 (K1, K2): closing expired shift exchanges and restricting people past a document
// deadline ran inside the notification worker; they run on their own cron now.
describe("maintenance worker", () => {
  it("closes expired shift exchanges and runs document maintenance, each once", async () => {
    const rpc = vi.fn(async (name: string) => ({
      error: null,
      data:
        name === "shift_exchanges_maintain_service"
          ? { expired: 1, invalidated: 2, skipped_busy: 0 }
          : { checked: 4, enqueued: 1, failed_cases: 0, suspended: 3 },
    }));
    const worker = createMaintenanceWorkerWithClient({ rpc });

    await expect(worker.runBatch()).resolves.toEqual({
      shiftExchanges: { expired: 1, invalidated: 2, skipped_busy: 0 },
      documents: { checked: 4, enqueued: 1, failed_cases: 0, suspended: 3 },
      failed: 0,
    });
    expect(rpc.mock.calls).toEqual([
      ["shift_exchanges_maintain_service", { target_batch_size: 100 }],
      ["documents_maintain_service", { target_batch_size: 100 }],
    ]);
  });

  it("runs document maintenance even when shift maintenance fails, and keeps each message", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "shift_exchanges_maintain_service"
        ? { data: null, error: { message: "shift maintenance unavailable" } }
        : { data: { checked: 2, enqueued: 0 }, error: null },
    );
    const worker = createMaintenanceWorkerWithClient({ rpc });

    await expect(worker.runBatch()).resolves.toEqual({
      shiftExchanges: { failed: true, error: "shift maintenance unavailable" },
      documents: { checked: 2, enqueued: 0, failed_cases: 0, suspended: 0 },
      failed: 1,
    });
  });

  it("reports a document maintenance failure without hiding shift maintenance", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "documents_maintain_service"
        ? { data: null, error: { message: 'null value in column "notification_key"' } }
        : { data: { expired: 0, invalidated: 0, skipped_busy: 1 }, error: null },
    );
    const worker = createMaintenanceWorkerWithClient({ rpc });

    await expect(worker.runBatch()).resolves.toEqual({
      shiftExchanges: { expired: 0, invalidated: 0, skipped_busy: 1 },
      documents: { failed: true, error: 'null value in column "notification_key"' },
      failed: 1,
    });
  });

  it("reads what the database leaves out as 0", () => {
    expect(readDocumentMaintenance({ checked: 3, enqueued: 1, failed_cases: 1, suspended: 2 })).toEqual({
      checked: 3,
      enqueued: 1,
      failed_cases: 1,
      suspended: 2,
    });
    expect(readDocumentMaintenance({ checked: 3, enqueued: 1 })).toEqual({
      checked: 3,
      enqueued: 1,
      failed_cases: 0,
      suspended: 0,
    });
  });

  // BILDIRIM-03: once the database stops queueing notifications (teardown part C1) it no longer
  // reports `enqueued`; document restriction must keep running every minute without it.
  it("keeps document maintenance running when the database no longer reports enqueued", async () => {
    expect(readDocumentMaintenance({ checked: 3, failed_cases: 0, suspended: 2 })).toEqual({
      checked: 3,
      failed_cases: 0,
      suspended: 2,
    });
    const rpc = vi.fn(async (name: string) => ({
      error: null,
      data:
        name === "shift_exchanges_maintain_service"
          ? { expired: 0, invalidated: 0, skipped_busy: 0 }
          : { checked: 5, failed_cases: 0, suspended: 1 },
    }));
    await expect(createMaintenanceWorkerWithClient({ rpc }).runBatch()).resolves.toEqual({
      shiftExchanges: { expired: 0, invalidated: 0, skipped_busy: 0 },
      documents: { checked: 5, failed_cases: 0, suspended: 1 },
      failed: 0,
    });
  });
});
