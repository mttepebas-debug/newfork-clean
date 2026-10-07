// Auto-fill counts its assignments in the singular for one (BL-710).
function assignments(count: number): string {
  return `${count} ${count === 1 ? "assignment" : "assignments"}`;
}

export function autoFillApplyLabel(count: number): string {
  return `Apply ${assignments(count)}`;
}

export function autoFillRejectedText(count: number): string {
  return `${count} auto-fill ${count === 1 ? "assignment" : "assignments"} could not be applied.`;
}
