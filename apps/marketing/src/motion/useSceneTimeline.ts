import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { type SceneScript, stepClasses } from "./scene";
import { useInView } from "./useInView";
import { useMotionAllowed } from "./useMotionAllowed";
import { usePageVisible } from "./usePageVisible";

const RESET_FADE_MS = 450;

export type SceneTimeline = {
  /** 0 = opening frame; beats.length = finished frame. */
  readonly step: number;
  readonly total: number;
  readonly playing: boolean;
  readonly animated: boolean;
  /** Class list for the scene root. */
  readonly className: string;
  readonly play: () => void;
  readonly pause: () => void;
  readonly goTo: (step: number) => void;
};

type Options = {
  /** Start automatically when the scene scrolls into view. */
  readonly autoplay?: boolean;
  /** Visible fraction that counts as "in view". */
  readonly threshold?: number;
};

export function useSceneTimeline(
  ref: RefObject<HTMLElement | null>,
  script: SceneScript,
  { autoplay = true, threshold = 0.35 }: Options = {},
): SceneTimeline {
  const total = script.beats.length;
  const animated = useMotionAllowed();
  const inView = useInView(ref, { threshold });
  const pageVisible = usePageVisible();
  // Server and hydration render step 0 — the opening frame — so the markup matches.
  const [step, setStep] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [userPaused, setUserPaused] = useState(!autoplay);
  const timer = useRef<number | undefined>(undefined);

  // Static mode: jump to the finished frame (CSS already shows it; this keeps
  // `step` honest for anything reading it).
  useEffect(() => {
    if (!animated) setStep(total);
  }, [animated, total]);

  const playing = animated && inView && pageVisible && !userPaused;

  useEffect(() => {
    if (!playing) return;
    window.clearTimeout(timer.current);
    if (step < total) {
      const beat = script.beats[step];
      timer.current = window.setTimeout(() => setStep((current) => current + 1), beat?.delay ?? 0);
    } else if (script.loop) {
      timer.current = window.setTimeout(() => {
        setResetting(true);
        timer.current = window.setTimeout(() => {
          setStep(0);
          // Two frames: one to apply step 0 without transitions, one to lift the fade.
          requestAnimationFrame(() => requestAnimationFrame(() => setResetting(false)));
        }, RESET_FADE_MS);
      }, script.endHold ?? 2400);
    }
    return () => window.clearTimeout(timer.current);
  }, [playing, step, total, script]);

  const play = useCallback(() => setUserPaused(false), []);
  const pause = useCallback(() => setUserPaused(true), []);
  const goTo = useCallback(
    (next: number) => setStep(Math.max(0, Math.min(total, next))),
    [total],
  );

  const className = [
    "scene",
    stepClasses(step),
    resetting ? "is-resetting" : "",
    resetting && step === 0 ? "no-transition" : "",
    playing ? "is-playing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { step, total, playing, animated, className, play, pause, goTo };
}
