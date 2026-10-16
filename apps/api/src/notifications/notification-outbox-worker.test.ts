import { describe, expect, it, vi } from "vitest";
import { createNotificationOutboxWorker, createNotificationOutboxWorkerWithClient } from "./notification-outbox-worker";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

describe("notification outbox worker", () => {
  it("leases a bounded batch and processes each item", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            id: "e1500000-0000-4000-8000-000000000001",
            event_id: "e1510000-0000-4000-8000-000000000001",
            attempt_count: 1,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: { status: "processed" }, error: null });
    const worker = createNotificationOutboxWorkerWithClient(
      { rpc },
      { workerId: "worker-a", batchSize: 10, leaseSeconds: 30 },
    );

    await expect(worker.runBatch()).resolves.toEqual({
      leased: 1,
      processed: 1,
      skipped: 0,
      retried: 0,
      dead_lettered: 0,
      failed: 0,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "lease_notification_outbox_service",
      {
        target_worker_id: "worker-a",
        target_batch_size: 10,
        target_lease_seconds: 30,
      },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "process_notification_outbox_service",
      {
        target_worker_id: "worker-a",
        target_outbox_id: "e1500000-0000-4000-8000-000000000001",
      },
    );
  });

  it("reports workspace-lifecycle skips without retrying", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            id: "e1500000-0000-4000-8000-000000000004",
            event_id: "e1510000-0000-4000-8000-000000000004",
            attempt_count: 1,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { status: "skipped", reason: "workspace_not_interactive" },
        error: null,
      });
    const worker = createNotificationOutboxWorkerWithClient(
      { rpc },
      { workerId: "worker-d" },
    );

    await expect(worker.runBatch()).resolves.toMatchObject({
      leased: 1,
      processed: 0,
      skipped: 1,
      retried: 0,
      dead_lettered: 0,
      failed: 0,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("records a retry without leaking multiline error details", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            id: "e1500000-0000-4000-8000-000000000002",
            event_id: "e1510000-0000-4000-8000-000000000002",
            attempt_count: 1,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "bad\nrecipient" },
      })
      .mockResolvedValueOnce({ data: { status: "retry" }, error: null });
    const worker = createNotificationOutboxWorkerWithClient(
      { rpc },
      { workerId: "worker-b", maxAttempts: 4, retryBaseDelaySeconds: 10 },
    );

    await expect(worker.runBatch()).resolves.toMatchObject({
      retried: 1,
      failed: 0,
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "fail_notification_outbox_service", {
      target_worker_id: "worker-b",
      target_outbox_id: "e1500000-0000-4000-8000-000000000002",
      target_error: "bad recipient",
      target_max_attempts: 4,
      target_base_delay_seconds: 10,
    });
  });

  it("reports a dead letter after the database applies the attempt bound", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            id: "e1500000-0000-4000-8000-000000000003",
            event_id: "e1510000-0000-4000-8000-000000000003",
            attempt_count: 5,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "poison event" } })
      .mockResolvedValueOnce({ data: { status: "dead_letter" }, error: null });
    const worker = createNotificationOutboxWorkerWithClient(
      { rpc },
      { workerId: "worker-c", maxAttempts: 5 },
    );

    await expect(worker.runBatch()).resolves.toMatchObject({
      dead_lettered: 1,
    });
  });

  // BILDIRIM-01 (K1, K2): expired shift exchanges and document deadlines run on the maintenance
  // cron; the outbox worker only delivers, so tearing it down leaves that work running.
  it("leaves shift exchange and document maintenance to the maintenance cron", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    createClient.mockReturnValue({ rpc });
    const worker = createNotificationOutboxWorker({ url: "http://db.test", serviceRoleKey: "service" });

    await expect(worker.runBatch()).resolves.toEqual({
      leased: 0,
      processed: 0,
      skipped: 0,
      retried: 0,
      dead_lettered: 0,
      failed: 0,
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["lease_notification_outbox_service"]);
  });
});
