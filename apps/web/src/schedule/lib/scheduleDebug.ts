let nextScheduleOperationId = 1;

export function createScheduleDebugOperationId(): string {
  const id = `schedule-op-${nextScheduleOperationId}`;
  nextScheduleOperationId += 1;
  return id;
}

export function resetScheduleDebugOperationIdsForTest(): void {
  nextScheduleOperationId = 1;
}
