// The frozen top of a screen (Mert 2026-10-16, "header ve tableri freeze yap
// bütün ekranlarda"; phone "B"): the pieces above the content (heading, tabs,
// a workspace bar) stay in place while the content scrolls under them. On a
// phone the heading folds to one line once the page has moved. These are the
// pure parts; useFrozenTop.ts measures the screen and applies them.

/** A piece's resting place, measured from the top of the scrolling area's content. */
export type Band = { top: number; bottom: number };

const FOLDED_GAP = 6;

/**
 * Where each piece sticks (`tops`) and how much page background fills the gap
 * above it (`gaps`). Open: every piece sticks where it rests, so nothing moves.
 * Folded: the pieces stack from the top with small gaps; a hidden piece takes
 * no room. `bottom` is where the stuck pieces end.
 */
export function stickyStack(bands: readonly Band[], folded: boolean) {
  const tops: number[] = [];
  const gaps: number[] = [];
  let previous = 0;
  let y = 0;
  let first = true;
  for (const band of bands) {
    const height = band.bottom - band.top;
    if (!folded) {
      tops.push(band.top);
      gaps.push(Math.max(0, band.top - previous));
      previous = band.bottom;
      y = band.bottom;
      continue;
    }
    const gap = height <= 0 || first ? 0 : Math.min(FOLDED_GAP, Math.max(0, band.top - previous));
    y += gap;
    tops.push(y);
    gaps.push(gap);
    if (height > 0) {
      y += height;
      previous = band.bottom;
      first = false;
    }
  }
  return { tops, gaps, bottom: y };
}

/**
 * When a scrolling page folds and opens again. The page keeps its length when
 * it folds (the last piece's margin makes up the difference), so it folds only
 * once the content has scrolled past where the folded pieces end: then nothing
 * jumps and no gap opens under them. It opens again a little higher up.
 */
export function foldPoint(openBottom: number, foldedBottom: number) {
  const on = Math.max(24, openBottom - foldedBottom + 8);
  return { on, off: on - 16 };
}

export function nextFolded(folded: boolean, scrolled: number, point: { on: number; off: number }) {
  return folded ? scrolled > point.off : scrolled > point.on;
}
