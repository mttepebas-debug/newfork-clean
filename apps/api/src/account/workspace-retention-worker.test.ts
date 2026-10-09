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
      { from, rpc, storage: fakeStorage({}).storage },
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
    const worker = createWorkspaceRetentionWorkerWithClient({ from, rpc, storage: fakeStorage({}).storage });

    await expect(worker.runBatch()).resolves.toMatchObject({
      checked: 2,
      completed: 0,
      idempotent: 1,
      failed: 1,
    });
  });

  it("deletes the workspace's onboarding files before it marks the purge done (BL-279)", async () => {
    const workspaceId = "20000000-0000-4000-8000-000000000001";
    const files = fakeStorage({
      [workspaceId]: ["employee-a"],
      [`${workspaceId}/employee-a`]: ["requirement-1"],
      [`${workspaceId}/employee-a/requirement-1`]: ["id-card.pdf", "visa.png"],
    });
    const calls: string[] = [];
    files.remove.mockImplementation(async (paths: string[]) => {
      calls.push(`remove ${paths.join(",")}`);
      return { data: [], error: null };
    });
    const rpc = vi.fn(async () => {
      calls.push("mark");
      return { data: { status: "completed", idempotent: false }, error: null };
    });
    const worker = createWorkspaceRetentionWorkerWithClient({
      from: dueJobs([{ id: "79000000-0000-4000-8000-000000000001", workspace_id: workspaceId }]),
      rpc,
      storage: files.storage,
    });

    await expect(worker.runBatch()).resolves.toMatchObject({ completed: 1, failed: 0 });
    expect(files.bucket).toHaveBeenCalledWith("employee-onboarding");
    expect(calls).toEqual([
      `remove ${workspaceId}/employee-a/requirement-1/id-card.pdf,${workspaceId}/employee-a/requirement-1/visa.png`,
      "mark",
    ]);
  });

  it("leaves the purge pending when a file cannot be deleted", async () => {
    const workspaceId = "20000000-0000-4000-8000-000000000001";
    const files = fakeStorage({ [workspaceId]: ["contract.pdf"] });
    files.remove.mockResolvedValue({ data: [], error: { message: "storage down" } });
    const rpc = vi.fn();
    const worker = createWorkspaceRetentionWorkerWithClient({
      from: dueJobs([{ id: "79000000-0000-4000-8000-000000000001", workspace_id: workspaceId }]),
      rpc,
      storage: files.storage,
    });

    await expect(worker.runBatch()).resolves.toMatchObject({ completed: 0, failed: 1 });
    expect(rpc).not.toHaveBeenCalled();
  });
});

function dueJobs(jobs: { id: string; workspace_id: string }[]) {
  const limit = vi.fn(async () => ({ data: jobs, error: null }));
  const chain = { select: () => chain, eq: () => chain, lte: () => chain, order: () => chain, limit };
  return vi.fn(() => chain) as never;
}

// A folder maps to the names inside it; a name with a dot is a file.
function fakeStorage(tree: Record<string, string[]>) {
  const remove = vi.fn(async (_paths: string[]) => ({ data: [], error: null as { message: string } | null }));
  const list = vi.fn(async (prefix: string) => ({
    data: (tree[prefix] ?? []).map((name) => ({ name, id: name.includes(".") ? `id-${name}` : null })),
    error: null,
  }));
  const bucket = vi.fn(() => ({ list, remove }));
  return { storage: { from: bucket }, bucket, list, remove };
}
