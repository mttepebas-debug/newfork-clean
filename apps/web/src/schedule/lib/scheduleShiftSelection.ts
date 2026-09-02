export function resolveScheduleShiftSelectionIds({
  currentIds,
  focusedShiftId,
  shiftId,
  additive,
}: {
  readonly currentIds: readonly string[];
  readonly focusedShiftId: string | null;
  readonly shiftId: string;
  readonly additive: boolean;
}): string[] {
  if (!additive) return [shiftId];

  const baseIds =
    currentIds.length || !focusedShiftId || focusedShiftId === shiftId
      ? [...currentIds]
      : [focusedShiftId];

  return baseIds.includes(shiftId)
    ? baseIds.filter((id) => id !== shiftId)
    : [...baseIds, shiftId];
}
