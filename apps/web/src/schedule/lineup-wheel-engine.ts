import {
  WHEEL,
  crossedEdge,
  easeInOut,
  easeOut,
  flingTarget,
  releaseVelocity,
  seekDuration,
} from "./lineup-wheel";

// The day wheel's motion (E · Çark tarih, Mert 2026-10-17; mockup v-e.js mount()). One float position, the day
// index at the middle, drawn every frame while it moves: a drag follows the finger, a release spins on and
// slows to a whole day, a tap or an arrow key turns to that day, a month change holds the wheel 60 ms. The
// cells are the wheel's buttons in index order (-span … span). React renders them once; this moves them.

export interface WheelEngine {
  /** Turn to the day `index` (animated unless the person asked for less motion). */
  seek(index: number): void;
  /** Turn one day from where the wheel is going. */
  step(delta: number): void;
  destroy(): void;
}

interface Options {
  readonly start: number;
  readonly span: number;
  readonly edges: readonly number[];
  /** How many days the strip shows at once: 7 on a phone, 15 on the desktop Lineup (F, Mert 2026-10-19). */
  readonly visible?: number;
  /** The wheel stopped on a day. */
  readonly onStill: (index: number) => void;
  /** The day at the middle changed while it moves. */
  readonly onMiddle: (index: number) => void;
}

type Anim = { from: number; to: number; t0: number; T: number; ease: (t: number) => number; last: number | null };
type Drag = {
  x0: number;
  x: number;
  pos0: number;
  moved: boolean;
  caught: boolean;
  last: number | null;
  samples: [number, number][];
  target: HTMLElement | null;
  wheel: boolean;
};

const reducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function mountWheel(box: HTMLElement, track: HTMLElement, options: Options): WheelEngine {
  const { span, edges, onStill, onMiddle } = options;
  const cells = track.children as HTMLCollectionOf<HTMLElement>;
  const frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame : null;
  const visible = options.visible ?? 7;
  let width = box.clientWidth / visible;
  let pos = options.start;
  let raf = 0;
  let anim: Anim | null = null;
  let drag: Drag | null = null;
  let held = 0;
  let shown: number | null = null;
  let selected: number | null = null;
  let quiet = 0;
  let alive = true;
  const clamp = (index: number) => Math.max(-span, Math.min(span, index));

  function bump() {
    box.classList.remove("is-bump");
    void box.offsetWidth;
    box.classList.add("is-bump");
    try {
      navigator.vibrate?.(6);
    } catch {
      // A phone that won't buzz still holds.
    }
  }

  function show(p: number) {
    // On whole device pixels and a 2D move: a stopped strip half a pixel off draws its days soft.
    const ratio = window.devicePixelRatio || 1;
    track.style.transform = `translateX(${Math.round((3 * width - (p + span) * width) * ratio) / ratio}px)`;
    const middle = Math.round(p);
    for (let index = Math.max(-span, middle - 6); index <= Math.min(span, middle + 6); index++) {
      const cell = cells[index + span];
      if (!cell) continue;
      const distance = Math.abs(index - p);
      cell.style.setProperty("--s", (1 + 0.12 * Math.max(0, 1 - distance)).toFixed(3));
      cell.style.opacity = Math.max(0.3, 1 - 0.16 * Math.max(0, distance - 1)).toFixed(2);
    }
    if (middle !== shown) {
      shown = middle;
      onMiddle(middle);
    }
  }

  function mark(index: number | null) {
    if (selected !== null && selected !== index) {
      const old = cells[selected + span];
      if (old) {
        old.classList.remove("is-selected");
        old.setAttribute("aria-pressed", "false");
        old.tabIndex = -1;
      }
    }
    selected = index;
    if (index === null) return;
    const cell = cells[index + span];
    if (!cell) return;
    cell.classList.add("is-selected");
    cell.setAttribute("aria-pressed", "true");
    cell.tabIndex = 0;
  }

  function still(index: number) {
    pos = index;
    anim = null;
    box.classList.add("is-still");
    mark(index);
    show(index);
    onStill(index);
  }

  function moving() {
    box.classList.remove("is-still");
    const cell = selected === null ? null : cells[selected + span];
    cell?.classList.remove("is-selected");
  }

  function loop(now: number) {
    raf = 0;
    if (!alive || !box.isConnected) return;
    if (anim) {
      if (now < held) {
        go();
        return;
      }
      const t = Math.min(1, (now - anim.t0) / anim.T);
      const p = anim.from + (anim.to - anim.from) * anim.ease(t);
      const edge = crossedEdge(pos, p, edges);
      if (edge !== null && edge !== anim.last) {
        // The month detent: hold on the edge, then carry on where it left off.
        anim.last = edge;
        held = now + WHEEL.hold;
        anim.t0 += WHEEL.hold;
        pos = edge;
        show(pos);
        bump();
        go();
        return;
      }
      pos = p;
      show(pos);
      if (t >= 1) {
        still(Math.round(pos));
        return;
      }
    } else if (drag && now >= held) {
      const want = drag.pos0 - (drag.x - drag.x0) / width;
      const edge = crossedEdge(pos, want, edges);
      if (edge !== null && edge !== drag.last) {
        drag.last = edge;
        held = now + WHEEL.hold;
        pos = edge;
        drag.caught = false;
        bump();
      } else {
        pos += (want - pos) * (drag.caught ? 1 : 0.4);
        if (Math.abs(want - pos) < 0.01) drag.caught = true;
      }
      if (edge === null) drag.last = null;
      pos = clamp(pos);
      show(pos);
    }
    if (anim || drag) go();
  }

  function go() {
    if (!raf && frame) raf = frame(loop);
  }

  function animate(to: number, T: number, ease: (t: number) => number) {
    to = clamp(to);
    if (reducedMotion() || !frame) {
      still(to);
      return;
    }
    moving();
    anim = { from: pos, to, t0: performance.now(), T, ease, last: null };
    go();
  }

  function seek(index: number) {
    index = clamp(Math.round(index));
    if (index === Math.round(pos) && !anim && !drag) {
      if (index !== selected) still(index);
      return;
    }
    animate(index, seekDuration(index - pos), easeInOut);
  }

  function fling(velocity: number) {
    const { to, duration } = flingTarget(pos, velocity, span);
    if (Math.abs(to - pos) < 0.02) {
      still(to);
      return;
    }
    animate(to, duration, easeOut);
  }

  const onWheel = (event: WheelEvent) => {
    // A touchpad's two-finger swipe (and Shift + wheel) moves it like a finger; quiet settles it on a day.
    let dx = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    if (!dx) return;
    event.preventDefault();
    if (event.deltaMode === 1) dx *= 16;
    else if (event.deltaMode === 2) dx *= box.clientWidth;
    if (!drag?.wheel) {
      anim = null;
      moving();
      drag = { x0: 0, x: 0, pos0: pos, moved: true, caught: false, last: null, samples: [], target: null, wheel: true };
    }
    drag.x = Math.max((drag.pos0 - span) * width, Math.min((drag.pos0 + span) * width, drag.x - dx));
    if (reducedMotion() || !frame) {
      pos = clamp(drag.pos0 - drag.x / width);
      show(pos);
    }
    go();
    window.clearTimeout(quiet);
    quiet = window.setTimeout(() => {
      if (!drag?.wheel) return;
      const to = clamp(Math.round(drag.pos0 - drag.x / width));
      drag = null;
      animate(to, Math.max(200, 160 * Math.abs(to - pos) + 160), easeOut);
    }, WHEEL.wheelIdle);
  };

  const onDown = (event: PointerEvent) => {
    if (event.button) return;
    anim = null;
    moving();
    drag = {
      x0: event.clientX,
      x: event.clientX,
      pos0: pos,
      moved: false,
      caught: true,
      last: null,
      samples: [[event.timeStamp, event.clientX]],
      target: (event.target as Element | null)?.closest?.<HTMLElement>(".lineup-wheel-day") ?? null,
      wheel: false,
    };
    try {
      box.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer can't be captured; the drag still works inside the box.
    }
    go();
  };

  const onMove = (event: PointerEvent) => {
    if (!drag || drag.wheel) return;
    drag.x = event.clientX;
    if (Math.abs(drag.x - drag.x0) > 6) drag.moved = true;
    drag.samples.push([event.timeStamp, event.clientX]);
    if (drag.samples.length > 16) drag.samples.shift();
  };

  const onUp = (event: PointerEvent) => {
    if (!drag || drag.wheel) return;
    const ended = drag;
    drag = null;
    if (!ended.moved) {
      if (ended.target) seek(Number(ended.target.dataset.i));
      else still(Math.round(pos));
      return;
    }
    fling(releaseVelocity(ended.samples, event.timeStamp, width));
  };

  // Enter and Space on a focused day arrive as a click with no pointer behind it.
  const onClick = (event: MouseEvent) => {
    const cell = (event.target as Element | null)?.closest?.<HTMLElement>(".lineup-wheel-day");
    if (cell && event.detail === 0) seek(Number(cell.dataset.i));
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const to = clamp(Math.round(anim ? anim.to : pos) + (event.key === "ArrowRight" ? 1 : -1));
    seek(to);
    cells[to + span]?.focus({ preventScroll: true });
  };

  box.addEventListener("wheel", onWheel, { passive: false });
  box.addEventListener("pointerdown", onDown);
  box.addEventListener("pointermove", onMove);
  box.addEventListener("pointerup", onUp);
  box.addEventListener("pointercancel", onUp);
  box.addEventListener("click", onClick);
  box.addEventListener("keydown", onKey);
  // A day stays its share of the strip when the window changes (a phone turned, a browser narrowed).
  const resized = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => {
        const next = box.clientWidth / visible;
        if (next && Math.abs(next - width) > 0.5) {
          width = next;
          show(pos);
        }
      })
    : null;
  resized?.observe(box);

  box.classList.add("is-still");
  mark(pos);
  show(pos);

  return {
    seek,
    step: (delta) => seek(Math.round(anim ? anim.to : pos) + delta),
    destroy() {
      alive = false;
      if (raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
      window.clearTimeout(quiet);
      resized?.disconnect();
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("pointerdown", onDown);
      box.removeEventListener("pointermove", onMove);
      box.removeEventListener("pointerup", onUp);
      box.removeEventListener("pointercancel", onUp);
      box.removeEventListener("click", onClick);
      box.removeEventListener("keydown", onKey);
    },
  };
}
