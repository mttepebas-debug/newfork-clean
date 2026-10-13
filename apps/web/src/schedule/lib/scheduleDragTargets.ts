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

/**
 * Where on a card the press landed, from its top-left corner. The lifted card
 * keeps this point under the mouse, so it starts the drag exactly where it lay
 * in its cell instead of jumping beside the pointer, over the next day (Mert,
 * 2026-10-13).
 */
export function grabPoint(
  bounds: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
  clientX: number,
  clientY: number,
): { readonly grabX: number; readonly grabY: number } {
  return {
    grabX: Math.min(Math.max(clientX - bounds.left, 0), bounds.width),
    grabY: Math.min(Math.max(clientY - bounds.top, 0), bounds.height),
  };
}
