import { createElement, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useInView } from "./useInView";

type RevealProps = {
  readonly as?: "div" | "p" | "h2" | "h3" | "li" | "ul" | "header";
  readonly index?: number;
  readonly className?: string;
  readonly children: ReactNode;
};

/** Rises into place the first time it is seen (no-op in static mode). */
export function Reveal({ as = "div", index = 0, className, children }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const seen = useInView(ref, { once: true, threshold: 0.2, rootMargin: "0px 0px -8% 0px" });
  return createElement(
    as,
    {
      ref: ref as RefObject<HTMLElement>,
      className: ["reveal", seen ? "is-in" : "", className].filter(Boolean).join(" "),
      style: { "--i": index } as CSSProperties,
    },
    children,
  );
}
