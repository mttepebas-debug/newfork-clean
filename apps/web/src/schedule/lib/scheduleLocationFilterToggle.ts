export function nextScheduleLocationHeaderFilter({
  selectedLocationIds,
  toggledLocationIds,
}: {
  readonly selectedLocationIds: readonly string[];
  readonly toggledLocationIds: readonly string[];
}): readonly string[] {
  if (!toggledLocationIds.length) return selectedLocationIds;
  const selectedSet = new Set(selectedLocationIds);
  const locationSet = new Set(toggledLocationIds);
  const sameSelection =
    selectedSet.size === locationSet.size &&
    toggledLocationIds.every((id) => selectedSet.has(id));

  return sameSelection ? selectedLocationIds : [...toggledLocationIds];
}
