// PAGES: the app runs twice on a PAGES page, once in a 1440-wide desktop
// frame and once in a 390-wide phone frame. The shell page around them relays
// messages, so both frames show the same demo data and the same address.
// Data travels whole (one store at a time) and is copied into the existing
// objects, so modules that hold a reference to them see the change.
import { screenParams } from "./pages";

type Body =
  | { kind: "store"; name: string; data: unknown }
  | { kind: "route"; path: string; transient?: boolean; final?: boolean; ok?: boolean; moved?: boolean }
  | { kind: "reset" };
type Message = Body & { nf: "pages" };

const frame = screenParams().get("frame") ?? "solo";
const inShell = frame !== "solo" && window.parent !== window;
const appliers = new Map<string, (data: unknown) => void>();
const routeListeners = new Set<(path: string) => void>();
let applying = false;
let afterApply: () => void = () => {};

export function post(message: Body): void {
  if (!inShell || applying) return;
  try {
    // An address passed through while this frame's steps run is only on the way (holdRoutes).
    // So is the address a frame shows before its steps start (expectSteps): a frame
    // that loads late must not pull back the other frame that has already finished.
    const sent = message.kind === "route" && (stepsRunning || stepsPending) && !message.final ? { ...message, transient: true } : message;
    window.parent.postMessage({ ...sent, nf: "pages", from: frame }, "*");
  } catch {
    // A copy that cannot be cloned is not sent; the other frame keeps its own.
  }
}

/** Copies `next` into `target` in place: same objects and arrays, new contents. */
export function copyInto(target: unknown, next: unknown): unknown {
  if (target === next) return target;
  if (Array.isArray(target) && Array.isArray(next)) {
    // The seed may hand back the very arrays the store already holds.
    const items = [...next];
    target.length = 0;
    target.push(...items);
    return target;
  }
  if (target && next && typeof target === "object" && typeof next === "object" && !Array.isArray(next)) {
    const into = target as Record<string, unknown>;
    for (const key of Object.keys(into)) if (!(key in (next as object))) delete into[key];
    for (const [key, value] of Object.entries(next as Record<string, unknown>)) {
      const old = into[key];
      into[key] = old && typeof old === "object" && value && typeof value === "object" && Array.isArray(old) === Array.isArray(value)
        ? copyInto(old, value)
        : value;
    }
    return into;
  }
  return next;
}

/** A store says how incoming data replaces its own. */
export function onStore(name: string, apply: (data: unknown) => void): void {
  appliers.set(name, apply);
}

export function onRoute(listener: (path: string) => void): () => void {
  routeListeners.add(listener);
  return () => routeListeners.delete(listener);
}

/** What runs after the other frame's data arrives (refetch every query). */
export function setAfterApply(run: () => void): void {
  afterApply = run;
}

let resetHandler: () => void = () => {};
export function onReset(run: () => void): void {
  resetHandler = run;
}

if (inShell) {
  window.addEventListener("message", (event) => {
    const message = event.data as Message | null;
    if (!message || message.nf !== "pages") return;
    if (message.kind === "store") {
      const apply = appliers.get(message.name);
      if (!apply) return;
      applying = true;
      try { apply(message.data); } finally { applying = false; }
      afterApply();
    } else if (message.kind === "route") {
      // The other frame's steps: only where they end counts; while this frame's own
      // steps run, that end waits (holdRoutes).
      if (message.transient) return;
      const end = { path: message.path, ok: message.ok !== false, moved: message.moved === true };
      if (stepsRunning) {
        if (message.final) heldRoute = end;
        return;
      }
      // This frame's own steps are over: the other frame's end leads only if it is the better one.
      if (message.final && ownEnd && !leads(end, ownEnd)) return;
      applying = true;
      try { routeListeners.forEach((listener) => listener(message.path)); } finally { applying = false; }
    } else if (message.kind === "reset") {
      resetHandler();
    }
  });
}

/**
 * Both frames run a scenario's steps. While they run, neither moves the other:
 * a frame a step behind is not pushed past its own steps, and the two never
 * bounce between addresses. When its steps end, a frame sends where it ended;
 * the other follows that once its own steps are done, unless its own went
 * through and the sender's did not (`ok`: no step went missing).
 */
let stepsRunning = false;
let stepsPending = false;
type End = { path: string; ok: boolean; moved: boolean };
let heldRoute: End | null = null;
let ownEnd: Omit<End, "path"> | null = null;
let startPath = "";
/**
 * Which end the frames settle on: one where every step went through, then one
 * whose steps moved the address (a step the other frame could only pass by,
 * like the phone's section select, leaves that frame where it was).
 */
const leads = (a: Omit<End, "path">, b: Omit<End, "path">) => (a.ok && !b.ok) || (a.ok === b.ok && a.moved && !b.moved);
/** This frame's scenario has steps that start shortly (main.tsx). */
export function expectSteps(): void {
  stepsPending = true;
}
export function holdRoutes(on: boolean, ok = true): void {
  stepsRunning = on;
  stepsPending = false;
  const path = (window as { __pagesPath?: string }).__pagesPath ?? "";
  if (on) { startPath = path; ownEnd = null; return; }
  ownEnd = { ok, moved: path !== startPath };
  const held = heldRoute;
  heldRoute = null;
  if (held && leads(held, ownEnd)) {
    applying = true;
    try { routeListeners.forEach((listener) => listener(held.path)); } finally { applying = false; }
    return;
  }
  if (path) post({ kind: "route", path, final: true, ok, moved: ownEnd.moved });
}

export const isFrame = inShell;
export const frameName = frame;
