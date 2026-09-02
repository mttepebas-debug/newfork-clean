export function shiftDropTargetKey(
  employeeId: string | null,
  locationId: string,
  date: string,
): string {
  return `${employeeId ?? "unassigned"}|${locationId}|${date}`;
}

export function isPrimaryDragActivation(
  button: number | undefined,
  buttons: number | undefined,
): boolean {
  return (
    button === 0 ||
    (button === undefined && (buttons === 1 || buttons === undefined))
  );
}
