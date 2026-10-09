export function resolveScheduleDeleteShiftIds({
  selectedIds,
  focusedShiftId,
  editableShiftIds,
}: {
  readonly selectedIds: readonly string[];
  readonly focusedShiftId: string | null;
  readonly editableShiftIds: readonly string[];
}): string[] {
  const editableIds = new Set(editableShiftIds);
  const selectedShiftIds = selectedIds.filter((id) => editableIds.has(id));
  if (selectedShiftIds.length) return selectedShiftIds;
  return focusedShiftId && editableIds.has(focusedShiftId)
    ? [focusedShiftId]
    : [];
}
