// Scenes are small state machines drawn by CSS. A scene's root carries one
// class per beat it has reached ("s1 s2 s3"); elements say when they appear
// (data-at="3") or leave (data-until="5"), and the CSS in styles/motion.css
// animates the difference. React only ever changes the root's class list.
//
// Rule for scene authors: render every state's markup up front and let the
// classes choose. The markup without classes is the opening frame (what the
// server renders); the markup in static mode (no data-animate) is the
// finished frame, so reduced-motion visitors and crawlers see the whole story.

export type SceneBeat = {
  /** For readability and tests; not rendered. */
  readonly name: string;
  /** Milliseconds to wait, after the previous beat, before this one starts. */
  readonly delay: number;
};

export type SceneScript = {
  readonly beats: readonly SceneBeat[];
  readonly loop?: boolean;
  /** Milliseconds to hold the final beat before looping. */
  readonly endHold?: number;
};

export function stepClasses(step: number): string {
  const classes: string[] = [];
  for (let index = 1; index <= step; index += 1) classes.push(`s${index}`);
  return classes.join(" ");
}

export function scriptDuration(script: SceneScript): number {
  return script.beats.reduce((total, beat) => total + beat.delay, 0) + (script.endHold ?? 0);
}

/** The beat index a scroll position maps to: progress 0..1 spread over the beats. */
export function stepForProgress(progress: number, beatCount: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return Math.min(beatCount, Math.floor(clamped * (beatCount + 0.999)));
}
