// PAGES: the app runs twice on a PAGES page, once in a 1440-wide desktop
// frame and once in a 390-wide phone frame. The shell page around them relays
// messages, so both frames show the same demo data and the same address.
// Data travels whole (one store at a time) and is copied into the existing
// objects, so modules that hold a reference to them see the change.
import { screenParams } from "./pages";

type Body =
  | { kind: "store"; name: string; data: unknown }
  | { kind: "route"; path: string }
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
    window.parent.postMessage({ ...message, nf: "pages", from: frame }, "*");
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
      applying = true;
      try { routeListeners.forEach((listener) => listener(message.path)); } finally { applying = false; }
    } else if (message.kind === "reset") {
      resetHandler();
    }
  });
}

export const isFrame = inShell;
export const frameName = frame;
