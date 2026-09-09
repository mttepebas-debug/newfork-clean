import { describe, expect, it, vi } from "vitest";
import { createWorkspaceRetentionWorkerWithClient } from "./workspace-retention-worker";

describe("workspace retention worker", () => {
  it("processes due purge jobs through the service-only completion RPC", async () => {
    const limit = vi.fn(async () => ({
      data: [
        {
          id: "79000000-0000-4000-8000-000000000001",
          workspace_id: "20000000-0000-4000-8000-000000000001",
        },
      ],
      error: null,
    }));
    const order = vi.fn(() => ({ limit }));
    const lte = vi.fn(() => ({ order }));
    const eq = vi.fn(() => ({ lte }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const rpc = vi.fn(async () => ({
      data: { status: "completed", idempotent: false },
      error: null,
    }));
    const worker = createWorkspaceRetentionWorkerWithClient(
      { from, rpc },
      {
        workerId: "worker-a",
        batchSize: 5,
        now: () => new Date("2026-09-20T12:00:00.000Z"),
      },
    );

    await expect(worker.runBatch()).resolves.toEqual({
      checked: 1,
      completed: 1,
      idempotent: 0,
      failed: 0,
    });
    expect(from).toHaveBeenCalledWith("workspace_retention_purge_jobs");
    expect(select).toHaveBeenCalledWith("id,workspace_id");
    expect(eq).toHaveBeenCalledWith("status", "pending");
    expect(lte).toHaveBeenCalledWith("due_at", "2026-09-20T12:00:00.000Z");
    expect(order).toHaveBeenCalledWith("due_at", { ascending: true });
    expect(limit).toHaveBeenCalledWith(5);
    expect(rpc).toHaveBeenCalledWith(
      "mark_workspace_retention_purge_completed_service",
      {
        target_workspace_id: "20000000-0000-4000-8000-000000000001",
        purge_metadata: {
          executor: "workspace-retention-worker",
          worker_id: "worker-a",
          purge_job_id: "79000000-0000-4000-8000-000000000001",
        },
      },
    );
  });

  it("keeps batch execution idempotent and reports per-job failures", async () => {
    const limit = vi.fn(async () => ({
      data: [
        {
          id: "79000000-0000-4000-8000-000000000002",
          workspace_id: "20000000-0000-4000-8000-000000000002",
        },
        {
          id: "79000000-0000-4000-8000-000000000003",
          workspace_id: "20000000-0000-4000-8000-000000000003",
        },
      ],
      error: null,
    }));
    const order = vi.fn(() => ({ limit }));
    const lte = vi.fn(() => ({ order }));
    const eq = vi.fn(() => ({ lte }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: { status: "completed", idempotent: true },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "workspace retention purge is not due" },
      });
    const worker = createWorkspaceRetentionWorkerWithClient({ from, rpc });

    await expect(worker.runBatch()).resolves.toMatchObject({
      checked: 2,
      completed: 0,
      idempotent: 1,
      failed: 1,
    });
  });
});
