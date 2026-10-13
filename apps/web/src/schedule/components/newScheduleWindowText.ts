// Words the New Schedule window shares between its tabs.

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Paid minutes as whole hours ("393"); a week under ten hours keeps its half hours ("7.5"). */
export function hoursText(paidMinutes: number): string {
  const hours = paidMinutes / 60;
  return hours < 10 && !Number.isInteger(hours) ? String(Math.round(hours * 10) / 10) : String(Math.round(hours));
}

/** "just now", "12 min ago", "2 h ago", "yesterday", "4 days ago". */
export function agoText(isoTime: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(isoTime)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
