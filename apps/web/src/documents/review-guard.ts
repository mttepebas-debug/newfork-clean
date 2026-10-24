// A2 Tur 6 (mockup-spec 17, mockup tur2-a2.js:561-634): a repeated click, tap or key press never answers what was
// just drawn under it. The green button changes meaning in place (Save → Next: Ana Ruiz), and a tap on the phone's
// row to the files draws the Files tab under the finger, so:
// - the 2nd and 3rd click of a double or triple click (detail > 1) are dropped when they come less than 400 ms after
//   the click before them, counted or dropped; a deliberate second click later than that counts;
// - on touch, a guarded tap within 40 px of the tap before it and less than 400 ms later is dropped;
// - for 400 ms after the green's meaning changes inside an open drawer, every press on it is dropped;
// - a key press on the green less than 400 ms after the one before is dropped;
// - the click that opened the drawer counts as the click before, so the second click of that double click, landing
//   on the card just drawn under it, is dropped too.
// Times come from the caller (performance.now()), so the rules are pure.

const quiet = 400;
const near = 40;

export type ReviewGuard = ReturnType<typeof createReviewGuard>;

/** `openedAt`: when the drawer opened, from the click that opened it. */
export function createReviewGuard(openedAt = -Infinity) {
  let meaning: string | null = null;
  let heldUntil = -Infinity;
  let lastGreenKey = -Infinity;
  let lastClick = openedAt;
  let lastTap: { now: number; x: number; y: number } | null = null;
  return {
    /** The green's meaning now; a change after the first holds the green. */
    mean(key: string, now: number) {
      if (meaning !== null && key !== meaning) heldUntil = now + quiet;
      meaning = key;
    },
    /** The green ignores presses now. */
    held(now: number): boolean {
      return now < heldUntil;
    },
    /** A key press (Enter, Space) on the green; true when it is to be dropped. */
    greenKey(now: number): boolean {
      const drop = now - lastGreenKey < quiet;
      lastGreenKey = now;
      return drop;
    },
    /** A click in the drawer; true when it is to be dropped. */
    click({
      now,
      detail,
      touch,
      x,
      y,
      guarded,
    }: {
      now: number;
      detail: number;
      touch: boolean;
      x: number;
      y: number;
      /** One of the actions a repeated tap must not answer (the green, a file's choice, the strip). */
      guarded: boolean;
    }): boolean {
      const repeat = detail > 1 && now - lastClick < quiet;
      lastClick = now;
      if (repeat) return true;
      if (!guarded) return false;
      const before = lastTap;
      lastTap = touch ? { now, x, y } : null;
      return (
        touch &&
        before !== null &&
        now - before.now < quiet &&
        Math.abs(x - before.x) < near &&
        Math.abs(y - before.y) < near
      );
    },
    /** The press of a repeated click: its focus must not move either. */
    repeatPress(now: number, detail: number): boolean {
      return detail > 1 && now - lastClick < quiet;
    },
  };
}
