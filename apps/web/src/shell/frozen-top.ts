// The frozen top of a screen (Mert 2026-10-16, "header ve tableri freeze yap
// bütün ekranlarda"): the pieces above the content (heading, tabs, a
// workspace bar) stay in place while the content scrolls under them. The
// heading never folds, on a phone too (Mert 2026-10-17, phone notes #4, "Hep
// büyük, sabit"). This is the pure part; useFrozenTop.ts measures the screen
// and applies it.

/** A piece's resting place, measured from the top of the scrolling area's content. */
export type Band = { top: number; bottom: number };

/**
 * Where each piece sticks (`tops`) and how much page background fills the gap
 * above it (`gaps`): every piece sticks where it rests, so nothing moves.
 * `bottom` is where the stuck pieces end.
 */
export function stickyStack(bands: readonly Band[]) {
  const tops: number[] = [];
  const gaps: number[] = [];
  let previous = 0;
  for (const band of bands) {
    tops.push(band.top);
    gaps.push(Math.max(0, band.top - previous));
    previous = band.bottom;
  }
  return { tops, gaps, bottom: bands.length ? previous : 0 };
}
