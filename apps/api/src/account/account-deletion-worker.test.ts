import { describe, expect, it, vi } from "vitest";
import { createAccountDeletionWorkerWithClient } from "./account-deletion-worker";
import type { RecoveryEmailDelivery } from "./account-security-service";

const requestId = "74000000-0000-4000-8000-000000000001";
const userId = "74000000-0000-4000-8000-000000000011";
const leaseId = "74000000-0000-4000-8000-000000000021";
const now = new Date("2026-09-14T12:00:00.000Z");
const reminder = { request_id: requestId, user_id: userId, email: "test@example.test",
  restore_until: "2026-09-21T12:00:00.000Z", action: "day_7", lease_id: leaseId };

// AVATAR-IKON: the person's avatar photos, one per workspace they uploaded one in, and the folders of
// every membership they had in the private bucket, where an unconfirmed upload or a failed delete may sit.
const wsA = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const wsB = "16fe2550-8960-480c-9874-cbc76a8e56a9";
const wsC = "26fe2550-8960-480c-9874-cbc76a8e56a9";
const mA = "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4";
const mB = "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e5";
const mC = "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e6";
const photos = [
  `${wsA}/${mA}/fe201916-aa0e-480b-9144-1e1c8da20a31.jpg`,
  `${wsB}/${mB}/fe201916-aa0e-480b-9144-1e1c8da20a32.png`,
];
const folders = [`${wsA}/${mA}/`, `${wsB}/${mB}/`, `${wsC}/${mC}/`];
const stored: Record<string, string[]> = {
  [`${wsA}/${mA}`]: ["fe201916-aa0e-480b-9144-1e1c8da20a31.jpg", "fe201916-aa0e-480b-9144-1e1c8da20a41.webp"],
  [`${wsB}/${mB}`]: ["fe201916-aa0e-480b-9144-1e1c8da20a32.png"],
  [`${wsC}/${mC}`]: ["fe201916-aa0e-480b-9144-1e1c8da20a43.jpg"],
};
const everything = [
  ...photos,
  `${wsA}/${mA}/fe201916-aa0e-480b-9144-1e1c8da20a41.webp`,
  `${wsC}/${mC}/fe201916-aa0e-480b-9144-1e1c8da20a43.jpg`,
].sort();

function fixture(
  items = [reminder],
  delivery?: RecoveryEmailDelivery,
  options: { photos?: string[]; folders?: string[]; stored?: Record<string, string[]> } = {},
) {
  const queue = [...items];
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => {
    if (name === "claim_account_deletion_work_service") return { data: queue.length ? [queue.shift()] : [], error: null };
    if (name === "prepare_account_deletion_delivery_service") return {
      data: { email: reminder.email, restore_until: reminder.restore_until }, error: null };
    if (name === "list_account_deletion_avatar_objects_service")
      return { data: { photos: options.photos ?? photos, folders: options.folders ?? folders }, error: null };
    return { data: { status: "completed" }, error: null };
  });
  const files = options.stored ?? stored;
  const list = vi.fn(async (path: string, page: { limit: number; offset: number }) => ({
    data: (files[path] ?? []).slice(page.offset, page.offset + page.limit).map((name) => ({ name, id: name })),
    error: null as { message: string } | null,
  }));
  const remove = vi.fn(async (_paths: string[]) => ({ error: null }));
  const from = vi.fn((_bucket: string) => ({ list, remove }));
  const updateUserById = vi.fn(async () => ({ error: null }));
  const logError = vi.fn();
  const deliverRecoveryEmail = vi.fn(delivery ?? (async () => undefined));
  const worker = createAccountDeletionWorkerWithClient({
    rpc, storage: { from }, auth: { admin: { updateUserById } },
  }, { appUrl: "https://app.newfork.test", deliverRecoveryEmail, recoverySigningKey: "test-only-signing-key",
    now: () => now, logError });
  return { worker, rpc, from, list, remove, updateUserById, deliverRecoveryEmail, logError };
}

const removed = (f: ReturnType<typeof fixture>) => f.remove.mock.calls.flatMap(([paths]) => paths).sort();

describe("account deletion worker", () => {
  it("claims just-in-time and finalizes only after avatar cleanup", async () => {
    const f = fixture([reminder, { ...reminder, request_id: "74000000-0000-4000-8000-000000000002", action: "finalize" }]);
    await expect(f.worker.runBatch()).resolves.toEqual({ checked: 2, reminded: 1, finalized: 1, failed: 0 });
    expect(f.rpc).toHaveBeenCalledWith("claim_account_deletion_work_service", { target_batch_size: 1 });
    expect(f.rpc).toHaveBeenCalledWith("prepare_account_deletion_delivery_service", expect.objectContaining({ target_lease_id: leaseId }));
    expect(f.rpc).toHaveBeenCalledWith("list_account_deletion_avatar_objects_service", {
      target_request_id: "74000000-0000-4000-8000-000000000002", target_lease_id: leaseId,
    });
    expect(f.from).toHaveBeenCalledWith("employee-profile-photos");
    expect(f.from).not.toHaveBeenCalledWith("account-profile-photos");
    // The avatar photos and whatever else sits in the person's folders, each once.
    expect(removed(f)).toEqual(everything);
    expect(f.list).toHaveBeenCalledWith(`${wsC}/${mC}`, expect.objectContaining({ offset: 0 }));
    // The objects go before the database forgets where they were, and before the account is anonymized.
    const order = f.rpc.mock.invocationCallOrder;
    const listed = f.rpc.mock.calls.findIndex(([name]) => name === "list_account_deletion_avatar_objects_service");
    const purged = f.rpc.mock.calls.findIndex(([name]) => name === "finalize_claimed_account_deletion_service");
    expect(order[listed]!).toBeLessThan(f.list.mock.invocationCallOrder[0]!);
    expect(Math.max(...f.list.mock.invocationCallOrder)).toBeLessThan(f.remove.mock.invocationCallOrder[0]!);
    expect(Math.max(...f.remove.mock.invocationCallOrder)).toBeLessThan(f.updateUserById.mock.invocationCallOrder[0]!);
    expect(Math.max(...f.remove.mock.invocationCallOrder)).toBeLessThan(order[purged]!);
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
    const f = fixture([{ ...reminder, action: "finalize" }], undefined, { photos: [], stored: {} });
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

  it("sweeps a folder page after page", async () => {
    const many = Array.from({ length: 250 }, (_, index) => `fe201916-aa0e-480b-9144-${String(index).padStart(12, "0")}.jpg`);
    const f = fixture([{ ...reminder, action: "finalize" }], undefined, {
      photos: [], folders: [`${wsC}/${mC}/`], stored: { [`${wsC}/${mC}`]: many },
    });
    await expect(f.worker.runBatch()).resolves.toMatchObject({ finalized: 1, failed: 0 });
    expect(f.list.mock.calls.map(([, page]) => page.offset)).toEqual([0, 100, 200]);
    expect(removed(f)).toEqual(many.map((name) => `${wsC}/${mC}/${name}`).sort());
  });

  it("does not purge the account when a folder cannot be read", async () => {
    const f = fixture([{ ...reminder, action: "finalize" }]);
    f.list.mockResolvedValueOnce({ data: [], error: { message: "storage down" } });
    await expect(f.worker.runBatch()).resolves.toMatchObject({ finalized: 0, failed: 1 });
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.updateUserById).not.toHaveBeenCalled();
    expect(f.rpc.mock.calls.some(([name]) => name === "finalize_claimed_account_deletion_service")).toBe(false);
  });

  it("refuses a folder that is not a membership's own place", async () => {
    const f = fixture([{ ...reminder, action: "finalize" }], undefined, { folders: ["", `${wsA}/`] });
    await expect(f.worker.runBatch()).resolves.toMatchObject({ finalized: 0, failed: 1 });
    expect(f.list).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });
});
