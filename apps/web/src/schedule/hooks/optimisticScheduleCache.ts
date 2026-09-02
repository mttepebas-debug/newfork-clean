import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type {
  SchedulePendingOp,
  SchedulePendingOpPayload,
  SchedulePendingOpType,
} from "@newfork/shared/schedule";

export interface PendingOpsCache {
  readonly pending_ops: SchedulePendingOp[];
}

export interface QuerySnapshot<T> {
  readonly key: QueryKey;
  readonly data: T | undefined;
}

let localPendingOpSeq = 0;

function localUuid(seed: number): string {
  return `00000000-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}

export function localPendingOpId(): string {
  localPendingOpSeq += 1;
  return localUuid(localPendingOpSeq);
}

export function createOptimisticPendingOp({
  locationId,
  weekStart,
  opType,
  targetShiftId,
  draftId,
  payload,
  actorUserId,
}: {
  readonly locationId: string;
  readonly weekStart: string;
  readonly opType: SchedulePendingOpType;
  readonly targetShiftId: string | null;
  readonly draftId: string | null;
  readonly payload: SchedulePendingOpPayload;
  readonly actorUserId: string;
}): SchedulePendingOp {
  const now = new Date().toISOString();
  return {
    id: localPendingOpId(),
    location_id: locationId,
    week_start: weekStart,
    op_type: opType,
    target_shift_id: targetShiftId,
    target_draft_id: draftId,
    payload,
    created_by: actorUserId,
    created_at: now,
    updated_at: now,
  };
}

export function snapshotQuery<T>(
  queryClient: QueryClient,
  key: QueryKey,
): QuerySnapshot<T> {
  return { key, data: queryClient.getQueryData<T>(key) };
}

export function restoreSnapshot<T>(
  queryClient: QueryClient,
  snapshot: QuerySnapshot<T> | null | undefined,
): void {
  if (!snapshot) return;
  queryClient.setQueryData<T | undefined>(snapshot.key, snapshot.data);
}

export function snapshotQueries<T>(
  queryClient: QueryClient,
  prefix: QueryKey,
): QuerySnapshot<T>[] {
  return queryClient
    .getQueriesData<T>({ queryKey: prefix })
    .map(([key, data]) => ({ key, data }));
}

export function restoreSnapshots<T>(
  queryClient: QueryClient,
  snapshots: readonly QuerySnapshot<T>[],
): void {
  snapshots.forEach((snapshot) =>
    queryClient.setQueryData<T | undefined>(snapshot.key, snapshot.data),
  );
}

export function upsertPendingOpCaches(
  queryClient: QueryClient,
  prefix: QueryKey,
  op: SchedulePendingOp,
): void {
  queryClient.setQueriesData<PendingOpsCache | undefined>(
    { queryKey: prefix },
    (current) => {
      if (!current) return { pending_ops: [op] };
      const withoutPrior = current.pending_ops.filter((row) => row.id !== op.id);
      return { pending_ops: [...withoutPrior, op] };
    },
  );
}

export function replacePendingOpInCaches(
  queryClient: QueryClient,
  prefix: QueryKey,
  matchId: string,
  replacementId: string,
): void {
  queryClient.setQueriesData<PendingOpsCache | undefined>(
    { queryKey: prefix },
    (current) =>
      current
        ? {
            pending_ops: current.pending_ops.map((op) =>
              op.id === matchId ? { ...op, id: replacementId } : op,
            ),
          }
        : current,
  );
}

export function removePendingOpsFromCaches(
  queryClient: QueryClient,
  prefix: QueryKey,
  ids: readonly string[],
): void {
  const idSet = new Set(ids);
  queryClient.setQueriesData<PendingOpsCache | undefined>(
    { queryKey: prefix },
    (current) =>
      current
        ? {
            pending_ops: current.pending_ops.filter((op) => !idSet.has(op.id)),
          }
        : current,
  );
}
