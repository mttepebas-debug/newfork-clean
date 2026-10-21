// Motion for the Home Screen guide (Web Animations API; no View Transitions, no library). A player plays
// its step once, stops on the last frame and never loops (K8); Replay is only ever the person's tap.
// With reduced motion a player jumps straight to its last frame (K9).

export const EMPH = "cubic-bezier(0.2, 0, 0, 1)";
export const DECEL = "cubic-bezier(0.05, 0.7, 0.1, 1)";
export const ACCEL = "cubic-bezier(0.3, 0, 0.8, 0.15)";
export const OUT = "cubic-bezier(0, 0, 0.2, 1)";
/** The fingertip walks rather than flies (Mert, 20 October 2026): an even start and stop the eye can follow. */
export const WALK = "cubic-bezier(0.45, 0, 0.25, 1)";

type Prop = "translate" | "scale" | "opacity" | "background-color";
export type Segment = {
  readonly el: HTMLElement | SVGElement | null | undefined;
  readonly prop: Prop;
  readonly from: string | number;
  readonly to: string | number;
  readonly at: number;
  readonly dur: number;
  readonly ease?: string;
};

const camel = (prop: Prop) => (prop === "background-color" ? "backgroundColor" : prop);

export function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export type Player = { readonly total: number; play(): void; finish(): void; cancel(): void };

/** One step's segments as a player: each (element, property) becomes one animation over the step's length. */
export function player(segments: readonly Segment[]): Player {
  const groups = new Map<HTMLElement | SVGElement, Map<Prop, Segment[]>>();
  let total = 0;
  for (const s of segments) {
    if (!s.el) continue;
    const byProp = groups.get(s.el) ?? new Map<Prop, Segment[]>();
    groups.set(s.el, byProp);
    byProp.set(s.prop, [...(byProp.get(s.prop) ?? []), s]);
    total = Math.max(total, s.at + s.dur);
  }
  const span = Math.max(total, 1);
  let running: Animation[] = [];

  const write = (pick: (list: Segment[]) => string | number) =>
    groups.forEach((byProp, el) =>
      byProp.forEach((list, prop) => {
        (el.style as unknown as Record<string, string>)[camel(prop)] = String(pick(list));
      }),
    );
  const stop = () => {
    running.forEach((a) => a.cancel());
    running = [];
  };

  return {
    total,
    play() {
      stop();
      write((list) => list[0]!.from);
      if (prefersReducedMotion() || document.hidden) {
        write((list) => list[list.length - 1]!.to);
        return;
      }
      groups.forEach((byProp, el) =>
        byProp.forEach((unsorted, prop) => {
          if (typeof el.animate !== "function") return;
          const list = [...unsorted].sort((a, b) => a.at - b.at);
          const key = camel(prop);
          const frames: Keyframe[] = [{ offset: 0, [key]: String(list[0]!.from) }];
          let last: string | number = list[0]!.from;
          for (const s of list) {
            const a = s.at / span;
            if (String(s.from) !== String(last)) frames.push({ offset: a, [key]: String(last) });
            frames.push({ offset: a, [key]: String(s.from), easing: s.ease ?? EMPH });
            frames.push({ offset: Math.min(1, (s.at + s.dur) / span), [key]: String(s.to) });
            last = s.to;
          }
          frames.push({ offset: 1, [key]: String(last) });
          for (let i = 1; i < frames.length; i += 1) {
            if ((frames[i]!.offset ?? 0) < (frames[i - 1]!.offset ?? 0)) frames[i]!.offset = frames[i - 1]!.offset;
          }
          running.push(el.animate(frames, { duration: span, fill: "forwards" }));
        }),
      );
    },
    finish() {
      stop();
      write((list) => [...list].sort((a, b) => a.at - b.at)[list.length - 1]!.to);
    },
    cancel: stop,
  };
}

/**
 * The fingertip's walk to a target: it fades in where it starts, rests, walks over, presses, and a ripple
 * leaves the ring behind. Returns the segments and when the ring shows.
 */
export function walk(d: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }, at: number) {
  const wave = d.querySelector("i");
  d.style.left = "0px";
  d.style.top = "0px";
  const press = at + 1200;
  const segments: Segment[] = [
    { el: d, prop: "translate", from: `${from.x}px ${from.y}px`, to: `${from.x}px ${from.y}px`, at, dur: 1, ease: OUT },
    { el: d, prop: "opacity", from: 0, to: 1, at, dur: 200, ease: OUT },
    { el: d, prop: "translate", from: `${from.x}px ${from.y}px`, to: `${to.x}px ${to.y}px`, at: at + 300, dur: 900, ease: WALK },
    { el: d, prop: "scale", from: 1, to: 0.82, at: press, dur: 75, ease: EMPH },
    { el: d, prop: "scale", from: 0.82, to: 1, at: press + 75, dur: 75, ease: EMPH },
    { el: d, prop: "opacity", from: 1, to: 0, at: press + 600, dur: 150, ease: ACCEL },
  ];
  if (wave) {
    segments.push(
      { el: wave, prop: "scale", from: 1, to: 2.3, at: press + 150, dur: 300, ease: OUT },
      { el: wave, prop: "opacity", from: 0.45, to: 0, at: press + 150, dur: 300, ease: OUT },
    );
  }
  return { segments, press, ringAt: press + 150, end: press + 750 };
}

export function ringIn(r: HTMLElement, at: number): Segment[] {
  return [
    { el: r, prop: "opacity", from: 0, to: 1, at, dur: 200, ease: EMPH },
    { el: r, prop: "scale", from: 1.12, to: 1, at, dur: 200, ease: EMPH },
  ];
}

/** A pressed control darkens and comes back. */
export function pressBg(el: HTMLElement | null | undefined, at: number): Segment[] {
  if (!el) return [];
  return [
    { el, prop: "background-color", from: "rgba(0, 0, 0, 0)", to: "rgba(0, 0, 0, 0.08)", at, dur: 75, ease: EMPH },
    { el, prop: "background-color", from: "rgba(0, 0, 0, 0.08)", to: "rgba(0, 0, 0, 0)", at: at + 75, dur: 75, ease: EMPH },
  ];
}

/** A one-off animation that resolves when done (instantly with reduced motion). */
export function run(segments: readonly Segment[]): Promise<void> {
  const p = player(segments);
  p.play();
  return new Promise((resolve) => window.setTimeout(resolve, prefersReducedMotion() ? 0 : p.total));
}
