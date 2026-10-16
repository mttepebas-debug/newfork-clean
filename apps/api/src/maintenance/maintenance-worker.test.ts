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
          : { checked: 4, suspended: 3 },
    }));
    const worker = createMaintenanceWorkerWithClient({ rpc });

    await expect(worker.runBatch()).resolves.toEqual({
      shiftExchanges: { expired: 1, invalidated: 2, skipped_busy: 0 },
      documents: { checked: 4, suspended: 3 },
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
        : { data: { checked: 2, suspended: 0 }, error: null },
    );
    const worker = createMaintenanceWorkerWithClient({ rpc });

    await expect(worker.runBatch()).resolves.toEqual({
      shiftExchanges: { failed: true, error: "shift maintenance unavailable" },
      documents: { checked: 2, suspended: 0 },
      failed: 1,
    });
  });

  it("reports a document maintenance failure without hiding shift maintenance", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "documents_maintain_service"
        ? { data: null, error: { message: "document maintenance unavailable" } }
        : { data: { expired: 0, invalidated: 0, skipped_busy: 1 }, error: null },
    );
    const worker = createMaintenanceWorkerWithClient({ rpc });

    await expect(worker.runBatch()).resolves.toEqual({
      shiftExchanges: { expired: 0, invalidated: 0, skipped_busy: 1 },
      documents: { failed: true, error: "document maintenance unavailable" },
      failed: 1,
    });
  });

  // BILDIRIM-06: the database answers what it checked and restricted, nothing more (the
  // notification counts went with the old notification system).
  it("reads what document maintenance checked and restricted", () => {
    expect(readDocumentMaintenance({ checked: 3, suspended: 2 })).toEqual({ checked: 3, suspended: 2 });
    expect(readDocumentMaintenance({ checked: 3, suspended: 2, enqueued: 1, failed_cases: 0 })).toEqual({
      checked: 3,
      suspended: 2,
    });
  });

  it.each([
    ["checked missing", { suspended: 1 }],
    ["suspended missing", { checked: 5 }],
    ["checked not a number", { checked: "5", suspended: 0 }],
    ["no answer at all", null],
  ])("reports a malformed document maintenance answer as a failed step (%s)", async (_label, documents) => {
    const rpc = vi.fn(async (name: string) => ({
      error: null,
      data: name === "shift_exchanges_maintain_service" ? { expired: 0, invalidated: 0, skipped_busy: 0 } : documents,
    }));
    const result = await createMaintenanceWorkerWithClient({ rpc }).runBatch();
    expect(result.shiftExchanges).toEqual({ expired: 0, invalidated: 0, skipped_busy: 0 });
    expect(result.documents).toEqual({ failed: true, error: expect.any(String) });
    expect(result.failed).toBe(1);
  });
});
