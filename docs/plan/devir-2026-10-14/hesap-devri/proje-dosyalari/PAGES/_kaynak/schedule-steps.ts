// PAGES: gestures a click cannot make (keys, double and right clicks, hover,
// pointer drags, clicks with Ctrl/Shift), for the Schedule scenarios
// (tools/sc/30-schedule.py). A step: { act, target, within?, to?, key?, ctrl?, shift?, hold? }.
//   act "key": a key press on target (or the focused element, else the page).
//   act "click" with ctrl/shift: a click carrying the modifier.
//   act "dblclick" | "context" | "hover": that mouse gesture on target.
//   act "drag": press on target, move to `to`, release (hold: stay pressed).
//   act "scroll": scrolls target into view (or by `to` = "x,y" pixels inside it).
// "{week+N}" in a target is this week's Monday plus N days (yyyy-mm-dd), so a
// scenario can name a weekday's cell in any week the atlas is opened.
import { addDays, mondayOf, todayIn } from "./mock/time";
export interface Gesture {
  readonly act: "key" | "click" | "dblclick" | "context" | "hover" | "drag" | "scroll";
  readonly target?: string;
  readonly within?: string;
  readonly to?: string;
  readonly key?: string;
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly hold?: boolean;
}

type Find = (target: string, within?: string) => Promise<HTMLElement | null>;
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

function centre(el: Element): { clientX: number; clientY: number } {
  const box = el.getBoundingClientRect();
  return { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
}

function mouse(el: Element, type: string, extra: MouseEventInit = {}): void {
  const init: PointerEventInit = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, buttons: 1, ...centre(el), ...extra };
  const Kind = type.startsWith("pointer") ? PointerEvent : MouseEvent;
  el.dispatchEvent(new Kind(type, type.startsWith("pointer") ? { pointerId: 1, pointerType: "mouse", isPrimary: true, ...init } : init));
}

export function weekDates(text: string): string {
  return text.replace(/\{week([+-]\d+)?\}/g, (_, shift) => addDays(mondayOf(todayIn("America/New_York")), Number(shift ?? 0)));
}

/** Runs one gesture; false when its target is missing (the caller says so). */
export async function runGesture(raw: Gesture, find: Find): Promise<boolean> {
  const step = { ...raw, target: raw.target && weekDates(raw.target), to: raw.to && weekDates(raw.to) };
  const mods = { ctrlKey: Boolean(step.ctrl), metaKey: false, shiftKey: Boolean(step.shift) };
  if (step.act === "key") {
    const el = step.target ? await find(step.target, step.within) : (document.activeElement as HTMLElement | null) ?? document.body;
    if (!el) return false;
    if (step.target) el.focus?.({ preventScroll: true });
    const init: KeyboardEventInit = { key: step.key ?? "Escape", code: step.key && step.key.length === 1 ? `Key${step.key.toUpperCase()}` : step.key, bubbles: true, cancelable: true, composed: true, ...mods };
    el.dispatchEvent(new KeyboardEvent("keydown", init));
    el.dispatchEvent(new KeyboardEvent("keyup", init));
    return true;
  }
  const el = step.target ? await find(step.target, step.within) : null;
  if (!el) return false;
  if (step.act !== "hover") el.scrollIntoView({ block: "center", inline: "center" });
  await pause(60);
  if (step.act === "scroll") {
    if (step.to) {
      const [x, y] = step.to.split(",").map(Number);
      el.scrollBy({ left: x ?? 0, top: y ?? 0 });
    }
    return true;
  }
  if (step.act === "click" && !step.ctrl && !step.shift) { el.click(); return true; }
  if (step.act === "click") {
    mouse(el, "pointerdown", mods); mouse(el, "mousedown", mods);
    mouse(el, "pointerup", { ...mods, buttons: 0 }); mouse(el, "mouseup", { ...mods, buttons: 0 });
    mouse(el, "click", { ...mods, buttons: 0, detail: 1 } as MouseEventInit);
    return true;
  }
  if (step.act === "dblclick") {
    mouse(el, "click", { buttons: 0, detail: 1 } as MouseEventInit);
    mouse(el, "click", { buttons: 0, detail: 2 } as MouseEventInit);
    mouse(el, "dblclick", { buttons: 0, detail: 2 } as MouseEventInit);
    return true;
  }
  if (step.act === "context") {
    mouse(el, "contextmenu", { button: 2, buttons: 2 });
    return true;
  }
  if (step.act === "hover") {
    for (const type of ["pointerover", "pointerenter", "mouseover", "mouseenter", "pointermove", "mousemove"]) mouse(el, type, { buttons: 0 });
    el.focus?.({ preventScroll: true });
    return true;
  }
  // drag
  const dest = step.to ? await find(step.to) : null;
  if (!dest) return false;
  // The drop is found under the pointer: the target sits mid-screen, away
  // from the edges where the grid scrolls by itself during a drag.
  dest.scrollIntoView({ block: "center", inline: "center" });
  await pause(60);
  const start = centre(el);
  mouse(el, "pointerdown", { ...mods, ...start });
  await pause(40);
  // The grid may scroll itself while the pointer moves (edge scrolling), so
  // the target's place is read again at every move and before the release.
  // The grid re-renders while dragging, so the target is looked up again each time.
  const fresh = (): Element => {
    let again: Element | null = null;
    try { again = step.to && !step.to.startsWith("text=") ? document.querySelector(step.to) : null; } catch { again = null; }
    return again ?? dest;
  };
  const move = (at: { clientX: number; clientY: number }) => window.dispatchEvent(new PointerEvent("pointermove",
    { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 1, ...mods, ...at }));
  for (let i = 1; i <= 6; i += 1) {
    const end = centre(fresh());
    move({ clientX: start.clientX + ((end.clientX - start.clientX) * i) / 6, clientY: start.clientY + ((end.clientY - start.clientY) * i) / 6 });
    await pause(30);
  }
  for (let i = 0; i < 3; i += 1) { move(centre(fresh())); await pause(40); }
  if (!step.hold) {
    const end = centre(fresh());
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: 0, ...mods, ...end }));
  }
  return true;
}
