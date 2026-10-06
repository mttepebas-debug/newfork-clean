import {
  createElement,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { type SceneScript } from "./scene";
import { useSceneTimeline, type SceneTimeline } from "./useSceneTimeline";

type SceneProps = {
  readonly script: SceneScript;
  readonly as?: "div" | "section" | "figure";
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly autoplay?: boolean;
  readonly threshold?: number;
  readonly label?: string;
  /** Render-prop access to the timeline (controls, current step). */
  readonly children: ReactNode | ((timeline: SceneTimeline) => ReactNode);
};

/** A self-playing scene: plays while on screen, pauses off screen. */
export function Scene({
  script,
  as = "div",
  className,
  style,
  autoplay = true,
  threshold,
  label,
  children,
}: SceneProps) {
  const ref = useRef<HTMLElement | null>(null);
  const timeline = useSceneTimeline(ref, script, { autoplay, threshold });
  return createElement(
    as,
    {
      ref: ref as RefObject<HTMLElement>,
      className: [timeline.className, className].filter(Boolean).join(" "),
      style,
      "data-step": timeline.step,
      "aria-label": label,
    },
    typeof children === "function" ? children(timeline) : children,
  );
}
