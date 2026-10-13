export const unpaidBreakMinuteOptions = [0, 15, 30, 45, 60] as const;

export function formatUnpaidBreakOption(minutes: number): string {
  return minutes === 0 ? "None" : `${minutes}m`;
}
