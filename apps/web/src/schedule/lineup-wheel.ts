// The phone Lineup's day wheel and its top (KARARLAR Lineup, Mert 2026-10-17: E · Çark tarih, D1–D3).
// Seven days in view, the middle one is the day; a drag follows the finger, a flick spins on and slows to a
// whole day; a month change holds the wheel a moment. These are the pure parts; views/LineupPhone.tsx moves
// the DOM with them.

export const WHEEL = {
  /** Days each side of the anchor the wheel holds (it re-anchors near an end). */
  span: 190,
  /** The month detent, ms. */
  hold: 60,
  /** Slowing, days per ms². */
  decel: 0.00007,
  /** Top release speed, days per ms (about four weeks of spin). */
  vmax: 0.06,
  /** The release speed is read over this much of the drag, ms… */
  window: 100,
  /** …and never over less, so two events a few ms apart can't fake a huge speed. */
  minWindow: 24,
  /** A finger that rested this long before letting go doesn't spin the wheel, ms. */
  staleRelease: 80,
  /** A touchpad swipe has ended after this much quiet, ms. */
  wheelIdle: 140,
} as const;

const DAY_MS = 86_400_000;
const noon = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const format = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Date(noon(iso)).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });

/** The day `index` days from `anchor`. */
export function wheelIso(anchor: string, index: number): string {
  return new Date(noon(anchor) + index * DAY_MS).toISOString().slice(0, 10);
}

/** How many days `iso` is from `anchor`. */
export function wheelIndex(anchor: string, iso: string): number {
  return Math.round((noon(iso) - noon(anchor)) / DAY_MS);
}

/** A wheel cell: the weekday on top, or the month on its first day (NOV), the day number and the full name. */
export function wheelCell(iso: string): { top: string; day: number; first: boolean; label: string } {
  const day = Number(iso.slice(8, 10));
  const first = day === 1;
  return {
    top: format(iso, first ? { month: "short" } : { weekday: "short" }).toUpperCase(),
    day,
    first,
    label: format(iso, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
  };
}

/** The date button over the wheel: "Sat, Nov 7"; "Fri, Jan 15, 2027" in another year. */
export function wheelDateText(iso: string, today: string): string {
  const year = iso.slice(0, 4) !== today.slice(0, 4);
  return format(iso, { weekday: "short", month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
}

/** Where months meet on the wheel: half a day before each first of the month within ±span. */
export function monthEdges(anchor: string, span: number): number[] {
  const edges: number[] = [];
  for (let index = -span + 1; index <= span; index++) if (wheelIso(anchor, index).endsWith("-01")) edges.push(index - 0.5);
  return edges;
}

/** The month edge a move from `from` to `to` crosses, if any. */
export function crossedEdge(from: number, to: number, edges: readonly number[]): number | null {
  for (const edge of edges) if ((from - edge) * (to - edge) < 0) return edge;
  return null;
}

/**
 * The speed a drag lets go at, in days per ms (positive: toward later days), from its last pointer samples
 * [time ms, x px]: over the last ~100 ms, never under 24 ms, capped at VMAX; none if the finger rested.
 */
export function releaseVelocity(samples: readonly (readonly [number, number])[], releasedAt: number, dayWidth: number): number {
  const last = samples[samples.length - 1];
  if (!last || !dayWidth || releasedAt - last[0] > WHEEL.staleRelease) return 0;
  let from = last;
  for (let index = samples.length - 1; index >= 0; index--) {
    from = samples[index]!;
    if (last[0] - from[0] >= WHEEL.window) break;
  }
  const elapsed = Math.max(WHEEL.minWindow, last[0] - from[0]);
  const velocity = -((last[1] - from[1]) / dayWidth) / elapsed;
  return Math.max(-WHEEL.vmax, Math.min(WHEEL.vmax, velocity));
}

/** Where a flick at `velocity` stops (a whole day within ±span) and how long the spin takes. */
export function flingTarget(position: number, velocity: number, span: number): { to: number; duration: number } {
  const distance = (velocity * Math.abs(velocity)) / (2 * WHEEL.decel);
  const to = Math.max(-span, Math.min(span, Math.round(position + distance)));
  const travel = Math.abs(to - position);
  const speed = Math.abs(velocity);
  return { to, duration: Math.max(220, Math.min(2200, speed > 1e-4 ? (3 * travel) / speed : 300)) };
}

/** A tap, ‹ › or an arrow key turns the wheel to that day in this long, ms. */
export function seekDuration(distance: number): number {
  return 480 + 60 * Math.min(Math.abs(distance), 20);
}

export function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * The Publish dock (D1, D3; Mert 2026-10-17 "a little further right"): 10 px over the phone's bottom bar,
 * its right edge on the bar's inner edge, where the last tab (More) ends. With no bar (a window between the
 * phone and the computer layouts), 16 px off the corner.
 */
export function dockPlace({
  bar,
  moreRight,
  viewport,
}: {
  bar: { top: number } | null;
  moreRight: number | null;
  viewport: { width: number; height: number };
}): { right: number | null; bottom: number } {
  if (!bar || moreRight === null) return { right: null, bottom: 16 };
  return { right: Math.round(viewport.width - moreRight), bottom: Math.round(viewport.height - bar.top + 10) };
}
