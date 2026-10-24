// S-251 (variant A, frame.js): on the phone an unread row is dragged either way to show Read under it, as in
// Notion. Under 72 px it springs back; from 72 px it stays open, slid 96 px, on Read; from half the row it is
// read at once. The list keeps its scroll: the drag decides its way after about 8 px, and up or down wins.

/** From here a let-go row stays open on Read. */
export const swipeOpenAt = 72;
/** How far an open row stays slid. */
export const swipeSlidTo = 96;
/** How far the finger goes before the drag decides between sliding the row and scrolling the list. */
export const swipeDecideAfter = 8;

/** The edge Read shows on: a row dragged right shows it on the left. */
export type SwipeSide = "left" | "right";
export type SwipeEnd = { readonly action: "close" } | { readonly action: "open"; readonly side: SwipeSide } | { readonly action: "read" };

/** Which way a drag goes once it has moved far enough; null while it has not. */
export function swipeAxis(dx: number, dy: number): "x" | "y" | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < swipeDecideAfter) return null;
  return Math.abs(dy) >= Math.abs(dx) ? "y" : "x";
}

/** Where a dragged row sits: with the finger, never past nine tenths of its width. */
export function swipeOffset(offset: number, width: number): number {
  const most = width * 0.9;
  return Math.max(-most, Math.min(most, offset));
}

/** What a let-go row does. */
export function swipeEnd(offset: number, width: number): SwipeEnd {
  const distance = Math.abs(offset);
  if (distance >= width / 2) return { action: "read" };
  if (distance >= swipeOpenAt) return { action: "open", side: offset > 0 ? "left" : "right" };
  return { action: "close" };
}
