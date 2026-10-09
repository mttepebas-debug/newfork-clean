import { QueryClient } from "@tanstack/react-query";
import type { SchedulePendingOp } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import { pendingOpsKey } from "../schedule-data";
import {
  createOptimisticPendingOp,
  removePendingOpsFromCaches,
  replacePendingOpInCaches,
  restoreSnapshot,
  restoreSnapshots,
  snapshotQueries,
  snapshotQuery,
  upsertPendingOpCaches,
} from "./optimisticScheduleCache";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const shiftId = "33333333-3333-4333-8333-333333333333";
const draftId = "44444444-4444-4444-8444-444444444444";

function pendingOp(id: string): SchedulePendingOp {
  return {
    id,
    location_id: locationId,
    week_start: "2026-08-17",
    op_type: "update",
    target_shift_id: shiftId,
    target_draft_id: draftId,
    payload: { start_time: "17:00" },
    created_by: actorUserId,
    created_at: "2026-08-17T12:00:00.000Z",
    updated_at: "2026-08-17T12:00:00.000Z",
  };
}

describe("optimisticScheduleCache", () => {
  it("creates local pending operations that satisfy the shared schema shape", () => {
    const op = createOptimisticPendingOp({
      locationId,
      weekStart: "2026-08-17",
      opType: "create",
      targetShiftId: null,
      draftId,
      payload: {
        scheduled_date: "2026-08-17",
        start_time: "09:00",
        end_time: "17:00",
        employee_id: null,
      },
      actorUserId,
    });

    expect(op).toMatchObject({
      location_id: locationId,
      week_start: "2026-08-17",
      op_type: "create",
      target_shift_id: null,
      target_draft_id: draftId,
      created_by: actorUserId,
      payload: {
        scheduled_date: "2026-08-17",
        start_time: "09:00",
        end_time: "17:00",
        employee_id: null,
      },
    });
    expect(op.id).toMatch(/^00000000-0000-4000-8000-\d{12}$/);
  });

  it("upserts, replaces, and removes pending ops across matching cache keys", () => {
    const queryClient = new QueryClient();
    const singleKey = pendingOpsKey("workspace", "2026-08-17", locationId, draftId);
    const multiKey = [
      "schedule-pending-ops",
      "workspace",
      "2026-08-17",
      draftId,
      locationId,
      "55555555-5555-4555-8555-555555555555",
    ] as const;
    const otherWeekKey = pendingOpsKey(
      "workspace",
      "2026-08-24",
      locationId,
      draftId,
    );
    queryClient.setQueryData(singleKey, { pending_ops: [pendingOp(shiftId)] });
    queryClient.setQueryData(multiKey, { pending_ops: [] });
    queryClient.setQueryData(otherWeekKey, { pending_ops: [pendingOp(shiftId)] });

    const local = pendingOp("66666666-6666-4666-8666-666666666666");
    upsertPendingOpCaches(
      queryClient,
      ["schedule-pending-ops", "workspace", "2026-08-17"],
      local,
    );
    replacePendingOpInCaches(
      queryClient,
      ["schedule-pending-ops", "workspace", "2026-08-17"],
      local.id,
      "77777777-7777-4777-8777-777777777777",
    );

    expect(
      queryClient
        .getQueryData<{ pending_ops: SchedulePendingOp[] }>(singleKey)
        ?.pending_ops.map((op) => op.id),
    ).toEqual([shiftId, "77777777-7777-4777-8777-777777777777"]);
    expect(
      queryClient
        .getQueryData<{ pending_ops: SchedulePendingOp[] }>(multiKey)
        ?.pending_ops.map((op) => op.id),
    ).toEqual(["77777777-7777-4777-8777-777777777777"]);

    removePendingOpsFromCaches(
      queryClient,
      ["schedule-pending-ops", "workspace", "2026-08-17"],
      ["77777777-7777-4777-8777-777777777777"],
    );

    expect(
      queryClient.getQueryData<{ pending_ops: SchedulePendingOp[] }>(singleKey)
        ?.pending_ops,
    ).toEqual([pendingOp(shiftId)]);
    expect(
      queryClient.getQueryData<{ pending_ops: SchedulePendingOp[] }>(multiKey)
        ?.pending_ops,
    ).toEqual([]);
    expect(
      queryClient.getQueryData<{ pending_ops: SchedulePendingOp[] }>(otherWeekKey)
        ?.pending_ops,
    ).toEqual([pendingOp(shiftId)]);
  });

  it("snapshots and restores individual and prefixed query data", () => {
    const queryClient = new QueryClient();
    const keyA = pendingOpsKey("workspace", "2026-08-17", locationId, draftId);
    const keyB = pendingOpsKey(
      "workspace",
      "2026-08-17",
      "55555555-5555-4555-8555-555555555555",
      draftId,
    );
    queryClient.setQueryData(keyA, { pending_ops: [pendingOp(shiftId)] });
    queryClient.setQueryData(keyB, { pending_ops: [] });

    const snapshot = snapshotQuery<{ pending_ops: SchedulePendingOp[] }>(
      queryClient,
      keyA,
    );
    const snapshots = snapshotQueries<{ pending_ops: SchedulePendingOp[] }>(
      queryClient,
      ["schedule-pending-ops", "workspace", "2026-08-17"],
    );
    queryClient.setQueryData(keyA, { pending_ops: [] });
    queryClient.setQueryData(keyB, { pending_ops: [pendingOp(shiftId)] });

    restoreSnapshot(queryClient, snapshot);
    expect(queryClient.getQueryData(keyA)).toEqual({
      pending_ops: [pendingOp(shiftId)],
    });

    queryClient.setQueryData(keyA, { pending_ops: [] });
    restoreSnapshots(queryClient, snapshots);
    expect(queryClient.getQueryData(keyA)).toEqual({
      pending_ops: [pendingOp(shiftId)],
    });
    expect(queryClient.getQueryData(keyB)).toEqual({ pending_ops: [] });
  });
});
