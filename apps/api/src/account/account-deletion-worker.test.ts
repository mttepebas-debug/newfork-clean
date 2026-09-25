import { describe, expect, it, vi } from "vitest";
import { createAccountDeletionWorkerWithClient } from "./account-deletion-worker";
import type { RecoveryEmailDelivery } from "./account-security-service";

const requestId = "74000000-0000-4000-8000-000000000001";
const userId = "74000000-0000-4000-8000-000000000011";
const leaseId = "74000000-0000-4000-8000-000000000021";
const now = new Date("2026-09-14T12:00:00.000Z");
const reminder = { request_id: requestId, user_id: userId, email: "test@example.test",
  restore_until: "2026-09-21T12:00:00.000Z", action: "day_7", lease_id: leaseId };

function fixture(items = [reminder], delivery?: RecoveryEmailDelivery) {
  const queue = [...items];
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => {
    if (name === "claim_account_deletion_work_service") return { data: queue.length ? [queue.shift()] : [], error: null };
    if (name === "prepare_account_deletion_delivery_service") return {
      data: { email: reminder.email, restore_until: reminder.restore_until }, error: null };
    return { data: { status: "completed" }, error: null };
  });
  const list = vi.fn(async () => ({ data: [{ name: "avatar.jpg" }], error: null }));
  const remove = vi.fn(async () => ({ error: null }));
  const updateUserById = vi.fn(async () => ({ error: null }));
  const logError = vi.fn();
  const deliverRecoveryEmail = vi.fn(delivery ?? (async () => undefined));
  const worker = createAccountDeletionWorkerWithClient({
    rpc, storage: { from: () => ({ list, remove }) }, auth: { admin: { updateUserById } },
  }, { appUrl: "https://app.newfork.test", deliverRecoveryEmail, recoverySigningKey: "test-only-signing-key",
    now: () => now, logError });
  return { worker, rpc, remove, updateUserById, deliverRecoveryEmail, logError };
}

describe("account deletion worker", () => {
  it("claims just-in-time and finalizes only after avatar cleanup", async () => {
    const f = fixture([reminder, { ...reminder, request_id: "74000000-0000-4000-8000-000000000002", action: "finalize" }]);
    await expect(f.worker.runBatch()).resolves.toEqual({ checked: 2, reminded: 1, finalized: 1, failed: 0 });
    expect(f.rpc).toHaveBeenCalledWith("claim_account_deletion_work_service", { target_batch_size: 1 });
    expect(f.rpc).toHaveBeenCalledWith("prepare_account_deletion_delivery_service", expect.objectContaining({ target_lease_id: leaseId }));
    expect(f.remove).toHaveBeenCalledWith([`${userId}/profile/avatar.jpg`]);
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
});
