export interface Interval {
  readonly s: number;
  readonly e: number;
}

function parseMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new Error(`Invalid time string: ${JSON.stringify(t)}`);
  }
  if (h! < 0 || h! > 23 || m! < 0 || m! > 59) {
    throw new Error(`Time out of range: ${JSON.stringify(t)}`);
  }
  return h! * 60 + m!;
}

export function toInterval(
  startStr: string,
  endStr: string,
  crossesMidnight: boolean,
  dateDelta: number,
): Interval {
  const base = dateDelta * 1440;
  const s = base + parseMin(startStr);
  const e = crossesMidnight ? base + 1440 + parseMin(endStr) : base + parseMin(endStr);
  return { s, e };
}

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.s < b.e && b.s < a.e;
}

export function timeToBucket(startStr: string): "morning" | "evening" | "night" {
  const min = parseMin(startStr);
  if (min >= 5 * 60 && min < 12 * 60) return "morning";
  if (min >= 12 * 60 && min < 18 * 60) return "evening";
  return "night";
}
