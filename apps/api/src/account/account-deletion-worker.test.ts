import { describe, expect, it, vi } from "vitest";
import { createAccountDeletionWorkerWithClient } from "./account-deletion-worker";
import type { RecoveryEmailDelivery } from "./account-security-service";

const requestId = "74000000-0000-4000-8000-000000000001";
const userId = "74000000-0000-4000-8000-000000000011";
const leaseId = "74000000-0000-4000-8000-000000000021";
const now = new Date("2026-09-14T12:00:00.000Z");
const reminder = { request_id: requestId, user_id: userId, email: "test@example.test",
  restore_until: "2026-09-21T12:00:00.000Z", action: "day_7", lease_id: leaseId };

// AVATAR-IKON: the person's avatar photos, one per workspace they uploaded one in.
const photos = [
  "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4/fe201916-aa0e-480b-9144-1e1c8da20a31.jpg",
  "16fe2550-8960-480c-9874-cbc76a8e56a9/bd6b757b-c9ad-4e47-a47e-0a90a43bc0e5/fe201916-aa0e-480b-9144-1e1c8da20a32.png",
];

function fixture(items = [reminder], delivery?: RecoveryEmailDelivery, options: { photos?: string[] } = {}) {
  const queue = [...items];
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => {
    if (name === "claim_account_deletion_work_service") return { data: queue.length ? [queue.shift()] : [], error: null };
    if (name === "prepare_account_deletion_delivery_service") return {
      data: { email: reminder.email, restore_until: reminder.restore_until }, error: null };
    if (name === "list_account_deletion_avatar_photos_service") return { data: options.photos ?? photos, error: null };
    return { data: { status: "completed" }, error: null };
  });
  const remove = vi.fn(async (_paths: string[]) => ({ error: null }));
  const from = vi.fn((_bucket: string) => ({ remove }));
  const updateUserById = vi.fn(async () => ({ error: null }));
  const logError = vi.fn();
  const deliverRecoveryEmail = vi.fn(delivery ?? (async () => undefined));
  const worker = createAccountDeletionWorkerWithClient({
    rpc, storage: { from }, auth: { admin: { updateUserById } },
  }, { appUrl: "https://app.newfork.test", deliverRecoveryEmail, recoverySigningKey: "test-only-signing-key",
    now: () => now, logError });
  return { worker, rpc, from, remove, updateUserById, deliverRecoveryEmail, logError };
}

describe("account deletion worker", () => {
  it("claims just-in-time and finalizes only after avatar cleanup", async () => {
    const f = fixture([reminder, { ...reminder, request_id: "74000000-0000-4000-8000-000000000002", action: "finalize" }]);
    await expect(f.worker.runBatch()).resolves.toEqual({ checked: 2, reminded: 1, finalized: 1, failed: 0 });
    expect(f.rpc).toHaveBeenCalledWith("claim_account_deletion_work_service", { target_batch_size: 1 });
    expect(f.rpc).toHaveBeenCalledWith("prepare_account_deletion_delivery_service", expect.objectContaining({ target_lease_id: leaseId }));
    expect(f.rpc).toHaveBeenCalledWith("list_account_deletion_avatar_photos_service", {
      target_request_id: "74000000-0000-4000-8000-000000000002", target_lease_id: leaseId,
    });
    expect(f.from).toHaveBeenCalledWith("employee-profile-photos");
    expect(f.from).not.toHaveBeenCalledWith("account-profile-photos");
    expect(f.remove).toHaveBeenCalledWith(photos);
    // The photos go before the database forgets where they were.
    const order = f.rpc.mock.invocationCallOrder;
    const listed = f.rpc.mock.calls.findIndex(([name]) => name === "list_account_deletion_avatar_photos_service");
    const purged = f.rpc.mock.calls.findIndex(([name]) => name === "finalize_claimed_account_deletion_service");
    expect(order[listed]!).toBeLessThan(f.remove.mock.invocationCallOrder[0]!);
    expect(f.remove.mock.invocationCallOrder[0]!).toBeLessThan(order[purged]!);
    expect(f.rpc).toHaveBeenCalledWith("finalize_claimed_account_deletion_service", {
      target_request_id: "74000000-0000-4000-8000-000000000002", target_lease_id: leaseId,
    });
    expect(f.updateUserById).toHaveBeenCalledWith(userId, expect.objectContaining({ email_confirm: true, user_metadata: {} }));
  });

  it("keeps the exact reminder link and idempotency key across retries", async () => {
    const first = fixture([reminder], async () => { throw new Error("provider timeout"); });
    const second = fixture();
    await first.worker.runBatch();
    await second.worker.runBatch();
    expect(first.deliverRecoveryEmail.mock.calls[0]![0]).toEqual(second.deliverRecoveryEmail.mock.calls[0]![0]);
    expect(second.deliverRecoveryEmail).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: `account-deletion-${requestId}-day_7`,
    }));
    expect(first.logError).toHaveBeenCalledWith(expect.objectContaining({
      event: "account_deletion_item_failed", requestId, action: "day_7",
    }));
    expect(first.rpc.mock.calls.some(([name]) => name === "complete_account_deletion_work_service")).toBe(false);
  });

  it("parallel batches cannot receive the same claimed item", async () => {
    const f = fixture();
    const results = await Promise.all([f.worker.runBatch(), f.worker.runBatch()]);
    expect(results.reduce((sum, item) => sum + item.reminded, 0)).toBe(1);
    expect(f.deliverRecoveryEmail).toHaveBeenCalledOnce();
  });

  it("deletes no object for somebody who never uploaded a photo", async () => {
    const f = fixture([{ ...reminder, action: "finalize" }], undefined, { photos: [] });
    await expect(f.worker.runBatch()).resolves.toMatchObject({ finalized: 1, failed: 0 });
    expect(f.remove).not.toHaveBeenCalled();
  });

  it("does not purge the account when its photos could not be deleted", async () => {
    const f = fixture([{ ...reminder, action: "finalize" }]);
    f.remove.mockResolvedValueOnce({ error: { message: "storage down" } } as never);
    await expect(f.worker.runBatch()).resolves.toMatchObject({ finalized: 0, failed: 1 });
    expect(f.logError).toHaveBeenCalledWith(expect.objectContaining({ stage: "remove_avatar" }));
    expect(f.rpc.mock.calls.some(([name]) => name === "finalize_claimed_account_deletion_service")).toBe(false);
  });
});
